const db = require('../config/db')
const { buscarUsuarioPorSam } = require('../services/ldap.service')
const { sendTextoSimple }     = require('../../services/whatsappService')
const gchat                   = require('../services/googleChat.service')
const karingsoft              = require('../services/karingsoft.service')
const { referenciaServicio, contratoONada, contratoValido, MIN_LARGO_CONTRATO } = require('../utils/contrato')

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
         a.contrato           AS contrato,
         v.placa              AS vehiculo_placa,
         v.marca              AS vehiculo_marca,
         v.modelo             AS vehiculo_modelo,
         sg.estado            AS seguimiento_estado,
         sg.fecha             AS seguimiento_fecha,
         pg.confirmado_at     AS pago_confirmado_at,
         pg.confirmado_por    AS pago_confirmado_por,
         pg.confirmado_nombre AS pago_confirmado_nombre
    FROM exequias e
    JOIN asistencias a ON a.id = e.asistencia_id
    LEFT JOIN vehiculos v ON v.id = e.vehiculo_id
    LEFT JOIN h360_exequia_seguimiento sg ON sg.exequia_id = e.id
    LEFT JOIN h360_exequia_pago        pg ON pg.exequia_id = e.id
`

// Estados en que una asistencia ya debería tener exequia programada. NUEVO
// queda fuera —apenas se está recibiendo— y los terminales también.
const ESTADOS_VIVOS = ['ASISTENCIA', 'PRESERVACION', 'ENCOFRADO', 'ENCUENTRO', 'SALA', 'APROBACION']

/**
 * GET /exequias/:id/formato-r13
 *
 * Datos del formato "Exequias / Bóvedas" que se diligencia al confirmar. No se
 * guardan en H360: se leen del ERP cada vez, porque allá es donde se corrigen.
 * El vínculo es el número de contrato de la asistencia.
 */
async function formatoR13(req, res, next) {
  try {
    const { id } = req.params
    const [[ex]] = await db.query(
      `SELECT e.id, e.estado, a.codigo AS asistencia_codigo, a.contrato,
              a.nombre_ser_querido
         FROM exequias e JOIN asistencias a ON a.id = e.asistencia_id
        WHERE e.id = ?`, [id])
    if (!ex) return res.status(404).json({ mensaje: 'Exequia no encontrada' })

    const contrato = contratoONada(ex.contrato)
    if (!contrato)
      return res.status(409).json({
        mensaje: 'La asistencia no tiene número de contrato, que es con lo que se consulta el ERP.',
        falta_contrato: true,
      })

    const datos = await karingsoft.formatoR13(contrato)
    if (!datos)
      return res.status(404).json({
        mensaje: `El ERP no tiene una orden de servicio con el contrato ${contrato}.`,
        contrato,
      })

    res.json({ ...datos, h360: { exequia_id: ex.id, asistencia: ex.asistencia_codigo } })
  } catch (err) {
    // Que el ERP no responda no es un error de H360: se dice qué pasó.
    console.warn('[exequias] formatoR13:', err.message)
    res.status(502).json({ mensaje: `No se pudo consultar el ERP: ${err.message}` })
  }
}

/**
 * POST /exequias/:id/contrato   { contrato }
 *
 * Carga el contrato que le falta a la asistencia, desde la exequia: es ahí
 * donde se descubre que falta, al no poder sacar el R-13.
 *
 * Se consulta el ERP ANTES de guardar. Un contrato equivocado guardado es
 * peor que uno ausente: el ausente se nota, el equivocado trae los datos de
 * otro servicio al R-13 y nadie lo revisa.
 *
 * Solo rellena lo que falta. Reemplazar un contrato que ya sirve es editar
 * el F-01, y para eso está la reapertura.
 */
async function cargarContrato(req, res, next) {
  try {
    const { id } = req.params
    const propuesto = String(req.body?.contrato ?? '').trim()
    if (!contratoValido(propuesto))
      return res.status(400).json({
        mensaje: `El contrato debe tener al menos ${MIN_LARGO_CONTRATO} caracteres e incluir números.`,
      })

    const [[ex]] = await db.query(
      `SELECT e.id, e.asistencia_id, a.contrato, a.codigo AS asistencia_codigo
         FROM exequias e JOIN asistencias a ON a.id = e.asistencia_id
        WHERE e.id = ?`, [id])
    if (!ex) return res.status(404).json({ mensaje: 'Exequia no encontrada' })

    if (contratoONada(ex.contrato))
      return res.status(409).json({
        mensaje: `La asistencia ya tiene el contrato ${ex.contrato}. Para cambiarlo hay que reabrir el F-01.`,
      })

    if (!karingsoft.configurado())
      return res.status(503).json({ mensaje: 'La conexión al ERP no está configurada' })

    let datos
    try {
      datos = await karingsoft.formatoR13(propuesto)
    } catch (e) {
      console.warn('[exequias] cargarContrato:', e.message)
      return res.status(502).json({ mensaje: `No se pudo consultar el ERP: ${e.message}` })
    }
    if (!datos)
      return res.status(404).json({
        mensaje: `El ERP no tiene una orden de servicio con el contrato ${propuesto}. Verifica el número.`,
      })

    await db.query('UPDATE asistencias SET contrato = ? WHERE id = ?', [propuesto, ex.asistencia_id])
    await historialContratoCargado(ex.asistencia_id, propuesto, req.user)

    res.json({
      ok: true,
      contrato: propuesto,
      ...datos,
      h360: { exequia_id: ex.id, asistencia: ex.asistencia_codigo },
    })
  } catch (err) { next(err) }
}

/** Queda en el historial de la ASISTENCIA: es un dato que entró por un camino
 *  lateral y conviene saber quién lo puso. Ojo con el nombre: llamarla
 *  insertarHistorial tapaba —por hoisting— a la del historial de exequias que
 *  está arriba, y todo este controlador terminaba escribiendo en la tabla
 *  equivocada. */
async function historialContratoCargado(asistenciaId, contrato, user) {
  try {
    const [[a]] = await db.query('SELECT estado FROM asistencias WHERE id = ?', [asistenciaId])
    // No es un cambio de estado: desde y hasta son el mismo, y el dato real
    // va en el comentario. usuario_id no admite nulo.
    await db.query(
      `INSERT INTO asistencia_historial
       (asistencia_id, estado_desde, estado_hasta, usuario_id, nombre_usuario, comentario)
       VALUES (?,?,?,?,?,?)`,
      [asistenciaId, a?.estado ?? null, a?.estado ?? 'SIN_ESTADO',
       user?.usuario || 'sistema', user?.nombre || null,
       `Contrato ${contrato} cargado desde la exequia (formato R-13)`])
  } catch (e) {
    // El historial no puede tumbar la carga del contrato.
    console.warn('[exequias] historial contrato:', e.message)
  }
}

// GET /exequias/pendientes — asistencias vivas que todavía no tienen exequia.
// Una cancelada no cuenta: el caso vuelve a quedar sin programar.
async function pendientes(req, res, next) {
  try {
    const [rows] = await db.query(
      `SELECT a.id, a.codigo, a.nombre_ser_querido, a.contrato, a.estado, a.created_at
         FROM asistencias a
    LEFT JOIN exequias e ON e.asistencia_id = a.id AND e.estado <> 'CANCELADA'
        WHERE e.id IS NULL
          AND a.sin_exequias_at IS NULL
          AND a.estado IN (${ESTADOS_VIVOS.map(() => '?').join(',')})
        ORDER BY FIELD(a.estado, ${ESTADOS_VIVOS.map(() => '?').join(',')}) DESC,
                 a.created_at ASC`,
      [...ESTADOS_VIVOS, ...ESTADOS_VIVOS]
    )
    res.json(rows)
  } catch (err) { next(err) }
}

/**
 * POST /exequias/sin-exequias/:asistenciaId/marcar   { motivo }
 *
 * Saca una asistencia del panel de pendientes porque nunca va a tener
 * exequia. Queda el motivo y el autor: es una excepción, y dentro de un mes
 * alguien va a preguntar por qué esa asistencia no aparece.
 */
async function marcarSinExequias(req, res, next) {
  try {
    const { asistenciaId } = req.params
    const motivo = String(req.body?.motivo || '').trim()
    if (!motivo) return res.status(400).json({ error: 'El motivo es obligatorio' })

    const [[a]] = await db.query(
      'SELECT id, codigo, estado, sin_exequias_at FROM asistencias WHERE id = ?', [asistenciaId])
    if (!a) return res.status(404).json({ error: 'Asistencia no encontrada' })
    if (a.sin_exequias_at)
      return res.status(409).json({ error: 'La asistencia ya está marcada como sin exequias' })

    // Marcarla teniendo una exequia viva dejaría el tablero contradiciéndose:
    // la exequia seguiría programada y la asistencia diría que no la requiere.
    const [[viva]] = await db.query(
      `SELECT id FROM exequias WHERE asistencia_id = ? AND estado <> 'CANCELADA' LIMIT 1`,
      [asistenciaId])
    if (viva)
      return res.status(409).json({
        error: 'La asistencia tiene una exequia activa. Cancélala primero.' })

    const { usuario, nombre } = req.user || {}
    await db.query(
      `UPDATE asistencias
          SET sin_exequias_motivo = ?, sin_exequias_por = ?,
              sin_exequias_por_nombre = ?, sin_exequias_at = NOW()
        WHERE id = ?`,
      [motivo, usuario, nombre || null, asistenciaId])

    res.json({ ok: true, asistencia_id: Number(asistenciaId), codigo: a.codigo })
  } catch (err) { next(err) }
}

/** POST /exequias/sin-exequias/:asistenciaId/quitar — vuelve al panel. */
async function quitarSinExequias(req, res, next) {
  try {
    const { asistenciaId } = req.params
    const [[a]] = await db.query(
      'SELECT id, codigo, sin_exequias_at FROM asistencias WHERE id = ?', [asistenciaId])
    if (!a) return res.status(404).json({ error: 'Asistencia no encontrada' })
    if (!a.sin_exequias_at)
      return res.status(409).json({ error: 'La asistencia no está marcada como sin exequias' })

    await db.query(
      `UPDATE asistencias
          SET sin_exequias_motivo = NULL, sin_exequias_por = NULL,
              sin_exequias_por_nombre = NULL, sin_exequias_at = NULL
        WHERE id = ?`, [asistenciaId])

    res.json({ ok: true, asistencia_id: Number(asistenciaId), codigo: a.codigo })
  } catch (err) { next(err) }
}

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
      destino_final, lugar_destino_final, requiere_confirmacion_pago,
      gestiono_obituario,
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
       (asistencia_id, tipo, fecha, hora, lugar, barrio, parroquia, direccion, observaciones,
        destino_final, lugar_destino_final, requiere_confirmacion_pago,
        gestiono_obituario, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [asistencia_id, tipo, fecha, hora || null, lugar,
       barrio || null, parroquia || null, direccion || null,
       observaciones || null,
       // El tipo se propone desde el encofrado; ambos son opcionales.
       ['INHUMACION', 'CREMACION'].includes(destino_final) ? destino_final : null,
       String(lugar_destino_final ?? '').trim() || null,
       // Lo marca quien registra la exequia; recepción lo corrige al coordinar.
       // Una ceremonia no se legaliza —no hay parroquia ni cementerio cobrando
       // por adelantado—, así que ahí el check no aplica y nunca entra a la
       // bandeja del tramitador.
       (tipo !== 'CEREMONIA' && requiere_confirmacion_pago) ? 1 : 0,
       // Sin responder es NULL, que no es lo mismo que "no se gestionó".
       gestiono_obituario == null ? null : (gestiono_obituario ? 1 : 0),
       usuario]
    )
    await insertarHistorial(r.insertId, null, 'PENDIENTE_CONFIRMAR', usuario, 'Exequia creada')

    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [r.insertId])
    res.status(201).json(nueva[0])
  } catch (err) { next(err) }
}

// PATCH /exequias/:id — editable mientras no esté en un estado terminal
const CAMPOS_EDITABLES = ['tipo','fecha','hora','lugar','barrio','parroquia','direccion','observaciones',
                          'destino_final','lugar_destino_final','requiere_confirmacion_pago',
                          'gestiono_obituario']

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
    // Lo mismo con el destino: '' no es un valor del ENUM.
    if (updates.destino_final === '') updates.destino_final = null
    // El check llega como booleano desde la pantalla; la columna es TINYINT.
    if (updates.requiere_confirmacion_pago !== undefined)
      updates.requiere_confirmacion_pago = updates.requiere_confirmacion_pago ? 1 : 0
    // El obituario admite tres estados: sí, no y sin responder.
    if (updates.gestiono_obituario !== undefined)
      updates.gestiono_obituario = updates.gestiono_obituario == null
        ? null : (updates.gestiono_obituario ? 1 : 0)
    if (!Object.keys(updates).length)
      return res.status(400).json({ mensaje: 'Nada que actualizar' })

    // Una ceremonia no se legaliza. Se fuerza aquí y no sólo en la pantalla
    // para cubrir los dos caminos: que llegue marcada, y que el tipo cambie a
    // CEREMONIA dejando atrás un check que ya no aplica.
    if ((updates.tipo ?? antes.tipo) === 'CEREMONIA')
      updates.requiere_confirmacion_pago = 0

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
// En pantalla este paso se llama "coordinar": saca la exequia de Coordinación
// de exequias y la deja esperando vehículo. En el código y en la API sigue
// siendo confirmar, que es como nació.
async function confirmar(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { nota } = req.body
    const [rows] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (rows[0].estado !== 'PENDIENTE_CONFIRMAR')
      return res.status(409).json({ mensaje: `Solo se coordinan exequias que estén en Coordinación de exequias (esta está en ${rows[0].estado})` })

    await db.query(
      `UPDATE exequias
         SET estado='PENDIENTE_VEHICULO', confirmada_por=?, confirmada_at=NOW(), confirmacion_nota=?
       WHERE id=?`,
      [usuario, nota || null, id]
    )
    await insertarHistorial(id, 'PENDIENTE_CONFIRMAR', 'PENDIENTE_VEHICULO', usuario, nota || 'Coordinada')
    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])

    const ex = nueva[0]
    gchat.enviarOperaciones([
      `✅ *${ex.tipo === 'CEREMONIA' ? 'Ceremonia' : 'Exequia'} coordinada* — ${ex.asistencia_codigo}`,
      `Ser querido: ${ex.ser_querido || 's/n'}`,
      `📅 ${fechaHoraLarga(ex.fecha, ex.hora)}${ex.hora ? '' : '  🕐 hora por definir'}`,
      `📍 ${[ex.lugar, ex.barrio, ex.parroquia].filter(Boolean).join(', ')}`,
      ex.direccion ? `Dirección: ${ex.direccion}` : null,
      `Coordinó: ${usuario}`,
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

const ETIQUETA_DESTINO = { INHUMACION: 'Inhumación', CREMACION: 'Cremación' }

/** "Cremación en Jardines La Colina" — vacío si no se ha definido. */
function destinoLargo(ex) {
  const tipo  = ETIQUETA_DESTINO[ex.destino_final] || ''
  const lugar = String(ex.lugar_destino_final || '').trim()
  if (!tipo && !lugar) return ''
  if (!lugar) return tipo
  return tipo ? `${tipo} en ${lugar}` : `Destino final: ${lugar}`
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
/**
 * Le dice al conductor que ya no va. `porque` cambia el remate según lo que
 * pasó: no es lo mismo que el servicio pasara a otro conductor a que la
 * exequia se haya devuelto a coordinación, y decirle lo que no es lo deja
 * esperando una llamada que no llega.
 */
async function avisarConductorRelevado(exequiaId, conductorId, porque = 'reasignada') {
  try {
    const [[ex]] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [exequiaId])
    if (!ex) return { ok: false, motivo: 'Exequia no encontrada' }

    const conductor = await buscarUsuarioPorSam(conductorId)
    if (!conductor?.telefono)
      return { ok: false, motivo: `${conductorId} no tiene celular en el directorio activo` }

    const REMATE = {
      reasignada:  'Este servicio quedo a cargo de otro conductor. Usted YA NO debe presentarse.',
      coordinacion:'Este servicio se devolvio a coordinacion y por ahora no tiene conductor. Usted YA NO debe presentarse; le avisaremos si vuelve a asignarsele.',
    }
    const texto = [
      `${ex.tipo === 'CEREMONIA' ? 'CEREMONIA' : 'EXEQUIA'} ${porque === 'coordinacion' ? 'sin asignar' : 'reasignada'}`,
      referenciaServicio(ex.contrato, ex.asistencia_codigo),
      fechaHoraLarga(ex.fecha, ex.hora),
      lugarLargo(ex),
      REMATE[porque] || REMATE.reasignada,
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
      // Con qué identificarlo: el contrato, y mientras no exista el código de
      // la asistencia. Sin esto el conductor no tiene cómo referirse al caso.
      referenciaServicio(ex.contrato, ex.asistencia_codigo),
      fechaHoraLarga(ex.fecha, ex.hora),
      lugarLargo(ex),
      `Carroza ${ex.vehiculo_placa || 's/n'}`,
      destinoLargo(ex),
      // La cruz antecede al nombre del ser querido, como en los avisos impresos.
      `Ser querido: + ${String(ex.ser_querido || 's/n').trim()}`,
      'Responde este mensaje con un OK',
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

/**
 * POST /exequias/:id/devolver-coordinacion
 *
 * Deshace la coordinación: la exequia vuelve a la primera columna como si
 * nunca hubiera salido. Hacía falta porque no había vuelta atrás —una exequia
 * coordinada por error se quedaba así— y tocaba corregirla en la base.
 *
 * Cancelar no sirve para esto: cancelar da de baja el servicio, y aquí el
 * servicio sigue en pie y lo que se deshace es un paso del trámite.
 *
 * Si ya había conductor avisado se le dice que no se presente, igual que
 * cuando lo relevan: el aviso ya salió y no se puede dejar colgado.
 */
async function devolverACoordinacion(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const motivo = String(req.body?.motivo ?? '').trim()
    if (!motivo)
      return res.status(400).json({ mensaje: 'El motivo es obligatorio: queda en el historial de la exequia.' })

    const [[ex]] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    if (!ex) return res.status(404).json({ mensaje: 'Exequia no encontrada' })

    if (ex.estado === 'PENDIENTE_CONFIRMAR')
      return res.status(409).json({ mensaje: 'Esta exequia ya está en Coordinación de exequias.' })
    if (['REALIZADA', 'CANCELADA'].includes(ex.estado))
      return res.status(409).json({
        mensaje: `No se puede devolver una exequia ${ex.estado.toLowerCase()}.`,
      })

    const conductorPrevio = ex.wa_enviado_at ? ex.conductor_id : null

    await db.query(
      `UPDATE exequias
          SET estado = 'PENDIENTE_CONFIRMAR',
              confirmada_por = NULL, confirmada_at = NULL, confirmacion_nota = NULL,
              vehiculo_id = NULL, conductor_id = NULL, asignada_por = NULL, asignada_at = NULL,
              wa_enviado_at = NULL, wa_telefono = NULL, wa_respuesta = NULL
        WHERE id = ?`, [id])

    await insertarHistorial(id, ex.estado, 'PENDIENTE_CONFIRMAR', usuario,
      'Devuelta a coordinación — ' + motivo)

    // El aviso al conductor va después de guardar: que falle el WhatsApp no
    // debe dejar la exequia a medio devolver.
    const avisoRelevo = conductorPrevio
      ? await avisarConductorRelevado(id, conductorPrevio, 'coordinacion')
      : null

    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    res.json({ ...nueva[0], aviso_relevo: avisoRelevo })
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

// Dónde se está velando. Una asistencia puede tener los dos homenajes —empieza
// en sala y termina en residencia, o al revés—, así que no basta con preguntar
// si existe uno de sala: manda el que siga abierto, y si ya cerraron los dos,
// el último que abrieron. El tablero anuncia dónde está el ser querido ahora,
// no dónde estuvo.
const SALA_CERRADA       = ['SALIDA_REGISTRADA', 'FINALIZADO']
const RESIDENCIA_CERRADA = ['COMPLETADO']

function velacionEn(r) {
  const homenajes = []
  if (r.sala_nombre)
    homenajes.push({ donde: 'SALA', creada: r.sala_creada,
                     abierto: !SALA_CERRADA.includes(r.sala_estado) })
  if (r.residencia_id)
    homenajes.push({ donde: 'RESIDENCIA', creada: r.residencia_creada,
                     abierto: !RESIDENCIA_CERRADA.includes(r.residencia_estado) })
  if (!homenajes.length) return null

  const abiertos = homenajes.filter(h => h.abierto)
  const entre    = abiertos.length ? abiertos : homenajes
  return entre.sort((a, b) => new Date(b.creada) - new Date(a.creada))[0].donde
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
             e.destino_final, e.lugar_destino_final,
             e.estado, e.conductor_id, v.placa AS vehiculo_placa,
             a.nombre_ser_querido AS ser_querido, a.contrato,
             (SELECT sv.nombre FROM homenajes_sala hs
                JOIN salas_velacion sv ON sv.id = hs.sala_id
               WHERE hs.asistencia_id = a.id
               ORDER BY hs.id DESC LIMIT 1)                       AS sala_nombre,
             (SELECT hs.estado FROM homenajes_sala hs
               WHERE hs.asistencia_id = a.id
               ORDER BY hs.id DESC LIMIT 1)                       AS sala_estado,
             (SELECT hs.created_at FROM homenajes_sala hs
               WHERE hs.asistencia_id = a.id
               ORDER BY hs.id DESC LIMIT 1)                       AS sala_creada,
             (SELECT hr.id FROM homenajes_residencia hr
               WHERE hr.asistencia_id = a.id
               ORDER BY hr.id DESC LIMIT 1)                       AS residencia_id,
             (SELECT hr.estado FROM homenajes_residencia hr
               WHERE hr.asistencia_id = a.id
               ORDER BY hr.id DESC LIMIT 1)                       AS residencia_estado,
             (SELECT hr.created_at FROM homenajes_residencia hr
               WHERE hr.asistencia_id = a.id
               ORDER BY hr.id DESC LIMIT 1)                       AS residencia_creada
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
      // Un contrato "PEND" o a medio escribir no es un dato: en la pantalla
      // de sala confunde más de lo que ayuda, así que no viaja.
      items: rows.map(r => ({
        ...r,
        contrato:    contratoONada(r.contrato),
        velacion_en: velacionEn(r),
      })),
    })
  } catch (err) { next(err) }
}

module.exports = {
  cargarContrato,
  marcarSinExequias, quitarSinExequias,
  listar, pendientes, obtener, crear, actualizar, eliminar, formatoR13,
  // Lo usa exequias_seguimiento.controller: el seguimiento y el pago quedan en
  // el mismo historial que el resto de la vida de la exequia.
  insertarHistorial,
  confirmar, asignarVehiculo, marcarRealizada, cancelar, devolverACoordinacion,
  programacionPublica,
}
