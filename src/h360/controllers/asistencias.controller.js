const db   = require('../config/db')
const glpi = require('../services/glpi.service')

// Rol → estados en que puede trabajar
const ESTADOS_POR_ROL = {
  asistente:            ['TRASLADO'],
  tanatologo:           ['PREPARACION'],
  asistente_tanatologo: ['TRASLADO', 'PREPARACION'], // doble rol
  supervisora:          ['ENTREGA'],
}

// Rol → etapas que puede guardar
const ETAPAS_POR_ROL = {
  asistente:            ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE'],
  tanatologo:           ['F04_TANATOPRAXIA'],
  asistente_tanatologo: ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE', 'F04_TANATOPRAXIA'],
  supervisora:          ['F05_ENTREGA'],
  admin:                ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE', 'F04_TANATOPRAXIA', 'F05_ENTREGA'],
}

// Transiciones del flujo — cada rol puede avanzar desde su estado
const TRANSICIONES = {
  NUEVO:       { siguiente: 'TRASLADO',    roles: ['admin'] },
  TRASLADO:    { siguiente: 'PREPARACION', roles: ['asistente', 'asistente_tanatologo', 'admin'] },
  PREPARACION: { siguiente: 'ENTREGA',     roles: ['tanatologo', 'asistente_tanatologo', 'admin'] },
  ENTREGA:     { siguiente: 'APROBACION',  roles: ['supervisora', 'admin'] },
  APROBACION:  { siguiente: 'CERRADO',     roles: ['coordinador', 'contabilidad', 'admin'] },
}

async function generarCodigo() {
  const year = new Date().getFullYear()
  const [rows] = await db.query('SELECT COUNT(*) as total FROM asistencias WHERE YEAR(created_at) = ?', [year])
  const n = (rows[0].total + 1).toString().padStart(4, '0')
  return `H360-${year}-${n}`
}

// GET /asistencias
async function listar(req, res, next) {
  try {
    const { estado, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const { rol, usuario } = req.user

    let conditions = []
    const params   = []

    // Filtrar por rol operativo
    if (rol === 'asistente') {
      conditions.push('(asistente_id = ? OR asistente_id IS NULL)')
      params.push(usuario)
      if (!estado) { conditions.push("estado IN ('NUEVO','TRASLADO')") }
    } else if (rol === 'tanatologo') {
      conditions.push('(tanatologo_id = ? OR tanatologo_id IS NULL)')
      params.push(usuario)
      if (!estado) { conditions.push("estado = 'PREPARACION'") }
    } else if (rol === 'asistente_tanatologo') {
      if (!estado) { conditions.push("estado IN ('TRASLADO','PREPARACION')") }
    } else if (rol === 'supervisora') {
      if (!estado) { conditions.push("estado = 'ENTREGA'") }
    }

    if (estado) { conditions.push('estado = ?'); params.push(estado) }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

    const [rows] = await db.query(
      `SELECT id, codigo, estado, nombre_ser_querido, nombre_contacto,
              lugar_asistencia, causa_fallecimiento, asesor_id,
              asistente_id, tanatologo_id, created_at, updated_at
       FROM asistencias ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM asistencias ${where}`, params)

    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { next(err) }
}

// GET /asistencias/:id
async function obtener(req, res, next) {
  try {
    const [rows] = await db.query('SELECT * FROM asistencias WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })

    const asistencia = rows[0]

    const [etapas]      = await db.query('SELECT * FROM asistencia_etapas WHERE asistencia_id = ?', [req.params.id])
    const [aprobaciones]= await db.query('SELECT * FROM asistencia_aprobaciones WHERE asistencia_id = ?', [req.params.id])
    const [historial]   = await db.query(
      'SELECT * FROM asistencia_historial WHERE asistencia_id = ? ORDER BY created_at ASC', [req.params.id]
    )

    asistencia.etapas      = etapas
    asistencia.aprobaciones= aprobaciones
    asistencia.historial   = historial
    res.json(asistencia)
  } catch (err) { next(err) }
}

// GET /asistencias/:id/etapa/:etapa
async function obtenerEtapa(req, res, next) {
  try {
    const { id, etapa } = req.params
    const [rows] = await db.query(
      'SELECT * FROM asistencia_etapas WHERE asistencia_id = ? AND etapa = ?', [id, etapa]
    )
    res.json(rows[0] || null)
  } catch (err) { next(err) }
}

// POST /asistencias
async function crear(req, res, next) {
  try {
    const { usuario } = req.user
    const codigo = await generarCodigo()
    const {
      nombre_ser_querido, identificacion, contrato, certificado_defuncion,
      peso_aproximado, causa_fallecimiento, nombre_contacto, telefono_contacto,
      lugar_asistencia, condiciones_logisticas, conductor, fecha_contacto,
    } = req.body

    const [result] = await db.query(
      `INSERT INTO asistencias
       (codigo, nombre_ser_querido, identificacion, contrato, certificado_defuncion,
        peso_aproximado, causa_fallecimiento, nombre_contacto, telefono_contacto,
        lugar_asistencia, condiciones_logisticas, conductor, fecha_contacto, asesor_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        codigo, nombre_ser_querido, identificacion, contrato, certificado_defuncion,
        peso_aproximado, causa_fallecimiento, nombre_contacto, telefono_contacto,
        lugar_asistencia, JSON.stringify(condiciones_logisticas || []),
        conductor, fecha_contacto || null, usuario,
      ]
    )

    await db.query(
      'INSERT INTO asistencia_historial (asistencia_id, estado_desde, estado_hasta, usuario_id) VALUES (?,?,?,?)',
      [result.insertId, null, 'NUEVO', usuario]
    )

    glpi.crearTicket({ id: result.insertId, codigo, nombre_ser_querido, lugar_asistencia, nombre_contacto })
      .then(ticketId => {
        if (ticketId) db.query('UPDATE asistencias SET glpi_ticket_id=? WHERE id=?', [ticketId, result.insertId])
      })
      .catch(err => console.warn('[GLPI] crearTicket:', err.message))

    const [nueva] = await db.query('SELECT * FROM asistencias WHERE id = ?', [result.insertId])
    res.status(201).json(nueva[0])
  } catch (err) { next(err) }
}

// POST /asistencias/:id/actores  — llamado por n8n para asignar asistente y tanatólogo
async function asignarActores(req, res, next) {
  try {
    const { id } = req.params
    const { asistente_id, tanatologo_id } = req.body
    const { usuario } = req.user

    const [rows] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })
    if (rows[0].estado !== 'NUEVO')
      return res.status(400).json({ mensaje: 'Solo se pueden asignar actores en estado NUEVO' })

    const updates = {}
    if (asistente_id)  updates.asistente_id  = asistente_id
    if (tanatologo_id) updates.tanatologo_id = tanatologo_id
    updates.estado = 'TRASLADO'

    await db.query('UPDATE asistencias SET ? WHERE id = ?', [updates, id])
    await db.query(
      'INSERT INTO asistencia_historial (asistencia_id, estado_desde, estado_hasta, usuario_id, comentario) VALUES (?,?,?,?,?)',
      [id, 'NUEVO', 'TRASLADO', usuario, `Actores asignados: ${asistente_id || '-'} / ${tanatologo_id || '-'}`]
    )

    const [actualizada] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    res.json(actualizada[0])
  } catch (err) { next(err) }
}

// PATCH /asistencias/:id/estado
async function cambiarEstado(req, res, next) {
  try {
    const { id } = req.params
    const { rol, usuario } = req.user
    const { estado: nuevoEstado, comentario } = req.body

    const [rows] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })

    const asistencia = rows[0]
    const transicion = TRANSICIONES[asistencia.estado]

    if (!transicion)
      return res.status(400).json({ mensaje: `El estado ${asistencia.estado} no permite avanzar` })
    if (transicion.siguiente !== nuevoEstado)
      return res.status(400).json({ mensaje: `El siguiente estado debe ser ${transicion.siguiente}` })
    if (!transicion.roles.includes(rol))
      return res.status(403).json({ mensaje: `Tu rol (${rol}) no puede ejecutar esta transición` })

    const updates = { estado: nuevoEstado }
    if (nuevoEstado === 'CERRADO') updates.closed_at = new Date()

    await db.query('UPDATE asistencias SET ? WHERE id = ?', [updates, id])
    await db.query(
      'INSERT INTO asistencia_historial (asistencia_id, estado_desde, estado_hasta, usuario_id, comentario) VALUES (?,?,?,?,?)',
      [id, asistencia.estado, nuevoEstado, usuario, comentario || null]
    )

    const [actualizada] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])

    // Notificar a GLPI en segundo plano (no bloquear respuesta)
    glpi.notificarTransicion(actualizada[0].glpi_ticket_id, nuevoEstado, actualizada[0])
      .catch(err => console.warn('[GLPI] notificarTransicion:', err.message))

    res.json(actualizada[0])
  } catch (err) { next(err) }
}

// POST /asistencias/:id/etapa
async function guardarEtapa(req, res, next) {
  try {
    const { id } = req.params
    const { etapa, datos, completar = false } = req.body
    const { rol, usuario } = req.user

    const permitidas = ETAPAS_POR_ROL[rol] || []
    if (!permitidas.includes(etapa))
      return res.status(403).json({ mensaje: `Tu rol (${rol}) no puede guardar la etapa ${etapa}` })

    const [asist] = await db.query('SELECT estado FROM asistencias WHERE id = ?', [id])
    if (!asist.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })

    await db.query(
      `INSERT INTO asistencia_etapas (asistencia_id, etapa, datos, usuario_id, completado)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE datos=VALUES(datos), usuario_id=VALUES(usuario_id),
         completado=VALUES(completado), updated_at=NOW()`,
      [id, etapa, JSON.stringify(datos), usuario, completar ? 1 : 0]
    )

    // Si completar=true y es la última etapa del rol, avanzar estado automáticamente
    if (completar) {
      const estadoActual = asist[0].estado
      const transicion   = TRANSICIONES[estadoActual]
      const etapasDelRol = ETAPAS_POR_ROL[rol] || []
      const estadioPorRol= ESTADOS_POR_ROL[rol] || []

      if (transicion && estadioPorRol.includes(estadoActual) && transicion.roles.includes(rol)) {
        // Verificar que todas las etapas del rol estén guardadas
        const [guardadas] = await db.query(
          'SELECT etapa FROM asistencia_etapas WHERE asistencia_id = ? AND etapa IN (?)',
          [id, etapasDelRol]
        )
        if (guardadas.length >= etapasDelRol.length) {
          await db.query('UPDATE asistencias SET estado=? WHERE id=?', [transicion.siguiente, id])
          await db.query(
            'INSERT INTO asistencia_historial (asistencia_id, estado_desde, estado_hasta, usuario_id) VALUES (?,?,?,?)',
            [id, estadoActual, transicion.siguiente, usuario]
          )
        }
      }
    }

    const [actualizada] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    res.json({ ok: true, mensaje: `Etapa ${etapa} guardada`, asistencia: actualizada[0] })
  } catch (err) { next(err) }
}

// POST /asistencias/:id/aprobar
async function aprobar(req, res, next) {
  try {
    const { id } = req.params
    const { rol, usuario } = req.user
    const { aprobado, comentario } = req.body

    const nivel = rol === 'contabilidad' ? 'contabilidad' : 'coordinador'

    const [rows] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })
    if (rows[0].estado !== 'APROBACION')
      return res.status(400).json({ mensaje: 'La asistencia no está en estado de aprobación' })

    await db.query(
      `INSERT INTO asistencia_aprobaciones (asistencia_id, nivel, aprobado, usuario_id, comentario, fecha)
       VALUES (?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE aprobado=VALUES(aprobado), usuario_id=VALUES(usuario_id),
         comentario=VALUES(comentario), fecha=NOW()`,
      [id, nivel, aprobado ? 1 : 0, usuario, comentario || null]
    )

    if (!aprobado) {
      await db.query('UPDATE asistencias SET estado=? WHERE id=?', ['RECHAZADO', id])
      await db.query(
        'INSERT INTO asistencia_historial (asistencia_id, estado_desde, estado_hasta, usuario_id, comentario) VALUES (?,?,?,?,?)',
        [id, 'APROBACION', 'RECHAZADO', usuario, comentario]
      )
    } else {
      const [aprobaciones] = await db.query(
        'SELECT * FROM asistencia_aprobaciones WHERE asistencia_id = ? AND aprobado = 1', [id]
      )
      if (aprobaciones.length >= 2) {
        await db.query('UPDATE asistencias SET estado=?, closed_at=NOW() WHERE id=?', ['CERRADO', id])
        await db.query(
          'INSERT INTO asistencia_historial (asistencia_id, estado_desde, estado_hasta, usuario_id) VALUES (?,?,?,?)',
          [id, 'APROBACION', 'CERRADO', usuario]
        )
        const [a] = await db.query('SELECT glpi_ticket_id FROM asistencias WHERE id=?', [id])
        if (a[0]?.glpi_ticket_id) glpi.cerrarTicket(a[0].glpi_ticket_id).catch(console.warn)
      }
    }

    const [actualizada] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    res.json(actualizada[0])
  } catch (err) { next(err) }
}

module.exports = { listar, obtener, obtenerEtapa, crear, asignarActores, cambiarEstado, guardarEtapa, aprobar }
