const db = require('../config/db')
const { buscarUsuarioPorSam } = require('../services/ldap.service')
const { sendTextoSimple }     = require('../../services/whatsappService')
const gchat                   = require('../services/googleChat.service')

// ─────────────────────────────────────────────────────────────
// Historial
// ─────────────────────────────────────────────────────────────
async function insertarHistorial(exequiaId, estadoDe, estadoA, usuarioId, nota) {
  await db.query(
    `INSERT INTO exequia_historial (exequia_id, estado_de, estado_a, usuario_id, nota)
     VALUES (?,?,?,?,?)`,
    [exequiaId, estadoDe, estadoA, usuarioId, nota || null]
  )
}

// ─────────────────────────────────────────────────────────────
// Query enriquecida — trae joins comunes
// ─────────────────────────────────────────────────────────────
const SELECT_FULL = `
  SELECT e.*,
         a.codigo             AS asistencia_codigo,
         a.nombre_ser_querido AS ser_querido,
         v.placa              AS vehiculo_placa,
         v.marca              AS vehiculo_marca,
         v.modelo             AS vehiculo_modelo
    FROM exequias e
    JOIN asistencias a ON a.id = e.asistencia_id
    LEFT JOIN vehiculos v ON v.id = e.vehiculo_id
`

// GET /exequias  ?estado=&fecha=&asistencia_id=&fecha_desde=&fecha_hasta=
async function listar(req, res, next) {
  try {
    const filtros = []
    const params  = []
    const { estado, fecha, asistencia_id, fecha_desde, fecha_hasta } = req.query
    if (estado) {
      const estados = String(estado).split(',').map(s => s.trim()).filter(Boolean)
      if (estados.length) {
        filtros.push(`e.estado IN (${estados.map(() => '?').join(',')})`)
        params.push(...estados)
      }
    }
    if (fecha)         { filtros.push('e.fecha = ?');       params.push(fecha) }
    if (asistencia_id) { filtros.push('e.asistencia_id = ?'); params.push(asistencia_id) }
    if (fecha_desde)   { filtros.push('e.fecha >= ?');      params.push(fecha_desde) }
    if (fecha_hasta)   { filtros.push('e.fecha <= ?');      params.push(fecha_hasta) }
    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `${SELECT_FULL} ${where} ORDER BY e.fecha DESC, e.hora`, params
    )
    res.json(rows)
  } catch (err) { next(err) }
}

// GET /exequias/:id
async function obtener(req, res, next) {
  try {
    const [rows] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [req.params.id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    const [hist] = await db.query(
      `SELECT * FROM exequia_historial WHERE exequia_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    )
    res.json({ ...rows[0], historial: hist })
  } catch (err) { next(err) }
}

// POST /exequias
async function crear(req, res, next) {
  try {
    const { usuario } = req.user
    const {
      asistencia_id, tipo, fecha, hora,
      lugar, barrio, parroquia, direccion, observaciones,
    } = req.body

    // La hora es opcional: al abrir el servicio la familia suele tener el día
    // pero todavía no la hora, y obligarla llevaba a inventar un valor.
    if (!asistencia_id || !tipo || !fecha || !lugar)
      return res.status(400).json({ mensaje: 'Faltan datos obligatorios: asistencia, tipo, fecha, lugar' })
    if (!['EXEQUIA', 'CEREMONIA'].includes(tipo))
      return res.status(400).json({ mensaje: 'Tipo debe ser EXEQUIA o CEREMONIA' })

    // Verifica que la asistencia exista
    const [a] = await db.query('SELECT id FROM asistencias WHERE id = ?', [asistencia_id])
    if (!a.length) return res.status(400).json({ mensaje: 'Asistencia no existe' })

    const [r] = await db.query(
      `INSERT INTO exequias
       (asistencia_id, tipo, fecha, hora, lugar, barrio, parroquia, direccion, observaciones, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [asistencia_id, tipo, fecha, hora || null, lugar,
       barrio || null, parroquia || null, direccion || null,
       observaciones || null, usuario]
    )
    await insertarHistorial(r.insertId, null, 'PENDIENTE_CONFIRMAR', usuario, 'Exequia creada')

    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [r.insertId])
    res.status(201).json(nueva[0])
  } catch (err) { next(err) }
}

// PATCH /exequias/:id — editable mientras no esté en un estado terminal
const CAMPOS_EDITABLES = ['tipo','fecha','hora','lugar','barrio','parroquia','direccion','observaciones']

async function actualizar(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const [rows] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    const antes = rows[0]

    // Una exequia se puede corregir mientras siga viva: las parroquias cambian
    // horarios y el dato tiene que poder seguirlos. Solo se cierran los estados
    // terminales, donde editar reescribiría algo ya ocurrido.
    if (['REALIZADA', 'CANCELADA'].includes(antes.estado))
      return res.status(409).json({
        mensaje: `No se puede editar una exequia ${antes.estado.toLowerCase()}.`,
      })

    const updates = {}
    for (const k of CAMPOS_EDITABLES) if (req.body[k] !== undefined) updates[k] = req.body[k]
    // Vaciar la hora la deja en NULL: '' no es un TIME válido y la rechaza MySQL.
    if (updates.hora === '') updates.hora = null
    if (!Object.keys(updates).length)
      return res.status(400).json({ mensaje: 'Nada que actualizar' })

    // Qué cambió, para dejarlo en el historial
    const norm = (k, v) => (k === 'fecha' ? String(v ?? '').slice(0, 10)
                          : k === 'hora'  ? String(v ?? '').slice(0, 5)
                          : String(v ?? ''))
    const cambios = Object.keys(updates)
      .filter(k => norm(k, updates[k]) !== norm(k, antes[k]))
      .map(k => `${k}: "${norm(k, antes[k]) || '—'}" → "${norm(k, updates[k]) || '—'}"`)

    await db.query('UPDATE exequias SET ? WHERE id = ?', [updates, id])

    if (cambios.length)
      await insertarHistorial(id, antes.estado, antes.estado, usuario, 'Editada — ' + cambios.join(' · '))

    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])

    // Si ya tenía conductor asignado y cambió algo que le afecta, hay que
    // volver a avisarle: el WhatsApp anterior quedó con datos viejos.
    const CLAVES_AVISO = ['fecha', 'hora', 'lugar', 'barrio', 'parroquia', 'direccion']
    const requiereReaviso = antes.conductor_id &&
      cambios.some(c => CLAVES_AVISO.includes(c.split(':')[0]))

    res.json({ ...nueva[0], cambios, requiere_reaviso: !!requiereReaviso })
  } catch (err) { next(err) }
}

// DELETE /exequias/:id
async function eliminar(req, res, next) {
  try {
    const { id } = req.params
    const { rol } = req.user
    const [rows] = await db.query('SELECT estado, conductor_id FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })

    // Una exequia ya realizada es historia del servicio: no se borra.
    // Para dar de baja una viva existe "cancelar", que deja motivo y rastro;
    // eliminar queda para errores de captura.
    if (rows[0].estado === 'REALIZADA')
      return res.status(409).json({
        mensaje: 'No se puede eliminar una exequia ya realizada. Queda como parte del historial del servicio.',
      })
    if (rows[0].estado === 'PROGRAMADA' && rol !== 'admin')
      return res.status(409).json({
        mensaje: 'Esta exequia ya está programada con vehículo y conductor. Usa "Cancelar" para darla de baja dejando el motivo registrado, o pide a un admin que la elimine.',
      })

    // exequia_historial cae por ON DELETE CASCADE
    await db.query('DELETE FROM exequias WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// POST /exequias/:id/confirmar
async function confirmar(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { nota } = req.body
    const [rows] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (rows[0].estado !== 'PENDIENTE_CONFIRMAR')
      return res.status(409).json({ mensaje: `Solo se confirman exequias en estado PENDIENTE_CONFIRMAR (actual: ${rows[0].estado})` })

    await db.query(
      `UPDATE exequias
         SET estado='PENDIENTE_VEHICULO', confirmada_por=?, confirmada_at=NOW(), confirmacion_nota=?
       WHERE id=?`,
      [usuario, nota || null, id]
    )
    await insertarHistorial(id, 'PENDIENTE_CONFIRMAR', 'PENDIENTE_VEHICULO', usuario, nota || 'Confirmada')
    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])

    const ex = nueva[0]
    gchat.enviarOperaciones([
      `✅ *${ex.tipo === 'CEREMONIA' ? 'Ceremonia' : 'Exequia'} confirmada* — ${ex.asistencia_codigo}`,
      `Ser querido: ${ex.ser_querido || 's/n'}`,
      `📅 ${fechaHoraLarga(ex.fecha, ex.hora)}${ex.hora ? '' : '  🕐 hora por definir'}`,
      `📍 ${[ex.lugar, ex.barrio, ex.parroquia].filter(Boolean).join(', ')}`,
      ex.direccion ? `Dirección: ${ex.direccion}` : null,
      `Confirmó: ${usuario}`,
      nota ? `Nota: ${nota}` : null,
      '',
      '_Pendiente asignar vehículo y conductor._',
    ].filter(Boolean).join('\n')).catch(() => {})

    res.json(ex)
  } catch (err) { next(err) }
}

// POST /exequias/:id/asignar-vehiculo
async function asignarVehiculo(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { vehiculo_id, conductor_id } = req.body

    if (!vehiculo_id || !conductor_id)
      return res.status(400).json({ mensaje: 'Vehículo y conductor son requeridos' })

    const [rows] = await db.query('SELECT estado, conductor_id, hora FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (!['PENDIENTE_VEHICULO', 'PROGRAMADA'].includes(rows[0].estado))
      return res.status(409).json({ mensaje: `No se puede asignar vehículo en estado ${rows[0].estado}` })

    // La hora es opcional mientras la exequia se está cuadrando, pero aquí deja
    // de serlo: asignar la programa y le manda el WhatsApp al conductor, que
    // sin hora no sabe a qué presentarse.
    if (!rows[0].hora)
      return res.status(409).json({
        mensaje: 'Falta la hora de la exequia. Edítala antes de asignar el vehículo: el conductor recibe el aviso con esa hora.',
        falta_hora: true,
      })

    const conductorAnterior = rows[0].conductor_id

    const [v] = await db.query('SELECT id, activo FROM vehiculos WHERE id = ?', [vehiculo_id])
    if (!v.length) return res.status(400).json({ mensaje: 'Vehículo no existe' })
    if (!v[0].activo) return res.status(400).json({ mensaje: 'Vehículo inactivo' })

    await db.query(
      `UPDATE exequias
         SET estado='PROGRAMADA', vehiculo_id=?, conductor_id=?, asignada_por=?, asignada_at=NOW()
       WHERE id=?`,
      [vehiculo_id, conductor_id, usuario, id]
    )
    await insertarHistorial(id, rows[0].estado, 'PROGRAMADA', usuario, `Vehículo ${vehiculo_id} · Conductor ${conductor_id}`)

    // Aviso al conductor por WhatsApp. La asignación ya quedó guardada, así que
    // un fallo aquí se reporta pero no la revierte ni devuelve error.
    const notificacion = await notificarConductor(id, conductor_id)

    // Si había otro conductor, se le avisa que ya no va: de lo contrario se
    // queda con el mensaje anterior y se presenta a un servicio que no es suyo.
    let notificacionRelevo = null
    if (conductorAnterior && conductorAnterior !== conductor_id) {
      notificacionRelevo = await avisarConductorRelevado(id, conductorAnterior)
    }

    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    res.json({ ...nueva[0], notificacion, notificacion_relevo: notificacionRelevo })
  } catch (err) { next(err) }
}

// Nombres fijos y sin tildes: el aviso va por WhatsApp y así no depende del
// ICU que tenga instalado el servidor ni de la zona horaria del proceso.
const DIAS  = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/**
 * "2026-09-19" + "15:00:00" → "SABADO Sep 19 , 3 PM" (sin minutos si son 00).
 *
 * mysql2 entrega las columnas DATE como objeto Date, no como texto: por eso
 * `fecha` se normaliza antes. Sin eso, String(fecha).slice(0,10) daba
 * "Sat Sep 19" y el conductor recibía el día en inglés.
 */
function fechaHoraLarga(fecha, hora) {
  const [y, m, d] = fecha instanceof Date
    ? [fecha.getFullYear(), fecha.getMonth() + 1, fecha.getDate()]
    : String(fecha ?? '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d || m > 12) return ''

  // Date.UTC evita que la zona horaria del servidor corra el día.
  const cal = `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${MESES[m - 1]} ${d}`

  // Number('') es 0, no NaN: sin mirar las partes, una hora vacía sería "12 AM".
  const partes = String(hora ?? '').split(':')
  if (partes.length < 2 || partes[0] === '') return cal
  const [hh, mm] = partes.map(Number)
  if (Number.isNaN(hh) || hh < 0 || hh > 23) return cal

  const h12 = hh % 12 === 0 ? 12 : hh % 12
  const suf = hh < 12 ? 'AM' : 'PM'
  return `${cal} , ${mm ? `${h12}:${String(mm).padStart(2, '0')}` : h12} ${suf}`
}

/** Lugar + parroquia. Descarta los "N/A" que se escriben cuando no aplica. */
function lugarLargo(ex) {
  return [ex.lugar, ex.parroquia]
    .map(v => String(v || '').trim())
    .filter(v => v && v.toUpperCase() !== 'N/A')
    .join(' , ')
}

/**
 * Avisa a un conductor que fue relevado de una exequia.
 * No lanza ni registra en las columnas wa_*: esas guardan el envío al conductor
 * vigente, y pisarlas con este aviso perdería ese rastro.
 */
async function avisarConductorRelevado(exequiaId, conductorId) {
  try {
    const [[ex]] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [exequiaId])
    if (!ex) return { ok: false, motivo: 'Exequia no encontrada' }

    const conductor = await buscarUsuarioPorSam(conductorId)
    if (!conductor?.telefono)
      return { ok: false, motivo: `${conductorId} no tiene celular en el directorio activo` }

    const texto = [
      `${ex.tipo === 'CEREMONIA' ? 'CEREMONIA' : 'EXEQUIA'} reasignada`,
      fechaHoraLarga(ex.fecha, ex.hora),
      lugarLargo(ex),
      'Este servicio quedo a cargo de otro conductor. Usted YA NO debe presentarse.',
    ].filter(Boolean).join(' · ')

    await sendTextoSimple(conductor.telefono, texto)
    return { ok: true, conductor: conductor.nombre, telefono: conductor.telefono }
  } catch (err) {
    console.warn('[exequias] avisarConductorRelevado:', err.message)
    return { ok: false, motivo: err.message }
  }
}

// Arma el aviso y lo envía al celular que el conductor tenga en el AD.
// Nunca lanza: devuelve { ok, motivo } para que la UI informe qué pasó.
async function notificarConductor(exequiaId, conductorId) {
  const registrar = async (resultado, telefono = null) => {
    await db.query(
      `UPDATE exequias SET wa_enviado_at = ?, wa_telefono = ?, wa_respuesta = ? WHERE id = ?`,
      [resultado.ok ? new Date() : null, telefono, JSON.stringify(resultado), exequiaId]
    )
    return resultado
  }

  try {
    const [[ex]] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [exequiaId])
    if (!ex) return { ok: false, motivo: 'Exequia no encontrada' }

    const conductor = await buscarUsuarioPorSam(conductorId)
    if (!conductor)
      return registrar({ ok: false, motivo: `El conductor ${conductorId} no existe en el directorio` })
    if (!conductor.telefono)
      return registrar({
        ok: false,
        motivo: `${conductor.nombre} no tiene celular registrado en el directorio activo (campo "mobile")`,
      })

    const texto = [
      `${ex.tipo === 'CEREMONIA' ? 'CEREMONIA' : 'EXEQUIA'} asignada`,
      fechaHoraLarga(ex.fecha, ex.hora),
      lugarLargo(ex),
      `Carroza ${ex.vehiculo_placa || 's/n'}`,
      // La cruz antecede al nombre del ser querido, como en los avisos impresos.
      `Ser querido: + ${String(ex.ser_querido || 's/n').trim()}`,
    ].filter(Boolean).join(' · ')

    const envio = await sendTextoSimple(conductor.telefono, texto)
    return registrar({ ok: true, texto, provider: envio?.data || envio }, conductor.telefono)
  } catch (err) {
    console.warn('[exequias] notificarConductor:', err.message)
    return registrar({ ok: false, motivo: err.message })
  }
}

// POST /exequias/:id/marcar-realizada
async function marcarRealizada(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { nota } = req.body
    const [rows] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (rows[0].estado !== 'PROGRAMADA')
      return res.status(409).json({ mensaje: 'Solo se marcan como realizadas exequias PROGRAMADAS' })

    await db.query(`UPDATE exequias SET estado='REALIZADA' WHERE id=?`, [id])
    await insertarHistorial(id, 'PROGRAMADA', 'REALIZADA', usuario, nota || 'Marcada como realizada')
    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    res.json(nueva[0])
  } catch (err) { next(err) }
}

// POST /exequias/:id/cancelar
async function cancelar(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { motivo } = req.body
    if (!motivo) return res.status(400).json({ mensaje: 'Motivo requerido para cancelar' })
    const [rows] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (['REALIZADA', 'CANCELADA'].includes(rows[0].estado))
      return res.status(409).json({ mensaje: `Estado terminal: ${rows[0].estado}` })

    await db.query(`UPDATE exequias SET estado='CANCELADA', cancelada_motivo=? WHERE id=?`, [motivo, id])
    await insertarHistorial(id, rows[0].estado, 'CANCELADA', usuario, motivo)
    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    res.json(nueva[0])
  } catch (err) { next(err) }
}

// GET /publico/programacion/:token — sin auth
async function programacionPublica(req, res, next) {
  try {
    const { token } = req.params
    const esperado = process.env.PROGRAMACION_PUBLIC_TOKEN
    if (!esperado) return res.status(500).json({ mensaje: 'Servicio no configurado' })
    if (!token || token !== esperado) return res.status(404).json({ mensaje: 'No encontrado' })

    // Exequias del día actual en estado PROGRAMADA o REALIZADA, ordenadas por hora
    // Sala y residencia van como subconsultas, no como JOIN: una asistencia
    // podría tener más de un homenaje registrado y un JOIN duplicaría la
    // exequia en la pantalla.
    const [rows] = await db.query(`
      SELECT e.id, e.tipo, e.hora, e.lugar, e.barrio, e.parroquia, e.direccion,
             e.estado, e.conductor_id, v.placa AS vehiculo_placa,
             a.nombre_ser_querido AS ser_querido,
             (SELECT sv.nombre FROM homenajes_sala hs
                JOIN salas_velacion sv ON sv.id = hs.sala_id
               WHERE hs.asistencia_id = a.id
               ORDER BY hs.id DESC LIMIT 1)                       AS sala_nombre,
             (SELECT hr.id FROM homenajes_residencia hr
               WHERE hr.asistencia_id = a.id
               ORDER BY hr.id DESC LIMIT 1)                       AS residencia_id
        FROM exequias e
        JOIN asistencias a ON a.id = e.asistencia_id
   LEFT JOIN vehiculos  v ON v.id = e.vehiculo_id
       WHERE e.fecha = CURDATE()
         AND e.estado IN ('PROGRAMADA','REALIZADA')
    ORDER BY e.hora ASC
    `)
    res.json({
      ok: true,
      generado_at: new Date().toISOString(),
      count: rows.length,
      items: rows,
    })
  } catch (err) { next(err) }
}

module.exports = {
  listar, obtener, crear, actualizar, eliminar,
  confirmar, asignarVehiculo, marcarRealizada, cancelar,
  programacionPublica,
}
