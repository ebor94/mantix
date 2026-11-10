/**
 * h360/services/desinfecciones.service.js
 *
 * La regla dura del módulo de desinfecciones: un vehículo con una desinfección
 * vencida no puede seguir asignándose a homenajes. Acá vive esa regla y el
 * aviso que la acompaña; el cron (h360/jobs/desinfecciones.job.js) solo llama
 * a `ejecutarBarridoDiario()`.
 *
 * Toda la lógica está en el servicio y no en el job a propósito: el barrido se
 * tiene que poder correr a mano (y probar) sin esperar la medianoche. Un job
 * que trae la lógica adentro solo se puede verificar en producción.
 *
 * ── Fechas ────────────────────────────────────────────────────────────────
 * El pool de MySQL de este proyecto NO tiene `dateStrings`, así que un DATE
 * vuelve como objeto Date y Express lo serializa en UTC: en Colombia (UTC-5)
 * eso corre el día hacia atrás y una desinfección del 10 se lee como 9. Por eso
 * acá:
 *   · las fechas que salen se formatean EN SQL con DATE_FORMAT,
 *   · «ya venció» se compara con CURDATE() en SQL y nunca con una fecha armada
 *     en JavaScript — el reloj de node y el de MySQL pueden estar en zonas
 *     distintas, y acá la diferencia es inhabilitar un vehículo un día antes,
 *   · la ventana de aviso se calcula con DATE_ADD(CURDATE(), INTERVAL ? DAY).
 * Nada de recortar ISOs con slice(0,10).
 */
const db    = require('../config/db')
const gchat = require('./googleChat.service')

// Quién aparece como responsable de la baja automática. No es un usuario de
// LDAP: sirve para que la pantalla pueda distinguir «lo bajó el sistema» de
// «lo bajó alguien», que es lo que habilita volver a subirlo solo.
const ACTOR = 'sistema'

/**
 * Días de anticipación del aviso.
 *
 * Se lee dentro de la llamada y no en una constante de módulo: si este archivo
 * llegara a requerirse antes de que dotenv termine, la constante quedaría
 * congelada en el default para toda la vida del proceso.
 *
 * Un valor absurdo (0, negativo, texto, 900) cae al default en vez de romper el
 * aviso: con 900 el mensaje diario traería el parque completo y nadie lo leería.
 */
function diasAviso() {
  const n = Number(process.env.DESINF_AVISO_DIAS)
  return Number.isInteger(n) && n > 0 && n <= 60 ? n : 3
}

/**
 * 'YYYY-MM-DD' → 'DD/MM/YYYY', partiendo el texto y sin construir un Date.
 *
 * Es deliberado: pasar por `new Date('2026-11-10')` lo interpreta como UTC
 * medianoche y cualquier formateo local devuelve el 9. Lo que entra acá ya
 * viene formateado por SQL, así que alcanza con reordenar.
 */
function aDdMmAaaa(valor) {
  if (valor == null || valor === '') return ''
  const t = String(valor)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  // Red de seguridad: si algún día alguien agrega una consulta sin DATE_FORMAT
  // y acá llega un Date, se formatea en la zona del negocio y no en UTC.
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(valor)
  }
  return t
}

/** Hoy en la zona del negocio, solo para el encabezado del mensaje. */
function hoyBogota() {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date())
}

/**
 * El motivo que queda escrito en el vehículo.
 *
 * Dice qué venció y desde cuándo porque es el texto que ve quien abre el
 * tablero y tiene que decidir qué hacer. «Inhabilitado por desinfección» a
 * secas obliga a ir a buscar en otra pantalla cuál de las tres actividades es.
 * Se topa en 200 porque es el ancho de vehiculos.inactivo_motivo: un texto más
 * largo lo truncaría MySQL (o lo rechazaría en modo estricto).
 */
function motivoInhabilitacion(actividad, fechaProx) {
  const base = `Vencimiento de desinfección: ${actividad || 'desinfección programada'}`
  const txt  = fechaProx ? `${base}, vencida desde el ${aDdMmAaaa(fechaProx)}` : base
  return txt.slice(0, 200)
}

// ── El barrido nocturno ─────────────────────────────────────────────────────

/**
 * Pasa a VENCIDA lo que se le pasó la fecha e inhabilita los vehículos
 * afectados.
 *
 * Todo en UNA transacción: si la baja de los vehículos falla a mitad, las
 * programaciones no pueden quedar marcadas como vencidas con los carros
 * todavía en servicio. Ese estado intermedio es el peor de los tres, porque la
 * pantalla diría «vencida» y el despacho seguiría asignando el vehículo.
 *
 * @returns {Promise<{vencidas:number, vehiculos_inhabilitados:Array<{placa:string,actividad:string,fecha_prox:string}>}>}
 */
async function barrerVencidas() {
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()

    // 1. Lo que ya se pasó de fecha. La comparación es con CURDATE() de MySQL:
    //    «< CURDATE()» y no «<=» porque lo que vence hoy todavía se puede
    //    ejecutar hoy — se avisa, no se castiga.
    const [marcadas] = await conn.query(
      `UPDATE h360_desinf_programacion
          SET estado = 'VENCIDA'
        WHERE estado = 'PROGRAMADA'
          AND fecha_prox IS NOT NULL
          AND fecha_prox < CURDATE()`)
    const vencidas = Number(marcadas?.affectedRows || 0)

    // 2. Los vehículos que quedaron con al menos una VENCIDA y siguen ACTIVOS.
    //
    //    El filtro es `v.activo = 1`, y eso resuelve de un golpe los dos casos
    //    delicados:
    //      · el carro que está abajo por un choque (inactivo_origen = 'MANUAL')
    //        no entra, así que el job no le pisa el motivo: si está abajo por
    //        un choque, el motivo que importa es el choque;
    //      · el que ya está abajo por desinfección tampoco entra, y por eso el
    //        job es idempotente aunque corra todas las noches: no reescribe
    //        inactivo_at ni mueve la fecha de la baja original.
    //    Se filtra por `activo` y no por `inactivo_origen <> 'MANUAL'` porque
    //    el origen de una baja vieja puede seguir escrito en un vehículo que ya
    //    volvió a servicio, y eso lo dejaría exento para siempre.
    //
    //    Ordenado por fecha_prox ascendente para que la primera fila de cada
    //    vehículo sea la actividad MÁS vencida: es la que se nombra en el
    //    motivo. Si tiene tres vencidas, la que explica mejor por qué está
    //    abajo es la más vieja.
    const [candidatos] = await conn.query(
      `SELECT v.id                                  AS vehiculo_id,
              v.placa                               AS placa,
              v.tipo                                AS tipo,
              a.nombre                              AS actividad,
              DATE_FORMAT(p.fecha_prox, '%Y-%m-%d') AS fecha_prox
         FROM h360_desinf_programacion p
         JOIN vehiculos v              ON v.id = p.vehiculo_id
         JOIN h360_desinf_regla r      ON r.id = p.regla_id
         JOIN h360_desinf_actividad a  ON a.id = r.actividad_id
        WHERE p.estado = 'VENCIDA'
          AND v.activo = 1
        ORDER BY v.placa, p.fecha_prox ASC, a.nombre ASC`)

    const inhabilitados = []
    const yaVisto = new Set()

    for (const c of (candidatos || [])) {
      if (yaVisto.has(c.vehiculo_id)) continue   // ya se bajó por su vencida más vieja
      yaVisto.add(c.vehiculo_id)

      const motivo = motivoInhabilitacion(c.actividad, c.fecha_prox)

      // `AND activo = 1` otra vez en el UPDATE, no por gusto: entre el SELECT
      // y este UPDATE alguien pudo bajar el vehículo a mano. Con la guarda, esa
      // carrera termina en 0 filas afectadas en vez de en un motivo pisado.
      const [r] = await conn.query(
        `UPDATE vehiculos
            SET activo          = 0,
                inactivo_origen = 'DESINFECCION',
                inactivo_motivo = ?,
                inactivo_at     = NOW(),
                inactivo_por    = ?
          WHERE id = ? AND activo = 1`,
        [motivo, ACTOR, c.vehiculo_id])

      if (Number(r?.affectedRows || 0) > 0) {
        inhabilitados.push({ placa: c.placa, tipo: c.tipo, actividad: c.actividad, fecha_prox: c.fecha_prox })
      }
    }

    await conn.commit()
    return { vencidas, vehiculos_inhabilitados: inhabilitados }
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

// ── Lo que hay que avisar ───────────────────────────────────────────────────

// Mismo encabezado para las tres consultas de programación: lo único que
// cambia es el WHERE. La fecha sale formateada desde SQL (ver nota de fechas).
const SELECT_PROGRAMACION = `
  SELECT v.placa                                AS placa,
         v.tipo                                 AS tipo,
         a.nombre                               AS actividad,
         DATE_FORMAT(p.fecha_prox, '%Y-%m-%d')  AS fecha
    FROM h360_desinf_programacion p
    JOIN vehiculos v              ON v.id = p.vehiculo_id
    JOIN h360_desinf_regla r      ON r.id = p.regla_id
    JOIN h360_desinf_actividad a  ON a.id = r.actividad_id`

/**
 * Qué hay que avisar hoy. NO modifica nada: se puede llamar desde un endpoint
 * de consulta sin miedo.
 *
 * `proximas` (las que vencen dentro de los próximos N días) no es un adorno.
 * Con la regla dura, el vehículo se cae a medianoche y el único aviso previo es
 * un popup que arranca a las 5 pm del mismo día: si esa noche nadie abre la
 * app, el turno de la mañana amanece con una carroza menos y sin haber visto
 * nada venir. El aviso anticipado convierte la inhabilitación en consecuencia
 * de un descuido y no en una sorpresa.
 *
 * @returns {Promise<{vencen_hoy:Array,vencidas:Array,proximas:Array,inhabilitados:Array}>}
 */
async function resumenDiario() {
  const dias = diasAviso()

  // Lo que vence hoy: todavía se puede ejecutar, por eso va separado de las
  // vencidas. Es el aviso más urgente del mensaje.
  const [vencenHoy] = await db.query(
    `${SELECT_PROGRAMACION}
      WHERE p.estado = 'PROGRAMADA'
        AND p.fecha_prox = CURDATE()
        AND v.activo = 1
      ORDER BY v.placa, a.nombre`)

  // Las vencidas incluyen los vehículos ya inhabilitados: la deuda sigue ahí
  // hasta que se registre la desinfección, y el aviso tiene que recordarla.
  const [vencidasList] = await db.query(
    `${SELECT_PROGRAMACION}
      WHERE p.estado = 'VENCIDA'
      ORDER BY p.fecha_prox ASC, v.placa`)

  // La ventana se calcula en SQL, con el CURDATE() de MySQL, por la misma razón
  // que el barrido: una ventana armada en node puede estar corrida un día.
  const [proximas] = await db.query(
    `${SELECT_PROGRAMACION}
      WHERE p.estado = 'PROGRAMADA'
        AND p.fecha_prox > CURDATE()
        AND p.fecha_prox <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        AND v.activo = 1
      ORDER BY p.fecha_prox ASC, v.placa`,
    [dias])

  // Los que están abajo por desinfección. La actividad sale de su vencida más
  // vieja: el motivo guardado ya la nombra, pero devolverla aparte deja que
  // quien consuma esto la muestre sin tener que parsear un texto.
  const [inhabilitados] = await db.query(
    `SELECT v.placa                                  AS placa,
            v.tipo                                   AS tipo,
            v.inactivo_motivo                        AS motivo,
            DATE_FORMAT(v.inactivo_at, '%Y-%m-%d')   AS fecha,
            (SELECT a.nombre
               FROM h360_desinf_programacion p
               JOIN h360_desinf_regla r     ON r.id = p.regla_id
               JOIN h360_desinf_actividad a ON a.id = r.actividad_id
              WHERE p.vehiculo_id = v.id AND p.estado = 'VENCIDA'
              ORDER BY p.fecha_prox ASC
              LIMIT 1)                               AS actividad
       FROM vehiculos v
      WHERE v.activo = 0
        AND v.inactivo_origen = 'DESINFECCION'
      ORDER BY v.inactivo_at DESC, v.placa`)

  return {
    vencen_hoy:    vencenHoy     || [],
    vencidas:      vencidasList  || [],
    proximas:      proximas      || [],
    inhabilitados: inhabilitados || [],
    dias_aviso:    dias,
  }
}

// ── El aviso ────────────────────────────────────────────────────────────────

function lineaProgramacion(x) {
  const tipo = x.tipo ? ` (${x.tipo})` : ''
  return `• ${x.placa}${tipo} — ${x.actividad || 'desinfección'} · ${aDdMmAaaa(x.fecha)}`
}

function lineaInhabilitado(x) {
  const tipo = x.tipo ? ` (${x.tipo})` : ''
  const act  = x.actividad ? ` — ${x.actividad}` : ''
  return `• ${x.placa}${tipo}${act} · abajo desde ${aDdMmAaaa(x.fecha)}`
}

/**
 * Compone y manda UN SOLO mensaje al espacio de avisos operativos.
 *
 * Un mensaje con secciones y no cinco mensajes: un canal que manda cinco
 * avisos cada mañana se silencia en una semana, y el día que de verdad importe
 * nadie lo va a estar mirando.
 *
 * Y si no hay nada que avisar NO manda nada. Un «todo al día» diario entrena
 * igual de bien a ignorar el canal: el valor del aviso está en que su presencia
 * signifique algo.
 *
 * @param {object} [resumen] el resultado de resumenDiario(); si no se pasa, lo consulta.
 * @returns {Promise<{enviado:boolean, texto?:string, ok?:boolean}>}
 */
async function avisar(resumen) {
  const r = resumen || await resumenDiario()

  const inhabilitados = r.inhabilitados || []
  const vencidas      = r.vencidas      || []
  const vencenHoy     = r.vencen_hoy    || []
  const proximas      = r.proximas      || []

  if (!inhabilitados.length && !vencidas.length && !vencenHoy.length && !proximas.length) {
    return { enviado: false, motivo: 'nada que avisar' }
  }

  // Orden por urgencia: primero lo que ya tiene consecuencia operativa (hay
  // carros abajo), al final lo que todavía se puede evitar.
  const partes = [`*Desinfecciones — ${hoyBogota()}*`]

  if (inhabilitados.length) {
    partes.push(
      `\n*Vehículos inhabilitados (${inhabilitados.length})*\n` +
      inhabilitados.map(lineaInhabilitado).join('\n'))
  }
  if (vencidas.length) {
    partes.push(
      `\n*Vencidas sin registrar (${vencidas.length})*\n` +
      vencidas.map(lineaProgramacion).join('\n'))
  }
  if (vencenHoy.length) {
    partes.push(
      `\n*Vencen hoy (${vencenHoy.length})*\n` +
      vencenHoy.map(lineaProgramacion).join('\n') +
      '\nSe pueden registrar hoy: a medianoche el vehículo queda inhabilitado.')
  }
  if (proximas.length) {
    const dias = r.dias_aviso || diasAviso()
    partes.push(
      `\n*Próximas (${dias} días) (${proximas.length})*\n` +
      proximas.map(lineaProgramacion).join('\n'))
  }

  const texto = partes.join('\n')
  const envio = await gchat.enviarOperaciones(texto)
  return { enviado: true, ok: envio?.ok === true, texto }
}

// ── La orquestación que llama el cron ───────────────────────────────────────

/**
 * Barrido + resumen + aviso, en ese orden. Es lo único que llama el job.
 *
 * NUNCA lanza: loguea y sigue. Cada paso va en su propio try porque los tres
 * sirven por separado — si el barrido falla (y quedó revertido), el resumen
 * todavía puede avisar que hay cosas vencidas, que es justo la noche en la que
 * más falta hace. Y una excepción que suba de acá tumbaría el proceso: node no
 * tiene a nadie escuchando detrás de un callback de cron.
 */
async function ejecutarBarridoDiario() {
  const salida = { barrido: null, resumen: null, aviso: null, errores: [] }

  try {
    salida.barrido = await barrerVencidas()
    console.log(`[desinfecciones] barrido: ${salida.barrido.vencidas} programaciones vencidas, ` +
                `${salida.barrido.vehiculos_inhabilitados.length} vehículos inhabilitados`)
  } catch (err) {
    salida.errores.push({ paso: 'barrerVencidas', mensaje: err?.message })
    console.error('[desinfecciones] barrerVencidas falló:', err?.message)
  }

  try {
    salida.resumen = await resumenDiario()
  } catch (err) {
    salida.errores.push({ paso: 'resumenDiario', mensaje: err?.message })
    console.error('[desinfecciones] resumenDiario falló:', err?.message)
  }

  // Sin resumen no hay nada que componer: no se manda un aviso a medias.
  if (salida.resumen) {
    try {
      salida.aviso = await avisar(salida.resumen)
    } catch (err) {
      salida.errores.push({ paso: 'avisar', mensaje: err?.message })
      console.error('[desinfecciones] avisar falló:', err?.message)
    }
  }

  return salida
}

module.exports = {
  barrerVencidas,
  resumenDiario,
  avisar,
  ejecutarBarridoDiario,
  // Expuestos para pruebas y para que el controlador pueda reusar el formato
  // sin volver a escribir la trampa de fechas.
  _internos: { aDdMmAaaa, motivoInhabilitacion, diasAviso },
}
