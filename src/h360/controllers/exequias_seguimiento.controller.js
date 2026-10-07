/**
 * exequias_seguimiento.controller.js
 *
 * Dos oficios sobre la misma exequia:
 *
 *   · Recepción hace la CONFIRMACIÓN DE EXEQUIA antes de que el homenaje
 *     salga: con quién habló, qué gestionó, si quedó la cita y el obituario.
 *     No puede cerrarla mientras el pago no esté confirmado.
 *
 *     En el código se sigue llamando "seguimiento" —la tabla, el estado, las
 *     rutas— porque así nació; de cara al usuario es "confirmación de exequia".
 *
 *   · El TRAMITADOR va a pagar la exequia y confirma el pago con la foto del
 *     comprobante. Ese es su único trabajo en el sistema.
 *
 * El pago vive en su propia tabla y no se copia al seguimiento: que exista la
 * fila significa "pagado", y así no hay dos verdades que mantener sincronizadas.
 */
const db = require('../config/db')
const { insertarHistorial } = require('./exequias.controller')

// Una exequia confirmada ya salió de PENDIENTE_CONFIRMAR: tiene fecha y lugar
// acordados, así que se le puede hacer seguimiento y pagarla. REALIZADA entra
// también porque el pago puede quedar registrado después del servicio.
const ESTADOS_CON_SEGUIMIENTO = ['PENDIENTE_VEHICULO', 'PROGRAMADA', 'REALIZADA']

// Pendientes de pago: las que todavía van a ocurrir. Una REALIZADA no se le
// pone al tramitador en la bandeja, aunque pueda registrarse a mano.
const ESTADOS_POR_PAGAR = ['PENDIENTE_VEHICULO', 'PROGRAMADA']

const SELECT_EXEQUIA = `
  SELECT e.id, e.estado, e.tipo, e.fecha, e.hora, e.lugar, e.parroquia,
         e.destino_final, e.lugar_destino_final, e.requiere_confirmacion_pago,
         a.id AS asistencia_id, a.codigo AS asistencia_codigo, a.contrato,
         a.nombre_ser_querido AS ser_querido,
         a.nombre_contacto, a.telefono_contacto
    FROM exequias e
    JOIN asistencias a ON a.id = e.asistencia_id
   WHERE e.id = ?`

/** Error de validación que el handler traduce a 400 sin pasar por next(). */
function malaPeticion(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 })
}

/**
 * Un sí/no tiene que venir respondido. Sin esto un campo que la pantalla
 * olvidara enviar quedaría en "no" sin que nadie lo hubiera dicho.
 */
function siNo(valor, campo) {
  if (valor === true  || valor === 1 || valor === '1' || valor === 'true'  || valor === 'SI') return 1
  if (valor === false || valor === 0 || valor === '0' || valor === 'false' || valor === 'NO') return 0
  throw malaPeticion(`Falta responder sí o no en "${campo}"`)
}

const texto = (v, max) => String(v ?? '').trim().slice(0, max)

async function traerSeguimiento(exequiaId) {
  const [[s]] = await db.query(
    'SELECT * FROM h360_exequia_seguimiento WHERE exequia_id = ?', [exequiaId])
  return s || null
}

/**
 * El pago sin la foto: la imagen pesa cientos de kB y no hace falta para saber
 * que está pagado. Se pide aparte, solo cuando alguien la va a ver.
 */
async function traerPago(exequiaId) {
  const [[p]] = await db.query(
    `SELECT id, exequia_id, nota, confirmado_por, confirmado_nombre, confirmado_rol,
            confirmado_at, foto IS NOT NULL AS tiene_foto
       FROM h360_exequia_pago WHERE exequia_id = ?`, [exequiaId])
  return p ? { ...p, tiene_foto: !!p.tiene_foto } : null
}

// ─────────────────────────────────────────────────────────────
// GET /exequias/:id/seguimiento
// ─────────────────────────────────────────────────────────────
async function obtener(req, res, next) {
  try {
    const [[ex]] = await db.query(SELECT_EXEQUIA, [req.params.id])
    if (!ex) return res.status(404).json({ mensaje: 'Exequia no encontrada' })

    const [seguimiento, pago] = await Promise.all([
      traerSeguimiento(ex.id), traerPago(ex.id),
    ])
    res.json({
      exequia: ex,
      seguimiento,
      pago,
      // Quién puede hacer qué lo decide el backend; la pantalla solo obedece.
      aplica: ESTADOS_CON_SEGUIMIENTO.includes(ex.estado),
      puede_cerrar: !!seguimiento && seguimiento.estado === 'ABIERTO' && !!pago,
    })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────
// GET /exequias/:id/pago/foto — la imagen, aparte del resto
// ─────────────────────────────────────────────────────────────
async function fotoPago(req, res, next) {
  try {
    const [[p]] = await db.query(
      'SELECT foto FROM h360_exequia_pago WHERE exequia_id = ?', [req.params.id])
    if (!p || !p.foto) return res.status(404).json({ mensaje: 'Este pago no tiene foto' })
    res.json({ foto: p.foto })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────
// PUT /exequias/:id/seguimiento — crea o corrige el seguimiento
// ─────────────────────────────────────────────────────────────
async function guardar(req, res, next) {
  try {
    const { id } = req.params
    const { usuario, nombre } = req.user

    const [[ex]] = await db.query(SELECT_EXEQUIA, [id])
    if (!ex) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (ex.estado === 'CANCELADA')
      return res.status(409).json({ mensaje: 'La exequia está cancelada: no se le hace confirmación.' })
    if (!ESTADOS_CON_SEGUIMIENTO.includes(ex.estado))
      return res.status(409).json({
        mensaje: 'La confirmación se hace sobre exequias que ya pasaron por coordinación.',
      })

    const previo = await traerSeguimiento(id)
    if (previo && previo.estado === 'CERRADO')
      return res.status(409).json({
        mensaje: 'La confirmación ya está cerrada. Pide reabrirla para corregirla.',
      })

    const fecha = texto(req.body.fecha, 10)
    const hora  = texto(req.body.hora, 5)
    const datos = {
      usuario_id:         usuario,
      usuario_nombre:     texto(nombre, 150) || null,
      fecha,
      hora,
      con_quien:          texto(req.body.con_quien, 150),
      gestion_realizada:  texto(req.body.gestion_realizada, 4000),
      gestiono_cita:      siNo(req.body.gestiono_cita, 'gestionó cita'),
      gestiono_obituario: siNo(req.body.gestiono_obituario, 'gestionó obituario'),
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) throw malaPeticion('La fecha del seguimiento es obligatoria')
    if (!/^\d{2}:\d{2}$/.test(datos.hora))        throw malaPeticion('La hora del seguimiento es obligatoria')
    if (!datos.con_quien)         throw malaPeticion('Falta con quién se hizo el seguimiento')
    if (!datos.gestion_realizada) throw malaPeticion('Falta describir la gestión realizada')

    if (previo) {
      await db.query('UPDATE h360_exequia_seguimiento SET ? WHERE id = ?', [datos, previo.id])
    } else {
      await db.query('INSERT INTO h360_exequia_seguimiento SET ?', [{ ...datos, exequia_id: id }])
    }

    await insertarHistorial(id, ex.estado, ex.estado, usuario,
      `Confirmación ${previo ? 'actualizada' : 'registrada'} — con ${datos.con_quien}` +
      ` · cita: ${datos.gestiono_cita ? 'sí' : 'no'}` +
      ` · obituario: ${datos.gestiono_obituario ? 'sí' : 'no'}`)

    const [seguimiento, pago] = await Promise.all([traerSeguimiento(id), traerPago(id)])
    res.json({ seguimiento, pago, puede_cerrar: !!pago })
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ mensaje: err.message })
    next(err)
  }
}

// ─────────────────────────────────────────────────────────────
// POST /exequias/:id/seguimiento/cerrar
// ─────────────────────────────────────────────────────────────
async function cerrar(req, res, next) {
  try {
    const { id } = req.params
    const { usuario, nombre } = req.user

    const [[ex]] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!ex) return res.status(404).json({ mensaje: 'Exequia no encontrada' })

    const seguimiento = await traerSeguimiento(id)
    if (!seguimiento)
      return res.status(409).json({ mensaje: 'Primero registra la confirmación de la exequia.' })
    if (seguimiento.estado === 'CERRADO')
      return res.status(409).json({ mensaje: 'La confirmación ya está cerrada.' })

    // El candado del requerimiento: sin pago confirmado no se cierra. Aplica
    // siempre, incluso si la exequia no venía marcada como "requiere legalización";
    // en ese caso lo registra recepción misma.
    const pago = await traerPago(id)
    if (!pago)
      return res.status(409).json({
        mensaje: 'No se puede cerrar la confirmación sin el pago confirmado.',
        falta_pago: true,
      })

    await db.query(
      `UPDATE h360_exequia_seguimiento
          SET estado='CERRADO', cerrado_por=?, cerrado_nombre=?, cerrado_at=NOW()
        WHERE id=?`,
      [usuario, texto(nombre, 150) || null, seguimiento.id])

    await insertarHistorial(id, ex.estado, ex.estado, usuario,
      'Confirmación de exequia cerrada — pago confirmado por ' + (pago.confirmado_nombre || pago.confirmado_por))

    res.json({ seguimiento: await traerSeguimiento(id), pago })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────
// POST /exequias/:id/seguimiento/reabrir
// ─────────────────────────────────────────────────────────────
async function reabrir(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const motivo = texto(req.body.motivo, 300)
    if (!motivo) return res.status(400).json({ mensaje: 'El motivo de la reapertura es obligatorio' })

    const seguimiento = await traerSeguimiento(id)
    if (!seguimiento) return res.status(404).json({ mensaje: 'Esta exequia no tiene confirmación registrada' })
    if (seguimiento.estado !== 'CERRADO')
      return res.status(409).json({ mensaje: 'La confirmación ya está abierta.' })

    await db.query(
      `UPDATE h360_exequia_seguimiento
          SET estado='ABIERTO', cerrado_por=NULL, cerrado_nombre=NULL, cerrado_at=NULL
        WHERE id=?`, [seguimiento.id])

    const [[ex]] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    await insertarHistorial(id, ex?.estado, ex?.estado, usuario, 'Confirmación de exequia reabierta — ' + motivo)

    res.json({ seguimiento: await traerSeguimiento(id) })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────
// GET /exequias/pagos/pendientes — bandeja del tramitador
// ─────────────────────────────────────────────────────────────
/**
 * Lo que le toca pagar: exequias confirmadas, marcadas como que requieren
 * legalización, y que todavía no tienen pago registrado.
 *
 * ?todas=1 abre la búsqueda a las que no están marcadas, para cuando hay que
 * pagar una que nadie marcó como que requiere legalización. Ahí sí se acota por fecha: quedan 118 exequias
 * programadas de meses atrás que nunca se pasaron a realizadas, y volcarlas
 * todas en la bandeja no ayuda a nadie.
 * ?q= filtra por contrato, código de asistencia o nombre del ser querido.
 */
async function pagosPendientes(req, res, next) {
  try {
    const todas = ['1', 'true', 'si'].includes(String(req.query.todas || '').toLowerCase())
    const q     = texto(req.query.q, 60)

    const filtros = [
      `e.estado IN (${ESTADOS_POR_PAGAR.map(() => '?').join(',')})`,
      'p.id IS NULL',
    ]
    const params = [...ESTADOS_POR_PAGAR]

    if (!todas) {
      filtros.push('e.requiere_confirmacion_pago = 1')
    } else if (!q) {
      // Sin búsqueda, solo lo que está por ocurrir o acabó de pasar.
      filtros.push('e.fecha >= CURDATE() - INTERVAL 15 DAY')
    }
    if (q) {
      filtros.push('(a.contrato LIKE ? OR a.codigo LIKE ? OR a.nombre_ser_querido LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }

    const [rows] = await db.query(
      `SELECT e.id, e.tipo, e.fecha, e.hora, e.lugar, e.parroquia,
              e.destino_final, e.lugar_destino_final, e.estado,
              e.requiere_confirmacion_pago,
              a.codigo AS asistencia_codigo, a.contrato,
              a.nombre_ser_querido AS ser_querido,
              a.nombre_contacto, a.telefono_contacto,
              s.estado AS seguimiento_estado
         FROM exequias e
         JOIN asistencias a ON a.id = e.asistencia_id
    LEFT JOIN h360_exequia_pago p ON p.exequia_id = e.id
    LEFT JOIN h360_exequia_seguimiento s ON s.exequia_id = e.id
        WHERE ${filtros.join('\n          AND ')}
        ORDER BY e.fecha ASC, e.hora ASC
        LIMIT 200`,
      params)
    res.json(rows)
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────
// GET /exequias/pagos — lo ya pagado, para consulta
// ─────────────────────────────────────────────────────────────
async function pagosConfirmados(req, res, next) {
  try {
    const [rows] = await db.query(
      `SELECT e.id, e.tipo, e.fecha, e.hora, e.lugar, e.parroquia, e.estado,
              a.codigo AS asistencia_codigo, a.contrato,
              a.nombre_ser_querido AS ser_querido,
              p.nota, p.confirmado_por, p.confirmado_nombre, p.confirmado_rol,
              p.confirmado_at, p.foto IS NOT NULL AS tiene_foto
         FROM h360_exequia_pago p
         JOIN exequias e    ON e.id = p.exequia_id
         JOIN asistencias a ON a.id = e.asistencia_id
        ORDER BY p.confirmado_at DESC
        LIMIT 100`)
    res.json(rows.map(r => ({ ...r, tiene_foto: !!r.tiene_foto })))
  } catch (err) { next(err) }
}

// Una foto de 1024 px sale en ~400 kB de base64. El tope deja margen de sobra
// y ataja a quien mande la imagen original de 12 MP sin reducir.
const TOPE_FOTO = 4 * 1024 * 1024

// ─────────────────────────────────────────────────────────────
// POST /exequias/:id/pago — el tramitador confirma el pago
// ─────────────────────────────────────────────────────────────
async function confirmarPago(req, res, next) {
  try {
    const { id } = req.params
    const { usuario, nombre, rol } = req.user
    const foto = String(req.body.foto ?? '').trim()
    const nota = texto(req.body.nota, 300)

    const [[ex]] = await db.query(SELECT_EXEQUIA, [id])
    if (!ex) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (!ESTADOS_CON_SEGUIMIENTO.includes(ex.estado))
      return res.status(409).json({
        mensaje: `No se registra el pago de una exequia en estado ${ex.estado}.`,
      })

    if (foto) {
      if (!/^data:image\/(jpe?g|png|webp);base64,/i.test(foto))
        return res.status(400).json({ mensaje: 'La foto debe ser una imagen (JPG, PNG o WEBP)' })
      if (foto.length > TOPE_FOTO)
        return res.status(413).json({ mensaje: 'La foto es muy grande. Vuelve a tomarla.' })
    } else if (!nota) {
      // Sin foto tiene que quedar dicho por qué: un pago confirmado sin ningún
      // respaldo no sirve de constancia.
      return res.status(400).json({
        mensaje: 'Sube la foto del comprobante o, si no la tienes, explica en la nota cómo se pagó.',
      })
    }

    const [ya] = await db.query('SELECT id FROM h360_exequia_pago WHERE exequia_id = ?', [id])
    if (ya.length)
      return res.status(409).json({ mensaje: 'Esta exequia ya tiene el pago confirmado.' })

    await db.query('INSERT INTO h360_exequia_pago SET ?', [{
      exequia_id: id,
      foto: foto || null,
      nota: nota || null,
      confirmado_por: usuario,
      confirmado_nombre: texto(nombre, 150) || null,
      confirmado_rol: texto(rol, 30) || null,
    }])

    await insertarHistorial(id, ex.estado, ex.estado, usuario,
      `Pago confirmado${foto ? ' con comprobante' : ' sin comprobante'}${nota ? ' — ' + nota : ''}`)

    res.status(201).json({ pago: await traerPago(id), exequia: ex })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────
// DELETE /exequias/:id/pago — anular un pago mal registrado
// ─────────────────────────────────────────────────────────────
async function anularPago(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const motivo = texto(req.body?.motivo, 300)
    if (!motivo) return res.status(400).json({ mensaje: 'El motivo de la anulación es obligatorio' })

    const pago = await traerPago(id)
    if (!pago) return res.status(404).json({ mensaje: 'Esta exequia no tiene pago registrado' })

    const seguimiento = await traerSeguimiento(id)
    if (seguimiento?.estado === 'CERRADO')
      return res.status(409).json({
        mensaje: 'La confirmación ya se cerró con este pago. Reábrela primero.',
      })

    await db.query('DELETE FROM h360_exequia_pago WHERE exequia_id = ?', [id])
    const [[ex]] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    await insertarHistorial(id, ex?.estado, ex?.estado, usuario,
      `Pago anulado (lo había confirmado ${pago.confirmado_nombre || pago.confirmado_por}) — ${motivo}`)

    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = {
  obtener, guardar, cerrar, reabrir, fotoPago,
  pagosPendientes, pagosConfirmados, confirmarPago, anularPago,
}
