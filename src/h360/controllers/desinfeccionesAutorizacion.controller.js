/**
 * desinfeccionesAutorizacion.controller.js
 * Código de autorización para activar un vehículo que el barrido nocturno
 * inhabilitó por desinfección vencida (activo = 0, inactivo_origen =
 * 'DESINFECCION').
 *
 * La salida normal de esa inhabilitación es registrar la actividad: eso
 * reactiva el vehículo y mueve la programación. Este módulo es la salida
 * EXCEPCIONAL —un servicio urgente con el lavadero cerrado—: alguien con
 * autoridad entrega un código de 6 dígitos y el vehículo sube sin que se haya
 * desinfectado. Por eso todo acá está escrito para que la excepción quede
 * registrada: motivo obligatorio, quién lo pidió, quién lo usó y cuándo.
 *
 * Copia la forma de reapertura.controller.js, que es el mecanismo que el
 * sistema ya usa para autorizar una excepción, con dos diferencias a propósito
 * (el código se genera con crypto y los intentos de validación tienen tope).
 * Las dos están explicadas donde ocurren.
 *
 * Los roles los filtra `requireRol` en las rutas; acá no se revalidan para no
 * tener dos listas de roles que se contradigan con el tiempo.
 */
const crypto = require('crypto')
const db = require('../config/db')
const gchat = require('../services/googleChat.service')

const TTL_MINUTOS = 30
const MOTIVO_MIN  = 10
const MOTIVO_MAX  = 300

// Tope de intentos fallidos de `validar` por vehículo. Ver `intentosFallidos`.
const MAX_INTENTOS_VALIDAR = 5

/**
 * Intentos fallidos por vehículo, en memoria del proceso.
 *
 * Por qué acá y no con `express-rate-limit`, que es lo que el repo usa para
 * esto (src/middleware/strictRateLimit.js, src/trk/middleware/limitadores.js):
 * esos limitadores son middleware de ruta con ventana de tiempo, y lo que hace
 * falta no es «cinco por minuto» sino «cinco por código»: al sexto intento el
 * código tiene que morir y hay que pedir otro, que es lo único que de verdad
 * detiene una fuerza bruta sobre seis dígitos. Una ventana de tiempo solo la
 * vuelve lenta. Además este controlador no es dueño de las rutas, así que no
 * puede montar middleware.
 *
 * El contador en memoria es solo el disparador; el bloqueo de verdad queda en
 * la base, porque al llegar al tope los códigos ENVIADO del vehículo se marcan
 * CANCELADO. Si el proceso se reinicia o hay varias instancias detrás del
 * balanceador, el contador se pierde pero el código cancelado sigue cancelado:
 * el que ya se bloqueó no se desbloquea solo.
 */
const intentosFallidos = new Map()

function intentosDe(vehiculoId) {
  return intentosFallidos.get(String(vehiculoId)) || 0
}

function sumarIntento(vehiculoId) {
  const n = intentosDe(vehiculoId) + 1
  intentosFallidos.set(String(vehiculoId), n)
  return n
}

function limpiarIntentos(vehiculoId) {
  intentosFallidos.delete(String(vehiculoId))
}

/**
 * El código se genera con crypto y NO con `Math.random()`, que es lo que hace
 * reapertura.controller.js. Me aparto del patrón a propósito: `Math.random()`
 * no es criptográfico y su estado se puede reconstruir observando salidas, y
 * acá lo que el código abre es un vehículo inhabilitado por una razón
 * sanitaria. El costo de cambiarlo es cero y el de no cambiarlo es que alguien
 * prediga el código de la próxima solicitud.
 *
 * randomInt(100000, 1000000) es el rango semiabierto [100000, 1000000), o sea
 * exactamente los seis dígitos, sin sesgo por módulo.
 */
function generarCodigo() {
  return String(crypto.randomInt(100000, 1000000))
}

function enHoraBogota(fecha) {
  // El pool no tiene `dateStrings`, así que un DATETIME vuelve como Date y
  // cualquier recorte de su ISO corre el día (Bogotá es UTC-5). La única forma
  // correcta de mostrarlo es pedirle la zona explícitamente.
  return fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' })
}

// ───────────────────────────────────────────────────────────────────────────
// POST /api/h360/desinfecciones/vehiculos/:id/autorizacion/solicitar
// body: { motivo }
// ───────────────────────────────────────────────────────────────────────────
async function solicitar(req, res, next) {
  try {
    const { id } = req.params
    const { motivo } = req.body || {}
    const { usuario, nombre } = req.user || {}

    const [rows] = await db.query(
      `SELECT id, placa, activo, inactivo_origen, inactivo_motivo
         FROM vehiculos WHERE id = ?`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ mensaje: 'Vehículo no encontrado' })
    const v = rows[0]

    if (v.activo)
      return res.status(400).json({
        mensaje: 'El vehículo ya está activo; no hay nada que autorizar.',
      })

    // Chequeo que no estaba en el encargo y que agrego a propósito: la columna
    // `inactivo_origen` existe justamente para que el módulo no suba lo que él
    // no bajó (ver la cabecera de h360_desinfecciones_migration.sql). Un
    // vehículo abajo por un choque o por mantenimiento no se puede levantar con
    // un código de desinfección; si se pudiera, esta pantalla sería el camino
    // corto para poner en servicio un carro accidentado. Ojo que el NULL cuenta
    // como ajeno: `vehiculos.controller.actualizar` baja `activo` sin llenar
    // `inactivo_origen`, así que un NULL es «lo bajó alguien a mano».
    if (v.inactivo_origen !== 'DESINFECCION')
      return res.status(400).json({
        mensaje: 'El vehículo no está inhabilitado por desinfección; '
               + 'esta autorización no aplica. Revísalo con quien lo inactivó.',
      })

    // El motivo es la justificación de una excepción sanitaria y es lo único
    // que queda para explicarla en una auditoría: «urgente» no explica nada.
    const motivoLimpio = String(motivo ?? '').trim()
    if (motivoLimpio.length < MOTIVO_MIN)
      return res.status(400).json({
        mensaje: `El motivo debe tener al menos ${MOTIVO_MIN} caracteres.`,
        campo: 'motivo',
      })
    const motivoFinal = motivoLimpio.slice(0, MOTIVO_MAX)

    // Igual que reapertura: pedir uno nuevo invalida los anteriores, para que
    // no queden dos códigos vivos del mismo vehículo circulando por el chat.
    await db.query(
      `UPDATE h360_desinf_autorizacion SET estado = 'CANCELADO'
        WHERE vehiculo_id = ? AND estado = 'ENVIADO'`,
      [id]
    )
    // Código nuevo, cuenta de intentos nueva: si el tope bloqueó al anterior,
    // pedir otro es exactamente lo que se le exigía al usuario.
    limpiarIntentos(id)

    const codigo   = generarCodigo()
    const expiraAt = new Date(Date.now() + TTL_MINUTOS * 60 * 1000)

    const [ins] = await db.query(
      `INSERT INTO h360_desinf_autorizacion
         (vehiculo_id, codigo, motivo, solicitado_por, solicitado_por_nombre, expira_at)
       VALUES (?,?,?,?,?,?)`,
      [id, codigo, motivoFinal, usuario, nombre || null, expiraAt]
    )

    // Va al espacio de reapertura (`enviar`) y no a operaciones
    // (`enviarOperaciones`): `enviarOperaciones` es el muro donde cae el día a
    // día —asistencias nuevas, exequias confirmadas— y lo lee el mismo equipo
    // que pide el código, así que publicar ahí el código le entregaría la
    // autorización a quien la solicita y el control de dos personas dejaría de
    // existir. `enviar` es el espacio de los códigos de autorización, donde ya
    // están los que autorizan reaperturas; es el mismo público y el mismo tipo
    // de secreto.
    const texto =
`🧼 *Autorización para activar un vehículo inhabilitado por desinfección*

El usuario *${nombre || usuario}* solicita activar el vehículo *${v.placa}*.
Está inhabilitado por: _${v.inactivo_motivo || 'desinfección vencida (sin motivo registrado)'}_
Motivo de la excepción: _${motivoFinal}_

El código de autorización es: *${codigo}*
Vence: ${enHoraBogota(expiraAt)} (Bogotá).

⚠️ Este código sube el vehículo pero NO registra la desinfección: queda habilitado con la desinfección todavía vencida y el barrido de esta noche lo volverá a inhabilitar.`

    const envio = await gchat.enviar(texto)
    if (!envio.ok) console.warn(`[desinf autorizacion] webhook falló (vehículo ${id}):`, envio)

    // El código YA está guardado, falló solo el mensaje. Si la respuesta dijera
    // «revisa el chat» el usuario esperaría un mensaje que nunca salió, así que
    // `enviado` va aparte del `ok` y el texto lo dice sin rodeos.
    res.json({
      ok: true,
      solicitud_id: ins.insertId,
      enviado: !!envio.ok,
      expira_at: expiraAt.toISOString(),
      mensaje: envio.ok
        ? 'Solicitud enviada al aprobador. Ingresa el código que te compartirá.'
        : 'El código quedó registrado, pero el aviso a Google Chat no salió. '
        + 'Pídelo al administrador: el código ya existe y no hace falta solicitarlo de nuevo.',
    })
  } catch (err) { next(err) }
}

// ───────────────────────────────────────────────────────────────────────────
// POST /api/h360/desinfecciones/vehiculos/:id/autorizacion/validar
// body: { codigo }
// ───────────────────────────────────────────────────────────────────────────
async function validar(req, res, next) {
  try {
    const { id } = req.params
    const { codigo } = req.body || {}
    const { usuario } = req.user || {}

    const codigoLimpio = String(codigo ?? '').trim()
    // Un código con forma equivocada no gasta intento: no es un tanteo del
    // espacio de códigos, es un dedo torpe o un cliente mal hecho.
    if (!/^\d{6}$/.test(codigoLimpio))
      return res.status(400).json({ mensaje: 'El código debe ser de 6 dígitos.' })

    if (intentosDe(id) >= MAX_INTENTOS_VALIDAR)
      return res.status(429).json({
        mensaje: 'Demasiados intentos fallidos. Solicita un código nuevo.',
        bloqueado: true,
      })

    const [rows] = await db.query(
      `SELECT id, vehiculo_id, codigo, motivo, expira_at
         FROM h360_desinf_autorizacion
        WHERE vehiculo_id = ? AND codigo = ? AND estado = 'ENVIADO'
        ORDER BY id DESC LIMIT 1`,
      [id, codigoLimpio]
    )

    if (!rows.length) {
      const intentos = sumarIntento(id)
      // Al llegar al tope el código vivo se mata en la base: el bloqueo tiene
      // que sobrevivir a un reinicio del proceso, y «pide uno nuevo» solo es
      // verdad si el anterior dejó de servir.
      if (intentos >= MAX_INTENTOS_VALIDAR) {
        await db.query(
          `UPDATE h360_desinf_autorizacion SET estado = 'CANCELADO'
            WHERE vehiculo_id = ? AND estado = 'ENVIADO'`,
          [id]
        )
        return res.status(429).json({
          mensaje: 'Demasiados intentos fallidos. El código quedó anulado; solicita uno nuevo.',
          bloqueado: true,
        })
      }
      // Mensaje genérico a propósito: no distingue «ese vehículo no tiene
      // ningún código» de «el código es otro». Lo primero le diría a quien
      // tantea dónde vale la pena seguir tanteando.
      return res.status(400).json({ mensaje: 'Código inválido o ya utilizado.' })
    }
    const t = rows[0]

    if (new Date(t.expira_at).getTime() < Date.now()) {
      await db.query(
        `UPDATE h360_desinf_autorizacion SET estado = 'EXPIRADO' WHERE id = ?`,
        [t.id]
      )
      // No gasta intento: el código era el correcto, solo llegó tarde.
      return res.status(400).json({ mensaje: 'El código ha expirado. Solicita uno nuevo.' })
    }

    // Consumir el código y subir el vehículo son un solo hecho. Separados, un
    // fallo en el medio deja el código quemado sin haber activado nada (y al
    // usuario pidiendo otro con el vehículo abajo) o, peor, el vehículo arriba
    // con el código todavía disponible para subirlo una segunda vez.
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      // El `AND estado = 'ENVIADO'` del UPDATE cierra la carrera de dos
      // validaciones simultáneas con el mismo código: la segunda espera el
      // candado de la fila, lo ve USADO y no afecta ninguna.
      const [upd] = await conn.query(
        `UPDATE h360_desinf_autorizacion
            SET estado = 'USADO', usado_por = ?, usado_at = NOW()
          WHERE id = ? AND estado = 'ENVIADO'`,
        [usuario, t.id]
      )
      if (!upd || upd.affectedRows !== 1) {
        await conn.rollback().catch(() => {})
        return res.status(400).json({ mensaje: 'Código inválido o ya utilizado.' })
      }

      // Se limpian los cuatro campos de inactivación: dejarlos puestos con
      // activo = 1 haría que el tablero muestre un vehículo habilitado y «por
      // qué está abajo» al mismo tiempo.
      //
      // Lo que NO se hace acá, y es deliberado: no se inserta en
      // h360_desinf_registro ni se mueve h360_desinf_programacion. La
      // autorización no es un perdón de la desinfección: es permiso para hoy.
      // El vehículo queda arriba con su desinfección vencida y el barrido de
      // esta noche lo volverá a bajar si nadie la registra. Eso es correcto, y
      // va dicho en el `aviso` de la respuesta para que no se reporte mañana
      // como un bug.
      await conn.query(
        `UPDATE vehiculos
            SET activo = 1, inactivo_origen = NULL, inactivo_motivo = NULL,
                inactivo_at = NULL, inactivo_por = NULL
          WHERE id = ?`,
        [id]
      )

      await conn.commit()
    } catch (err) {
      await conn.rollback().catch(() => {})
      throw err
    } finally {
      conn.release()
    }

    limpiarIntentos(id)

    res.json({
      ok: true,
      autorizacion_id: t.id,
      mensaje: 'Vehículo activado con código de autorización.',
      aviso: 'La desinfección sigue vencida: esta autorización no la registra '
           + 'ni mueve la programación. El barrido de esta noche volverá a '
           + 'inhabilitar el vehículo si no se registra la actividad.',
    })
  } catch (err) { next(err) }
}

// ───────────────────────────────────────────────────────────────────────────
// GET /api/h360/desinfecciones/autorizaciones?vehiculo_id=&desde=&hasta=
//
// El rastro de auditoría de las excepciones: quién levantó qué vehículo, cuándo
// y con qué motivo. El `codigo` NO se devuelve: un código ENVIADO listado acá
// sería un código regalado a quien abra el historial.
// ───────────────────────────────────────────────────────────────────────────
const LIMITE = 200

async function listarAutorizaciones(req, res, next) {
  try {
    const { vehiculo_id, desde, hasta } = req.query || {}
    const conds  = []
    const params = []

    if (vehiculo_id !== undefined && String(vehiculo_id).trim() !== '') {
      const n = Number(vehiculo_id)
      if (!Number.isInteger(n) || n <= 0)
        return res.status(400).json({ mensaje: 'vehiculo_id inválido', campo: 'vehiculo_id' })
      conds.push('a.vehiculo_id = ?')
      params.push(n)
    }

    const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim())
    if (desde !== undefined && String(desde).trim() !== '') {
      if (!esFecha(desde))
        return res.status(400).json({ mensaje: 'desde debe venir como YYYY-MM-DD', campo: 'desde' })
      conds.push('a.created_at >= ?')
      params.push(`${String(desde).trim()} 00:00:00`)
    }
    if (hasta !== undefined && String(hasta).trim() !== '') {
      if (!esFecha(hasta))
        return res.status(400).json({ mensaje: 'hasta debe venir como YYYY-MM-DD', campo: 'hasta' })
      // El corte se hace con el día siguiente y no con `<= hasta`, que compara
      // contra la medianoche y dejaría fuera todo lo del propio día de `hasta`.
      conds.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)')
      params.push(String(hasta).trim())
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    // Las fechas se formatean en SQL: si salieran como Date, Express las
    // serializa en UTC y el historial mostraría las de la noche un día antes.
    const [rows] = await db.query(
      `SELECT a.id, a.vehiculo_id, v.placa AS vehiculo_placa,
              a.motivo, a.estado,
              a.solicitado_por, a.solicitado_por_nombre, a.usado_por,
              DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS created_at,
              DATE_FORMAT(a.expira_at,  '%Y-%m-%d %H:%i') AS expira_at,
              DATE_FORMAT(a.usado_at,   '%Y-%m-%d %H:%i') AS usado_at
         FROM h360_desinf_autorizacion a
         LEFT JOIN vehiculos v ON v.id = a.vehiculo_id
         ${where}
        ORDER BY a.id DESC
        LIMIT ${LIMITE}`,
      params
    )

    res.json({ data: rows, limite: LIMITE })
  } catch (err) { next(err) }
}

module.exports = {
  solicitar,
  validar,
  listarAutorizaciones,
  // Expuesto para las rutas y las pruebas: el tope de intentos es parte del
  // contrato del endpoint, no un detalle interno.
  MAX_INTENTOS_VALIDAR,
}
