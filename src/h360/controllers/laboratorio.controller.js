/**
 * laboratorio.controller.js — Seguimiento y control del aseo y la desinfección
 * del laboratorio. Reemplaza el cuadro que se llevaba a mano con qué actividad
 * toca cada día, cada sábado o cada quince días.
 *
 * Hermano del módulo de vehículos (`desinfecciones.controller.js`) pero con
 * tablas propias (`h360_lab_*`) y otra naturaleza de periodicidad: allá es
 * «cada N días con fecha planeada a mano»; acá es «todos los días», «los
 * sábados», «cada N días» o «cada vez que pase un evento». Las razones están en
 * `src/scripts/h360_laboratorio_migration.sql`.
 *
 * ── Lo que no se puede romper acá ─────────────────────────────────────────
 *
 * 1. EL TABLERO DISPARA EL CIERRE Y DESPUÉS LA GENERACIÓN. Los dos, no solo el
 *    segundo. La lista del día se materializa en `h360_lab_tarea` y la generan
 *    dos disparadores: el cron de las 00:05 y la primera consulta del tablero.
 *    El segundo existe para cubrir que el primero no haya corrido —servidor
 *    caído, despliegue a medianoche—, y si en ese caso solo generara, las
 *    diarias de ayer se quedarían PENDIENTE para siempre: el incumplimiento no
 *    se escribe nunca y el informe de cumplimiento mentiría A FAVOR NUESTRO,
 *    que en una auditoría sanitaria es el peor de los dos errores posibles.
 *    La pantalla se vería bien y el dato quedaría mal.
 *
 * 2. TODA FECHA QUE SALE EN UNA RESPUESTA VA FORMATEADA EN SQL con
 *    `DATE_FORMAT(x, '%Y-%m-%d')`. El pool NO tiene `dateStrings`: un DATE
 *    devuelto crudo sale como objeto, Express lo serializa en UTC y en Colombia
 *    (UTC-5) la pantalla muestra el día anterior. Acá no se recorta ningún ISO
 *    en JS y no se toca `config/db.js`. Por la misma razón ninguna consulta de
 *    este archivo trae `created_at` ni `updated_at`: no hacen falta en la
 *    pantalla y son TIMESTAMP, o sea el mismo problema.
 *
 * 3. `fecha_esperada` Y `dias_atraso` NO SON COLUMNAS de `h360_lab_tarea`. La
 *    tabla llama `fecha` a la primera; la segunda se calcula con DATEDIFF. Se
 *    arman en la consulta, nunca en JavaScript.
 *
 * 4. LA VALIDACIÓN DE LAS REGLAS SE ADELANTA AL CHECK. `ck_lab_regla_dia_semana`
 *    y `ck_lab_regla_cada_dias` ya impiden que una SEMANAL quede sin día o una
 *    CADA_N_DIAS sin período —que es el estado en que el generador no sabe qué
 *    hacer y la actividad desaparece del tablero sin que nadie lo note—, pero un
 *    500 de MySQL es un peor mensaje que un 400 que diga qué campo falta.
 *
 * 5. LA EVIDENCIA FOTOGRÁFICA LA GUARDA EL SERVICIO DE VEHÍCULOS, REUSADO. No
 *    se duplica: está acoplado al `id` de un registro y a una ruta en disco, no
 *    a la tabla de vehículos. Lo único que hay que decirle es A QUÉ TABLA
 *    escribe —`h360_lab_evidencia`, espejo exacto de `h360_desinf_evidencia`—,
 *    porque sin eso la foto del laboratorio queda colgada del registro del
 *    VEHÍCULO que tenga el mismo id.
 *
 * ── De dónde sale el reloj ─────────────────────────────────────────────────
 * De `../utils/fecha_hora`, que es el hogar designado del «hoy» del negocio.
 * NO de `desinfecciones.controller.js`, que también lo exporta: ese archivo
 * requiere `../config/db` y el servicio de evidencia al cargarse, así que
 * importarlo acá arrastraría todo el módulo de vehículos de rebote. El servicio
 * de evidencia sí se importa, y con él vienen sharp y multer: es el precio de
 * no duplicarlo, y las rutas lo necesitan igual para el multer de la subida.
 */
const db = require('../config/db')
const { hoyBogota, fechaSolo, diasEntre } = require('../utils/fecha_hora')
const { generarDia, cerrarDiariasVencidas } = require('../services/laboratorio.service')
const evid = require('../services/desinfeccionEvidencia.service')

const texto = (v, max) => String(v ?? '').trim().slice(0, max)
const esVerdadero = v => v === true || v === 1 || v === '1' || v === 'true'

function enteroPositivo(v) {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

// Los enum de la migración, repetidos acá a propósito: es lo que permite
// rechazar con 400 y nombre de campo en vez de con el ER_TRUNCATED_WRONG_VALUE
// que devuelve MySQL cuando un valor no está en el enum.
const BLOQUES        = ['LABORATORIO', 'TRAMPA_GRASA', 'OPERATIVA']
const FRECUENCIAS    = ['DIARIA', 'SEMANAL', 'CADA_N_DIAS', 'POR_EVENTO']
const MOMENTOS       = ['CUALQUIERA', 'NOCHE']
const TIPOS_REGISTRO = ['CONFIRMACION', 'EVIDENCIA']

// Diez años. El tope no es de la base (SMALLINT UNSIGNED aguanta 65535): es
// para que un dedazo de un cero no deje una actividad que no vuelve a pedirse
// en lo que dura el laboratorio.
const MAX_CADA_DIAS = 3650

// El orden en que se lee la pantalla: primero el laboratorio, después la trampa
// de grasa y al final lo operativo. Va escrito en el SQL y no como parámetro
// porque es parte del ORDEN de la consulta, no un valor: un `?` en un ORDER BY
// FIELD se manda igual pero suma tres marcadores a cada llamada y oscurece la
// lista de parámetros de los filtros, que es la que importa revisar.
const ORDEN_BLOQUE = `FIELD(a.bloque, 'LABORATORIO', 'TRAMPA_GRASA', 'OPERATIVA')`

/**
 * Quién ejecuta el aseo del laboratorio.
 *
 * El `tanatologo` es NUEVO en este módulo y no estaba en el de vehículos: el
 * laboratorio es donde trabaja, y si se cae de esta lista la persona que hace el
 * aseo ve el tablero y no puede registrar nada.
 *
 * `asesor`, `supervisora` y `contabilidad` NO están: ven el tablero y los
 * informes porque necesitan saber el estado sanitario, pero no ejecutan.
 *
 * Esto es un CÁLCULO DEL DATO, no el permiso: el permiso lo impone
 * `requireRol(...)` en las rutas. Viaja en la respuesta del tablero para que el
 * frontend no tenga que repetir la lista de roles y se desincronice de acá.
 */
const ROLES_QUE_REGISTRAN = ['tanatologo', 'asistente_tanatologo', 'asistente', 'coordinador', 'admin']

const puedeRegistrar = usuario => ROLES_QUE_REGISTRAN.includes(usuario?.rol)

/** Un valor del enum, en mayúsculas, o null si no está. */
function deEnum(valor, permitidos, max = 20) {
  const v = texto(valor, max).toUpperCase()
  return permitidos.includes(v) ? v : null
}

// ═══════════════════════════════════════════════════════════════════════════
// Laboratorios
// ═══════════════════════════════════════════════════════════════════════════

// GET /laboratorio/laboratorios  ?activo=1
async function listarLaboratorios(req, res, next) {
  try {
    const params = []
    let where = ''
    if (req.query?.activo !== undefined) {
      where = 'WHERE l.activo = ?'
      params.push(esVerdadero(req.query.activo) ? 1 : 0)
    }

    // El conteo de reglas va acá para que la pantalla de configuración pueda
    // advertir antes de inactivar un laboratorio que todavía tiene matriz.
    const [rows] = await db.query(
      `SELECT l.id, l.nombre, l.sede, l.activo,
              (SELECT COUNT(*) FROM h360_lab_regla r WHERE r.laboratorio_id = l.id) AS reglas
         FROM h360_lab l ${where}
        ORDER BY l.activo DESC, l.nombre`, params)
    res.json(rows)
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Catálogo de actividades
// ═══════════════════════════════════════════════════════════════════════════

const SELECT_ACTIVIDAD = `
  SELECT a.id, a.nombre, a.bloque, a.descripcion, a.activo
    FROM h360_lab_actividad a`

// GET /laboratorio/actividades  ?activo=1&bloque=LABORATORIO
async function listarActividades(req, res, next) {
  try {
    const q = req.query || {}
    const filtros = []
    const params  = []

    if (q.bloque !== undefined && q.bloque !== '') {
      const bloque = deEnum(q.bloque, BLOQUES)
      if (!bloque)
        return res.status(400).json({
          mensaje: `El bloque debe ser uno de: ${BLOQUES.join(', ')}`, campo: 'bloque',
        })
      filtros.push('a.bloque = ?'); params.push(bloque)
    }
    if (q.activo !== undefined) {
      filtros.push('a.activo = ?'); params.push(esVerdadero(q.activo) ? 1 : 0)
    }

    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `SELECT a.id, a.nombre, a.bloque, a.descripcion, a.activo,
              (SELECT COUNT(*) FROM h360_lab_regla r WHERE r.actividad_id = a.id) AS reglas
         FROM h360_lab_actividad a ${where}
        ORDER BY a.activo DESC, ${ORDEN_BLOQUE}, a.nombre`, params)
    res.json(rows)
  } catch (err) { next(err) }
}

async function traerActividad(id) {
  const [[a]] = await db.query(`${SELECT_ACTIVIDAD} WHERE a.id = ?`, [id])
  return a || null
}

// POST /laboratorio/actividades
async function crearActividad(req, res, next) {
  try {
    const b = req.body || {}

    const nombre = texto(b.nombre, 120)
    if (!nombre)
      return res.status(400).json({ mensaje: 'Falta el nombre de la actividad', campo: 'nombre' })

    const bloque = deEnum(b.bloque, BLOQUES)
    if (!bloque)
      return res.status(400).json({
        mensaje: `El bloque debe ser uno de: ${BLOQUES.join(', ')}`, campo: 'bloque',
      })

    const [dup] = await db.query('SELECT id FROM h360_lab_actividad WHERE nombre = ?', [nombre])
    if (dup.length)
      return res.status(409).json({
        mensaje: `Ya existe una actividad llamada «${nombre}».`,
        actividad_id: dup[0].id,
      })

    const [r] = await db.query(
      'INSERT INTO h360_lab_actividad (nombre, bloque, descripcion, activo) VALUES (?,?,?,?)',
      [nombre, bloque, texto(b.descripcion, 300) || null,
       b.activo === undefined || esVerdadero(b.activo) ? 1 : 0])

    res.status(201).json(await traerActividad(r.insertId))
  } catch (err) {
    // La comprobación de arriba cubre el caso normal. Esta cubre a dos personas
    // creando la misma actividad al mismo tiempo: la UNIQUE lo resuelve, y sin
    // traducirlo el usuario recibiría un 500 sin explicación.
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ mensaje: 'Ya existe una actividad con ese nombre.' })
    next(err)
  }
}

// PATCH /laboratorio/actividades/:id
async function actualizarActividad(req, res, next) {
  try {
    const id = enteroPositivo(req.params?.id)
    if (!id) return res.status(400).json({ mensaje: 'Identificador de actividad inválido' })
    if (!await traerActividad(id)) return res.status(404).json({ mensaje: 'Actividad no encontrada' })

    const b = req.body || {}
    const campos = {}

    if (b.nombre !== undefined) {
      const nombre = texto(b.nombre, 120)
      if (!nombre)
        return res.status(400).json({
          mensaje: 'El nombre de la actividad no puede quedar vacío', campo: 'nombre',
        })
      const [dup] = await db.query(
        'SELECT id FROM h360_lab_actividad WHERE nombre = ? AND id <> ?', [nombre, id])
      if (dup.length)
        return res.status(409).json({ mensaje: `Ya existe otra actividad llamada «${nombre}».` })
      campos.nombre = nombre
    }
    if (b.bloque !== undefined) {
      const bloque = deEnum(b.bloque, BLOQUES)
      if (!bloque)
        return res.status(400).json({
          mensaje: `El bloque debe ser uno de: ${BLOQUES.join(', ')}`, campo: 'bloque',
        })
      campos.bloque = bloque
    }
    if (b.descripcion !== undefined) campos.descripcion = texto(b.descripcion, 300) || null
    if (b.activo      !== undefined) campos.activo      = esVerdadero(b.activo) ? 1 : 0
    if (!Object.keys(campos).length) return res.status(400).json({ mensaje: 'Nada que actualizar' })

    await db.query('UPDATE h360_lab_actividad SET ? WHERE id = ?', [campos, id])
    res.json(await traerActividad(id))
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ mensaje: 'Ya existe otra actividad con ese nombre.' })
    next(err)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Reglas: la matriz actividad × laboratorio
// ═══════════════════════════════════════════════════════════════════════════

const SELECT_REGLA = `
  SELECT r.id, r.actividad_id, r.laboratorio_id,
         a.nombre AS actividad, a.bloque,
         l.nombre AS laboratorio,
         r.frecuencia, r.cada_dias, r.dia_semana, r.momento, r.tipo_registro, r.activo
    FROM h360_lab_regla r
    JOIN h360_lab_actividad a ON a.id = r.actividad_id
    JOIN h360_lab           l ON l.id = r.laboratorio_id`

/**
 * Los dos campos que la frecuencia condiciona, o el error listo para un 400.
 *
 * Espeja EXACTAMENTE los dos CHECK de `h360_lab_regla`:
 *   · SEMANAL     → `dia_semana` entre 1 y 7 (ISO: 1=lunes .. 7=domingo), `cada_dias` NULL.
 *   · CADA_N_DIAS → `cada_dias` >= 2, `dia_semana` NULL.
 *   · DIARIA y POR_EVENTO → los dos en NULL.
 *
 * Los últimos dos se ANULAN en silencio en vez de rechazarse cuando llegan con
 * valor, y eso es deliberado: es el mismo camino por el que pasa un cambio de
 * frecuencia en `actualizarRegla` (pasar una quincenal a diaria TIENE que
 * limpiar `cada_dias`, o la fila que queda es justo la que el CHECK rechaza).
 *
 * @returns {{valores:{cada_dias:number|null, dia_semana:number|null}}|{error:object}}
 */
function camposDeFrecuencia(frecuencia, fuente) {
  if (frecuencia === 'SEMANAL') {
    const dia = Number(fuente?.dia_semana)
    if (!Number.isInteger(dia) || dia < 1 || dia > 7)
      return { error: {
        mensaje: 'Una regla SEMANAL necesita el día de la semana, entre 1 (lunes) y 7 (domingo)',
        campo: 'dia_semana',
      } }
    return { valores: { cada_dias: null, dia_semana: dia } }
  }

  if (frecuencia === 'CADA_N_DIAS') {
    const cada = Number(fuente?.cada_dias)
    if (!Number.isInteger(cada) || cada < 2 || cada > MAX_CADA_DIAS)
      return { error: {
        mensaje: `Una regla CADA_N_DIAS necesita un período de entre 2 y ${MAX_CADA_DIAS} días`,
        campo: 'cada_dias',
      } }
    return { valores: { cada_dias: cada, dia_semana: null } }
  }

  return { valores: { cada_dias: null, dia_semana: null } }
}

// GET /laboratorio/reglas  ?laboratorio_id=&actividad_id=&frecuencia=&activo=
async function listarReglas(req, res, next) {
  try {
    const q = req.query || {}
    const filtros = []
    const params  = []

    for (const campo of ['laboratorio_id', 'actividad_id']) {
      if (q[campo] === undefined) continue
      const id = enteroPositivo(q[campo])
      if (!id) return res.status(400).json({ mensaje: `${campo} inválido`, campo })
      filtros.push(`r.${campo} = ?`); params.push(id)
    }
    if (q.frecuencia !== undefined && q.frecuencia !== '') {
      const frecuencia = deEnum(q.frecuencia, FRECUENCIAS)
      if (!frecuencia)
        return res.status(400).json({
          mensaje: `La frecuencia debe ser una de: ${FRECUENCIAS.join(', ')}`, campo: 'frecuencia',
        })
      filtros.push('r.frecuencia = ?'); params.push(frecuencia)
    }
    if (q.activo !== undefined) {
      filtros.push('r.activo = ?'); params.push(esVerdadero(q.activo) ? 1 : 0)
    }

    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `${SELECT_REGLA} ${where}
        ORDER BY l.nombre, ${ORDEN_BLOQUE}, a.nombre`, params)
    res.json(rows)
  } catch (err) { next(err) }
}

async function traerRegla(id) {
  const [[r]] = await db.query(`${SELECT_REGLA} WHERE r.id = ?`, [id])
  return r || null
}

// POST /laboratorio/reglas
async function crearRegla(req, res, next) {
  try {
    const b = req.body || {}

    const actividadId = enteroPositivo(b.actividad_id)
    if (!actividadId)
      return res.status(400).json({ mensaje: 'Falta la actividad', campo: 'actividad_id' })

    const laboratorioId = enteroPositivo(b.laboratorio_id)
    if (!laboratorioId)
      return res.status(400).json({ mensaje: 'Falta el laboratorio', campo: 'laboratorio_id' })

    const frecuencia = deEnum(b.frecuencia, FRECUENCIAS)
    if (!frecuencia)
      return res.status(400).json({
        mensaje: `La frecuencia debe ser una de: ${FRECUENCIAS.join(', ')}`, campo: 'frecuencia',
      })

    // Antes de tocar la base: es la validación que se adelanta a los CHECK.
    const condicionados = camposDeFrecuencia(frecuencia, b)
    if (condicionados.error) return res.status(400).json(condicionados.error)

    const momento = b.momento === undefined || b.momento === ''
      ? 'CUALQUIERA' : deEnum(b.momento, MOMENTOS)
    if (!momento)
      return res.status(400).json({
        mensaje: `El momento debe ser uno de: ${MOMENTOS.join(', ')}`, campo: 'momento',
      })

    const tipoRegistro = b.tipo_registro === undefined || b.tipo_registro === ''
      ? 'CONFIRMACION' : deEnum(b.tipo_registro, TIPOS_REGISTRO)
    if (!tipoRegistro)
      return res.status(400).json({
        mensaje: `El tipo de registro debe ser uno de: ${TIPOS_REGISTRO.join(', ')}`,
        campo: 'tipo_registro',
      })

    const actividad = await traerActividad(actividadId)
    if (!actividad) return res.status(404).json({ mensaje: 'La actividad no existe' })

    const [[laboratorio]] = await db.query(
      'SELECT l.id, l.nombre FROM h360_lab l WHERE l.id = ?', [laboratorioId])
    if (!laboratorio) return res.status(404).json({ mensaje: 'El laboratorio no existe' })

    // Una sola regla por actividad y laboratorio (`uk_lab_regla`): es lo que
    // impide que «barrer el piso» quede con dos frecuencias y nadie sepa cuál
    // rige. Se devuelve la que ya está para que la pantalla ofrezca editarla.
    const [[ya]] = await db.query(
      `${SELECT_REGLA} WHERE r.actividad_id = ? AND r.laboratorio_id = ?`,
      [actividadId, laboratorioId])
    if (ya)
      return res.status(409).json({
        mensaje: `«${actividad.nombre}» ya tiene una regla en ${laboratorio.nombre}. ` +
                 'Edítala en vez de crear otra.',
        regla: ya,
      })

    const [r] = await db.query(
      `INSERT INTO h360_lab_regla
         (actividad_id, laboratorio_id, frecuencia, cada_dias, dia_semana,
          momento, tipo_registro, activo)
       VALUES (?,?,?,?,?,?,?,?)`,
      [actividadId, laboratorioId, frecuencia,
       condicionados.valores.cada_dias, condicionados.valores.dia_semana,
       momento, tipoRegistro,
       b.activo === undefined || esVerdadero(b.activo) ? 1 : 0])

    res.status(201).json(await traerRegla(r.insertId))
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ mensaje: 'Esa actividad ya tiene una regla en ese laboratorio.' })
    next(err)
  }
}

/**
 * PATCH /laboratorio/reglas/:id
 *
 * Se cambian la frecuencia (con sus campos condicionados), el momento, el tipo
 * de registro y el activo.
 *
 * NO se mueve la regla a otra actividad ni a otro laboratorio: las tareas de
 * `h360_lab_tarea` apuntan a `regla_id`, así que moverla reinterpretaría en
 * silencio toda la historia que ya está escrita —la fila de «barrer» pasaría a
 * ser de otra actividad en el informe del mes pasado—. Para eso se inactiva
 * esta y se crea la que corresponde.
 *
 * Cambiar la frecuencia sí se permite y es la razón de que los dos campos
 * condicionados se recalculen juntos: pasar una quincenal a semanal tiene que
 * poner `cada_dias` en NULL y exigir `dia_semana`, o la fila que queda es
 * exactamente la que `ck_lab_regla_dia_semana` rechaza.
 */
async function actualizarRegla(req, res, next) {
  try {
    const id = enteroPositivo(req.params?.id)
    if (!id) return res.status(400).json({ mensaje: 'Identificador de regla inválido' })

    const actual = await traerRegla(id)
    if (!actual) return res.status(404).json({ mensaje: 'Regla no encontrada' })

    const b = req.body || {}
    const campos = {}

    // Los tres van juntos: el valor de dos de ellos depende del tercero, así que
    // tocar cualquiera obliga a revalidar el trío completo contra la frecuencia
    // que va a quedar (la del cuerpo si viene, la de la base si no).
    if (b.frecuencia !== undefined || b.cada_dias !== undefined || b.dia_semana !== undefined) {
      const frecuencia = b.frecuencia === undefined
        ? actual.frecuencia
        : deEnum(b.frecuencia, FRECUENCIAS)
      if (!frecuencia)
        return res.status(400).json({
          mensaje: `La frecuencia debe ser una de: ${FRECUENCIAS.join(', ')}`, campo: 'frecuencia',
        })

      const fuente = {
        cada_dias:  b.cada_dias  !== undefined ? b.cada_dias  : actual.cada_dias,
        dia_semana: b.dia_semana !== undefined ? b.dia_semana : actual.dia_semana,
      }
      const condicionados = camposDeFrecuencia(frecuencia, fuente)
      if (condicionados.error) return res.status(400).json(condicionados.error)

      campos.frecuencia = frecuencia
      campos.cada_dias  = condicionados.valores.cada_dias
      campos.dia_semana = condicionados.valores.dia_semana
    }

    if (b.momento !== undefined) {
      const momento = deEnum(b.momento, MOMENTOS)
      if (!momento)
        return res.status(400).json({
          mensaje: `El momento debe ser uno de: ${MOMENTOS.join(', ')}`, campo: 'momento',
        })
      campos.momento = momento
    }
    if (b.tipo_registro !== undefined) {
      const tipoRegistro = deEnum(b.tipo_registro, TIPOS_REGISTRO)
      if (!tipoRegistro)
        return res.status(400).json({
          mensaje: `El tipo de registro debe ser uno de: ${TIPOS_REGISTRO.join(', ')}`,
          campo: 'tipo_registro',
        })
      campos.tipo_registro = tipoRegistro
    }
    if (b.activo !== undefined) campos.activo = esVerdadero(b.activo) ? 1 : 0
    if (!Object.keys(campos).length) return res.status(400).json({ mensaje: 'Nada que actualizar' })

    await db.query('UPDATE h360_lab_regla SET ? WHERE id = ?', [campos, id])
    res.json(await traerRegla(id))
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// El tablero
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La lista del día.
 *
 * Trae las tareas CON FECHA DEL DÍA en cualquier estado, MÁS las de días
 * anteriores que siguen PENDIENTE. Las segundas son el arrastre: lo semanal y
 * lo de cada N días que no se hizo se SIGUE debiendo, y es lo único que le da
 * sentido a `dias_atraso` —si la consulta trajera solo `t.fecha = ?`, el campo
 * valdría 0 siempre—. Las DIARIA viejas no llegan acá porque el cierre que
 * corre justo antes ya las pasó a NO_HECHA.
 *
 * `fecha_esperada` es `DATE_FORMAT(t.fecha, ...)`: la columna se llama `fecha`,
 * y sin el formateo saldría como objeto y Express la serializaría en UTC.
 * `dias_atraso` no existe como columna: es el DATEDIFF contra LA FECHA
 * CONSULTADA, no contra hoy. El tablero describe el día que se está mirando: si
 * midiera contra hoy, una tarea del 20 que se hizo a tiempo ese día aparecería
 * con cinco días de atraso al consultarla el 25, y el tablero del 20 diría que
 * el laboratorio estaba atrasado cuando estaba al día. El atraso REAL de lo ya
 * ejecutado vive en `h360_lab_registro.dias_atraso`, se calcula contra la fecha
 * esperada al registrar y no se recalcula nunca. En el caso por defecto —la
 * fecha consultada es hoy— los dos valores coinciden.
 *
 * Usa `idx_lab_tarea_dia (laboratorio_id, fecha, estado)`.
 */
const SQL_TAREAS_DEL_DIA = `
  SELECT t.id                             AS tarea_id,
         t.regla_id                       AS regla_id,
         a.nombre                         AS actividad,
         a.bloque                         AS bloque,
         r.frecuencia                     AS frecuencia,
         r.momento                        AS momento,
         r.tipo_registro                  AS tipo_registro,
         t.estado                         AS estado,
         DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha_esperada,
         DATEDIFF(?, t.fecha)             AS dias_atraso
    FROM h360_lab_tarea t
    JOIN h360_lab_regla r     ON r.id = t.regla_id
    JOIN h360_lab_actividad a ON a.id = r.actividad_id
   WHERE t.laboratorio_id = ?
     AND t.fecha <= ?
     AND (t.fecha = ? OR t.estado = 'PENDIENTE')
   ORDER BY t.fecha, ${ORDEN_BLOQUE}, a.nombre`

/**
 * Las POR_EVENTO, que no tienen día y por eso NO están en `h360_lab_tarea`:
 * salen de la regla, con el conteo de lo que se registró en el día que se mira.
 *
 * Van aparte y como CONTEO, nunca como parte de la lista del día ni con
 * porcentaje: no tienen denominador —no se sabe cuántas preservaciones hubo— y
 * un porcentaje inventado en un informe de auditoría es peor que no tener el
 * dato.
 */
const SQL_POR_EVENTO = `
  SELECT r.id            AS regla_id,
         a.nombre        AS actividad,
         a.bloque        AS bloque,
         r.tipo_registro AS tipo_registro,
         (SELECT COUNT(*)
            FROM h360_lab_registro g
           WHERE g.regla_id        = r.id
             AND g.laboratorio_id  = r.laboratorio_id
             AND g.fecha_ejecucion = ?) AS hechas_hoy
    FROM h360_lab_regla r
    JOIN h360_lab_actividad a ON a.id = r.actividad_id
   WHERE r.laboratorio_id = ?
     AND r.activo = 1
     AND r.frecuencia = 'POR_EVENTO'
   ORDER BY ${ORDEN_BLOQUE}, a.nombre`

/**
 * GET /laboratorio/tablero  ?laboratorio_id=&fecha=
 *
 * Por defecto, el laboratorio activo y el «hoy» de Bogotá.
 *
 * ── EL SEGUNDO DISPARADOR ─────────────────────────────────────────────────
 * Antes de consultar llama a `cerrarDiariasVencidas(hoy)` y DESPUÉS a
 * `generarDia`. Los DOS, no solo el segundo: si el cron de las 00:05 no corrió
 * —servidor caído, despliegue a medianoche—, sin el cierre las diarias de ayer
 * se quedan PENDIENTE para siempre y el incumplimiento no queda escrito nunca.
 * El informe de cumplimiento mentiría A FAVOR NUESTRO, que en una auditoría
 * sanitaria es el peor de los dos errores posibles: la pantalla se ve bien y el
 * dato queda mal, que es la falla que no se nota.
 *
 * Las dos son idempotentes, así que llamarlas desde una lectura es seguro: el
 * cierre solo toca lo PENDIENTE de días anteriores y la generación se apoya en
 * `uk_lab_tarea` con INSERT IGNORE.
 *
 * Los errores NO se tragan: van a `next`. Un tablero en blanco se nota y se
 * reporta; un tablero que se ve completo mientras la generación falla en
 * silencio es la misma clase de mentira que el punto anterior.
 *
 * `generarDia` se llama SIEMPRE con el «hoy» de Bogotá y nunca con la `?fecha`
 * consultada, incluso cuando se pide un día pasado. Mirar el histórico es una
 * LECTURA: materializar tareas con fecha de hace un mes las haría nacer
 * PENDIENTE y el siguiente cierre las marcaría NO_HECHA, inventando
 * incumplimientos de días en que el módulo no existía.
 */
async function tablero(req, res, next) {
  try {
    const q = req.query || {}
    const hoy = hoyBogota()

    // La fecha que se mira. `fechaSolo` descarta el 31 de febrero: el texto se
    // manda tal cual a un DATE y a un DATEDIFF, así que tiene que ser un día
    // que exista.
    const fecha = q.fecha === undefined || q.fecha === '' ? hoy : fechaSolo(q.fecha)
    if (!fecha)
      return res.status(400).json({ mensaje: 'La fecha debe venir como AAAA-MM-DD', campo: 'fecha' })

    let laboratorio
    if (q.laboratorio_id !== undefined && q.laboratorio_id !== '') {
      const labId = enteroPositivo(q.laboratorio_id)
      if (!labId)
        return res.status(400).json({ mensaje: 'laboratorio_id inválido', campo: 'laboratorio_id' })
      const [[fila]] = await db.query(
        'SELECT l.id, l.nombre, l.sede FROM h360_lab l WHERE l.id = ?', [labId])
      if (!fila) return res.status(404).json({ mensaje: 'Laboratorio no encontrado' })
      laboratorio = fila
    } else {
      // El activo, por id. Con un solo laboratorio —el caso de hoy— esto es
      // exactamente «el único»; cuando se agregue una sede, la respuesta dice
      // en `laboratorio` cuál se está mostrando y la pantalla saca el selector.
      const [filas] = await db.query(
        'SELECT l.id, l.nombre, l.sede FROM h360_lab l WHERE l.activo = 1 ORDER BY l.id')
      if (!filas.length)
        return res.status(404).json({ mensaje: 'No hay ningún laboratorio activo configurado' })
      laboratorio = filas[0]
    }

    // ── El disparador: el cierre PRIMERO, la generación DESPUÉS ──
    await cerrarDiariasVencidas(hoy)
    await generarDia(laboratorio.id, hoy)

    // El primer parámetro es el del DATEDIFF: la FECHA CONSULTADA, no `hoy`.
    // Mirar el tablero del 20 tiene que contar el atraso que había el 20.
    const [tareas] = await db.query(SQL_TAREAS_DEL_DIA, [fecha, laboratorio.id, fecha, fecha])
    const [eventos] = await db.query(SQL_POR_EVENTO, [fecha, laboratorio.id])

    res.json({
      fecha,
      laboratorio: { id: laboratorio.id, nombre: laboratorio.nombre, sede: laboratorio.sede },
      hoy: tareas,
      // El COUNT se normaliza a número: según la configuración del driver un
      // agregado puede volver como texto, y el frontend compara `> 0`.
      por_evento: (eventos || []).map(e => ({ ...e, hechas_hoy: Number(e.hechas_hoy) || 0 })),
      puede_registrar: puedeRegistrar(req.user),
    })
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Registrar y omitir
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La tabla de evidencia de ESTE módulo.
 *
 * El servicio de evidencia es el de vehículos, reusado tal cual, y solo admite
 * esta tabla o la de allá: si acá se escribiera mal el nombre, el servicio lanza
 * al cargar este archivo (la fábrica de `servirEvidencia` se llama al final) y
 * el proceso no arranca, que es mejor que descubrirlo con la primera foto.
 *
 * Sin este dato las filas irían a `h360_desinf_evidencia`, cuya FK apunta a
 * `h360_desinf_registro`: la foto del laboratorio quedaría colgada del registro
 * del VEHÍCULO que tenga el mismo id —los dos autoincrementos arrancan en 1, así
 * que el choque es lo normal— y una auditoría leería una foto del laboratorio
 * como evidencia de una carroza.
 */
const TABLA_EVIDENCIA = 'h360_lab_evidencia'

/** Lo que multer deja en `req.files`, siempre como lista. */
function archivosDe(req) {
  const f = req?.files
  if (!f) return []
  if (Array.isArray(f)) return f
  return Object.values(f).flat().filter(Boolean)
}

// Para el mensaje del 409. Que diga en qué estado quedó importa: «ya está
// omitida» y «el sistema la cerró como no hecha» son dos problemas distintos
// para el que está parado frente a la pantalla.
const ESTADO_EN_TEXTO = {
  HECHA:    'ya tiene un registro de hoy',
  OMITIDA:  'ya se omitió',
  NO_HECHA: 'ya quedó cerrada como no hecha',
}

function conflicto(mensaje) {
  return Object.assign(new Error(mensaje), { status: 409 })
}

/**
 * La tarea del día con la REGLA VIGENTE y la actividad, que es de donde se
 * copia al registro.
 *
 * Se lee de la base y no del cuerpo del pedido: el `tipo_registro` que decide si
 * se exige foto tiene que ser el de la tabla. Si lo dijera el cliente, la
 * actividad que exige evidencia se cerraría sin evidencia mandando
 * `tipo_registro: 'CONFIRMACION'`, y la prueba sanitaria dejaría de existir sin
 * que nada se viera raro en la pantalla.
 *
 * `fecha_esperada` sale con DATE_FORMAT —la columna se llama `fecha`— porque se
 * guarda en el registro y se compara contra la fecha de ejecución como texto.
 *
 * EL NOMBRE SALE DE LA TAREA (`t.actividad_nombre`) Y NO DEL CATÁLOGO. La tarea
 * lo congela el día en que se genera, así que es el nombre que regía cuando la
 * obligación nació. Con `a.nombre`, renombrar la actividad entre la generación y
 * el cierre partía el MISMO cumplimiento en dos: el informe de `cumplimiento`
 * —que agrupa por `t.actividad_nombre`— mostraría el nombre viejo y el
 * `historial` —que lee el registro— el nuevo, sin nada que indique que son el
 * mismo hecho.
 *
 * El JOIN con el catálogo se queda, pero solo por `a.bloque`: ese es el
 * agrupador VIGENTE con el que se lee la pantalla y la tarea no lo copia.
 * El JOIN con la regla trae la frecuencia y el `tipo_registro` que rigen hoy,
 * que es lo correcto: son la obligación, no el nombre del hecho.
 */
const SQL_TAREA_A_CERRAR = `
  SELECT t.id                             AS tarea_id,
         t.laboratorio_id                 AS laboratorio_id,
         t.regla_id                       AS regla_id,
         t.estado                         AS estado,
         t.actividad_nombre               AS actividad,
         DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha_esperada,
         r.frecuencia                     AS frecuencia,
         r.cada_dias                      AS cada_dias,
         r.tipo_registro                  AS tipo_registro,
         a.bloque                         AS bloque
    FROM h360_lab_tarea t
    JOIN h360_lab_regla r     ON r.id = t.regla_id
    JOIN h360_lab_actividad a ON a.id = r.actividad_id
   WHERE t.id = ?`

/**
 * La regla sola, para el camino POR_EVENTO, que no tiene tarea.
 *
 * Acá el nombre SÍ sale del catálogo vigente, y es lo correcto: sin tarea no
 * hubo ningún nombre congelado antes, así que el del catálogo es el único que
 * rigió cuando el evento pasó.
 */
const SQL_REGLA_A_REGISTRAR = `
  SELECT r.id             AS regla_id,
         r.laboratorio_id AS laboratorio_id,
         r.frecuencia     AS frecuencia,
         r.cada_dias      AS cada_dias,
         r.tipo_registro  AS tipo_registro,
         r.activo         AS activo,
         a.nombre         AS actividad,
         a.bloque         AS bloque
    FROM h360_lab_regla r
    JOIN h360_lab_actividad a ON a.id = r.actividad_id
   WHERE r.id = ?`

/**
 * El registro como lo ve la pantalla. Las dos fechas con DATE_FORMAT y ningún
 * TIMESTAMP: `created_at` tiene el mismo problema de zona y no hace falta.
 *
 * `DATE_FORMAT` de NULL es NULL, así que un registro POR_EVENTO devuelve
 * `fecha_esperada: null` y no una fecha inventada.
 */
const SELECT_REGISTRO = `
  SELECT g.id, g.laboratorio_id, g.regla_id, g.tarea_id,
         g.actividad_nombre, g.bloque, g.frecuencia, g.cada_dias, g.tipo_registro,
         g.dias_atraso, g.observaciones, g.registrado_por, g.registrado_nombre,
         DATE_FORMAT(g.fecha_ejecucion, '%Y-%m-%d') AS fecha_ejecucion,
         DATE_FORMAT(g.fecha_esperada,  '%Y-%m-%d') AS fecha_esperada,
         (SELECT COUNT(*) FROM h360_lab_evidencia e WHERE e.registro_id = g.id) AS evidencias
    FROM h360_lab_registro g`

/**
 * Los cinco campos que el registro COPIA de la regla vigente, más el nombre de
 * la actividad: no se apunta a la regla. Cambiar una frecuencia en abril no
 * puede reescribir lo que se cumplió en marzo, y renombrar una actividad no
 * puede renombrar el histórico. Es la misma razón que en `h360_desinf_registro`.
 */
const SQL_ALTA_REGISTRO = `
  INSERT INTO h360_lab_registro
    (laboratorio_id, regla_id, tarea_id, actividad_nombre, bloque,
     frecuencia, cada_dias, tipo_registro,
     fecha_ejecucion, fecha_esperada, dias_atraso, observaciones,
     registrado_por, registrado_nombre)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

/**
 * El cierre de la tarea.
 *
 * `AND estado = 'PENDIENTE'` en el WHERE no es redundante con la lectura previa:
 * entre esa lectura y esta escritura alguien pudo registrarla u omitirla, y
 * pisarla dejaría dos registros de una sola ejecución —el informe contaría dos
 * cumplimientos donde hubo uno— o borraría el motivo de una omisión. Si no
 * afecta ninguna fila, el registro se deshace completo.
 */
const SQL_CERRAR_TAREA = `
  UPDATE h360_lab_tarea
     SET estado      = 'HECHA',
         registro_id = ?,
         cerrada_por = ?,
         cerrada_at  = NOW()
   WHERE id = ? AND estado = 'PENDIENTE'`

const SQL_OMITIR_TAREA = `
  UPDATE h360_lab_tarea
     SET estado         = 'OMITIDA',
         motivo_omision = ?,
         cerrada_por    = ?,
         cerrada_at     = NOW()
   WHERE id = ? AND estado = 'PENDIENTE'`

/**
 * POST /laboratorio/registro
 * Body: { laboratorio_id, tarea_id? | regla_id?, fecha_ejecucion?, observaciones? }
 *
 * Las fotos llegan en `req.files`: la ruta tiene que montar
 * `desinfeccionEvidencia.service.subidaEvidencia` como middleware (es el multer
 * EN MEMORIA del módulo de vehículos, reusado). Sin ese middleware `req.files`
 * viene vacío y una actividad de EVIDENCIA se rechaza con 400 aunque el
 * operario haya mandado la foto.
 *
 * ── Dos caminos ───────────────────────────────────────────────────────────
 * · Con `tarea_id`: cierra la tarea del día a HECHA y guarda la fecha que
 *   tocaba con el atraso medido contra ella.
 * · Sin `tarea_id` (POR_EVENTO): `tarea_id` y `fecha_esperada` quedan en NULL.
 *   Esa frecuencia no tiene día, así que no hay nada contra lo que medir atraso
 *   e inventarle una fecha esperada sería inventar un incumplimiento.
 *
 * ── Lo que se rechaza ANTES de abrir la transacción ────────────────────────
 * Todo lo que se pueda: rechazar es barato, rechazar después de haber escrito
 * no, y una foto en disco de un registro que no existe es basura que nadie
 * limpia, en un disco donde `uploads/` ya pesa 8,4 GB.
 *
 * ── Lo que se deshace ─────────────────────────────────────────────────────
 * El disco NO tiene rollback. Las filas de evidencia se escriben con la
 * conexión de la transacción, pero los archivos ya están en disco: si la
 * transacción se deshace hay que borrarlos a mano con `descartarEvidencias`, o
 * quedan huérfanos para siempre.
 */
async function registrar(req, res, next) {
  let conn = null
  let rutasEscritas = []
  let confirmado = false

  try {
    const b = req.body || {}

    const laboratorioId = enteroPositivo(b.laboratorio_id)
    if (!laboratorioId)
      return res.status(400).json({ mensaje: 'Falta el laboratorio', campo: 'laboratorio_id' })

    // Por defecto se registra hoy, que es el caso normal: alguien acaba de
    // hacer el aseo. Una fecha pasada se admite (se olvidó registrarlo ayer);
    // una futura no es una preferencia sino un dato imposible, y además movería
    // el ancla de las quincenales hacia adelante: el tablero diría que está al
    // día algo que nadie hizo.
    const hoy = hoyBogota()
    const fechaEjecucion = b.fecha_ejecucion === undefined || b.fecha_ejecucion === ''
      ? hoy : fechaSolo(b.fecha_ejecucion)
    if (!fechaEjecucion)
      return res.status(400).json({
        mensaje: 'La fecha de ejecución debe venir como AAAA-MM-DD', campo: 'fecha_ejecucion',
      })
    if (fechaEjecucion > hoy)
      return res.status(400).json({
        mensaje: 'La fecha de ejecución no puede ser futura', campo: 'fecha_ejecucion',
      })

    const pideTarea = b.tarea_id !== undefined && b.tarea_id !== null && b.tarea_id !== ''
    let tarea = null
    let regla = null

    if (pideTarea) {
      const tareaId = enteroPositivo(b.tarea_id)
      if (!tareaId)
        return res.status(400).json({ mensaje: 'Identificador de tarea inválido', campo: 'tarea_id' })

      const [[fila]] = await db.query(SQL_TAREA_A_CERRAR, [tareaId])
      if (!fila) return res.status(404).json({ mensaje: 'Esa tarea no existe' })

      // Se compara contra el laboratorio del pedido y no se adopta el de la
      // tarea: si no coinciden, el frontend está mirando otro laboratorio del
      // que cree y el registro quedaría en el que no es.
      if (Number(fila.laboratorio_id) !== laboratorioId)
        return res.status(400).json({
          mensaje: 'Esa tarea es de otro laboratorio', campo: 'tarea_id',
        })

      if (fila.estado !== 'PENDIENTE')
        return res.status(409).json({
          mensaje: `«${fila.actividad}» ${ESTADO_EN_TEXTO[fila.estado] || 'ya está cerrada'}.`,
          estado: fila.estado,
        })

      tarea = fila
    } else {
      const reglaId = enteroPositivo(b.regla_id)
      if (!reglaId)
        return res.status(400).json({
          mensaje: 'Falta la tarea del día, o la actividad por evento que se ejecutó',
          campo: 'regla_id',
        })

      const [[fila]] = await db.query(SQL_REGLA_A_REGISTRAR, [reglaId])
      if (!fila) return res.status(404).json({ mensaje: 'Esa actividad no existe' })
      if (Number(fila.laboratorio_id) !== laboratorioId)
        return res.status(400).json({
          mensaje: 'Esa actividad es de otro laboratorio', campo: 'regla_id',
        })

      // Solo las POR_EVENTO se registran sin tarea. Dejar pasar una DIARIA por
      // acá escribiría el registro y dejaría SU TAREA en PENDIENTE: el cierre de
      // medianoche la pasaría a NO_HECHA y el informe diría que no se hizo algo
      // que sí se hizo, con el registro al lado contradiciéndolo.
      if (fila.frecuencia !== 'POR_EVENTO')
        return res.status(400).json({
          mensaje: `«${fila.actividad}» es ${fila.frecuencia} y se registra sobre la tarea del día: ` +
                   'manda su tarea_id.',
          campo: 'tarea_id',
        })

      regla = fila
    }

    // De acá se COPIA, y es lo que se leyó de la base. Nada de esto se toma del
    // cuerpo del pedido.
    const vigente = tarea || regla

    const archivos = archivosDe(req)
    // La columna es TEXT: 65535 BYTES, no caracteres. Un tope alto de caracteres
    // se pasaría de largo con acentos y la base rechazaría el registro entero.
    const observaciones = texto(b.observaciones, 2000) || null

    // La exigencia es la de la REGLA, no la del cuerpo. Es la prueba sanitaria:
    // sin foto no queda nada que mostrar en una auditoría.
    if (vigente.tipo_registro === 'EVIDENCIA' && !archivos.length)
      return res.status(400).json({
        mensaje: `«${vigente.actividad}» exige al menos una foto como evidencia.`,
        campo: 'evidencia',
      })

    // Cuándo tocaba y qué tan tarde se hizo. Se GUARDA y no se recalcula nunca:
    // es el dato del informe, y el del tablero mide otra cosa (el día que se
    // está mirando). Negativo = se hizo antes de la fecha esperada.
    const fechaEsperada = tarea ? tarea.fecha_esperada : null
    const diasAtraso = fechaEsperada ? diasEntre(fechaEsperada, fechaEjecucion) : null

    conn = await db.getConnection()
    await conn.beginTransaction()

    const [ins] = await conn.query(SQL_ALTA_REGISTRO, [
      laboratorioId, vigente.regla_id, tarea ? tarea.tarea_id : null,
      vigente.actividad, vigente.bloque,
      vigente.frecuencia, vigente.cada_dias ?? null, vigente.tipo_registro,
      fechaEjecucion, fechaEsperada, diasAtraso, observaciones,
      texto(req.user?.usuario, 50), texto(req.user?.nombre, 150) || null,
    ])
    const registroId = ins.insertId

    let filasEvidencia = []
    if (archivos.length) {
      const guardado = await evid.guardarEvidencias({
        conn,
        registroId,
        archivos,
        // A la tabla de ESTE módulo. Sin esto, a la de vehículos.
        tabla: TABLA_EVIDENCIA,
        // `placa` es el prefijo del nombre del archivo en disco: el archivo
        // viaja solo y alguien lo va a mirar desde la consola del servidor,
        // donde «foto-3.jpg» no dice de qué es. Acá no hay placa, así que va el
        // laboratorio.
        placa: `lab${laboratorioId}`,
        actividadNombre: vigente.actividad,
        fechaEjecucion,
      })
      filasEvidencia = guardado?.filas || []
      rutasEscritas  = guardado?.rutasEscritas || []
    }

    if (tarea) {
      const [upd] = await conn.query(SQL_CERRAR_TAREA,
        [registroId, texto(req.user?.usuario, 50), tarea.tarea_id])
      // El guardia no encontró la fila: alguien la cerró mientras se escribía.
      // Se deshace todo —incluidas las fotos— en vez de dejar un registro
      // colgando de una tarea que cerró otra cosa.
      if (!Number(upd?.affectedRows))
        throw conflicto(`«${tarea.actividad}» la acaba de cerrar alguien más. Vuelve a cargar el tablero.`)
    }

    await conn.commit()
    confirmado = true

    // ⚠️ LA COPIA A DRIVE NO SE LLAMA ACÁ, a diferencia del módulo de vehículos.
    // `enviarEvidenciasADrive` lee `h360_desinf_registro JOIN vehiculos` por id
    // y el flujo de n8n arma las carpetas de Drive con la PLACA: con el id de un
    // registro de laboratorio encontraría el registro del VEHÍCULO que tenga ese
    // id y mandaría a Drive las fotos de ese vehículo, y el callback marcaría
    // como archivadas evidencias ajenas. La copia a Drive del laboratorio
    // necesita su propio flujo, su carpeta y su callback: queda pendiente y está
    // reportado. Mientras tanto la evidencia válida es la del servidor y la fila
    // de la base, que es lo que ya quedó guardado.

    const [[registro]] = await db.query(`${SELECT_REGISTRO} WHERE g.id = ?`, [registroId])

    res.status(201).json({
      registro: registro || { id: registroId },
      // Las filas que se acabaron de escribir, para que la pantalla pinte las
      // miniaturas sin volver a pedir el registro.
      evidencia: filasEvidencia,
      tarea: tarea
        ? { id: tarea.tarea_id, estado: 'HECHA', fecha_esperada: fechaEsperada, dias_atraso: diasAtraso }
        : null,
    })
  } catch (err) {
    // Solo se deshace si no se había confirmado: si el commit pasó y lo que
    // falló fue la lectura de la respuesta, los archivos ya tienen su fila en la
    // base y borrarlos dejaría el registro sin evidencia.
    if (conn && !confirmado) {
      await conn.rollback().catch(() => {})
      if (rutasEscritas.length)
        await evid.descartarEvidencias(rutasEscritas).catch(() => {})
    }
    // La carrera del cierre es un 409 nuestro, no un fallo del servidor: se
    // responde y no se escala a next, que lo volvería un 500.
    if (err?.status === 409) return res.status(409).json({ mensaje: err.message })
    next(err)
  } finally {
    if (conn) conn.release()
  }
}

/**
 * PATCH /laboratorio/tarea/:id/omitir
 * Body: { motivo_omision }
 *
 * PATCH y en singular: omitir MODIFICA la tarea del día que ya existe, no crea
 * nada, igual que `/programacion/:id` en el módulo de vehículos.
 *
 * EL MOTIVO ES OBLIGATORIO y es el punto entero de este endpoint. Sin él la
 * gente omite para que el indicador no se ponga rojo, «OMITIDA» deja de decir
 * nada y el dato no sirve en una auditoría sanitaria, que es para lo único que
 * se lleva. Con motivo, omitir es información: no llegó el insumo, no hubo
 * servicios, se dañó el equipo.
 *
 * No abre transacción: es un solo UPDATE, y un UPDATE ya es atómico. El guardia
 * `AND estado = 'PENDIENTE'` hace el resto.
 */
async function omitirTarea(req, res, next) {
  try {
    const id = enteroPositivo(req.params?.id)
    if (!id) return res.status(400).json({ mensaje: 'Identificador de tarea inválido' })

    // Lo primero y antes de leer: es lo más barato de rechazar.
    const motivo = texto(req.body?.motivo_omision, 200)
    if (!motivo)
      return res.status(400).json({
        mensaje: 'Para omitir una tarea hay que escribir por qué: el motivo es lo que hace ' +
                 'que el dato sirva en una auditoría.',
        campo: 'motivo_omision',
      })

    const [[tarea]] = await db.query(SQL_TAREA_A_CERRAR, [id])
    if (!tarea) return res.status(404).json({ mensaje: 'Esa tarea no existe' })
    if (tarea.estado !== 'PENDIENTE')
      return res.status(409).json({
        mensaje: `«${tarea.actividad}» ${ESTADO_EN_TEXTO[tarea.estado] || 'ya está cerrada'}.`,
        estado: tarea.estado,
      })

    const [upd] = await db.query(SQL_OMITIR_TAREA, [motivo, texto(req.user?.usuario, 50), id])
    if (!Number(upd?.affectedRows))
      return res.status(409).json({
        mensaje: `«${tarea.actividad}» la acaba de cerrar alguien más. Vuelve a cargar el tablero.`,
      })

    res.json({
      tarea_id: id,
      estado: 'OMITIDA',
      motivo_omision: motivo,
      fecha_esperada: tarea.fecha_esperada,
      actividad: tarea.actividad,
    })
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Historial y evidencia
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ EL HISTÓRICO PLANO NO VIVE ACÁ. `GET /laboratorio/registros` se monta sobre
 * `laboratorioInformes.historial`, que es un sobre-conjunto de esta lectura
 * —los mismos filtros más `registrado_por`, `frecuencia`, `page` y `limit`— y
 * devuelve `total`, que es lo que la exportación a Excel necesita para saber
 * cuántas páginas pedir. Acá había un `listarRegistros` con un `LIMIT 200` fijo;
 * se borró al montar las rutas: sin ruta era código muerto, y dejar dos formas
 * de pedir lo mismo obligaba al frontend a aprender dos y a elegir mal una.
 *
 * `SELECT_REGISTRO` se queda porque `registrar` devuelve con él el registro que
 * acabó de escribir.
 */

/**
 * GET /laboratorio/evidencia/:id — el binario, con el token en la cabecera.
 *
 * Es el handler del servicio de vehículos montado sobre la tabla de acá. No se
 * reimplementa: la normalización de la ruta (servir por id un valor de la base
 * sin normalizar es literalmente cómo se leen archivos del sistema), la lista
 * blanca de mimes (un mime inventado convierte una foto en una página servida
 * desde nuestro dominio) y la caché privada son justo lo que no hay que
 * equivocarse dos veces.
 *
 * Se arma al cargar el módulo y no por petición: así un nombre de tabla mal
 * escrito revienta al arrancar el proceso y no con la primera foto.
 */
const servirEvidencia = evid.servirEvidenciaDesde(TABLA_EVIDENCIA)

module.exports = {
  listarLaboratorios,
  listarActividades, crearActividad, actualizarActividad,
  listarReglas, crearRegla, actualizarRegla,
  tablero,
  registrar, omitirTarea, servirEvidencia,
  // Expuestos para las pruebas y para quien tenga que decidir lo mismo: la
  // lista de roles que registran es la que el tablero manda en el dato, y
  // `camposDeFrecuencia` es el espejo de los dos CHECK de la tabla.
  _internos: { ROLES_QUE_REGISTRAN, puedeRegistrar, camposDeFrecuencia, BLOQUES, FRECUENCIAS },
}
