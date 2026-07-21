const db   = require('../config/db')
const glpi = require('../services/glpi.service')

// Rol → estados en que puede trabajar
const ESTADOS_POR_ROL = {
  asistente:            ['ASISTENCIA'],
  tanatologo:           ['PRESERVACION'],
  asistente_tanatologo: ['ASISTENCIA', 'PRESERVACION'], // doble rol
  supervisora:          ['ENCOFRADO'],
}

// Rol → etapas que puede guardar
const ETAPAS_POR_ROL = {
  asistente:            ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE'],
  tanatologo:           ['F04_TANATOPRAXIA'],
  asistente_tanatologo: ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE', 'F04_TANATOPRAXIA'],
  supervisora:          ['F06_ENCOFRADO', 'F05_ENTREGA'],
  admin:                ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE', 'F04_TANATOPRAXIA', 'F06_ENCOFRADO', 'F05_ENTREGA'],
}

// Etapas requeridas para cerrar cada estado por rol
const ETAPAS_PARA_CERRAR = {
  asistente:            { ASISTENCIA:    ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE'] },
  tanatologo:           { PRESERVACION: ['F04_TANATOPRAXIA'] },
  asistente_tanatologo: { ASISTENCIA:    ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE'],
                          PRESERVACION: ['F04_TANATOPRAXIA'] },
  supervisora:          { ENCOFRADO:     ['F06_ENCOFRADO', 'F05_ENTREGA'] },
  admin:                { ASISTENCIA:    ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE'],
                          PRESERVACION: ['F04_TANATOPRAXIA'],
                          ENCOFRADO:     ['F06_ENCOFRADO', 'F05_ENTREGA'],
                          APROBACION:  [] },
}

// Transiciones del flujo — cada rol puede avanzar desde su estado
const TRANSICIONES = {
  NUEVO:       { siguiente: 'ASISTENCIA',    roles: ['admin'] },
  ASISTENCIA:    { siguiente: 'PRESERVACION', roles: ['asistente', 'asistente_tanatologo', 'admin'] },
  PRESERVACION: { siguiente: 'ENCOFRADO',     roles: ['tanatologo', 'asistente_tanatologo', 'admin'] },
  ENCOFRADO:     { siguiente: 'APROBACION',  roles: ['supervisora', 'admin'] },
  APROBACION:  { siguiente: 'CERRADO',     roles: ['coordinador', 'contabilidad', 'admin'] },
}

// Helper: insertar registro en historial con nombre completo del usuario
async function insertarHistorial(asistencia_id, estado_desde, estado_hasta, usuario_id, nombre_usuario, comentario = null) {
  await db.query(
    `INSERT INTO asistencia_historial
     (asistencia_id, estado_desde, estado_hasta, usuario_id, nombre_usuario, comentario)
     VALUES (?,?,?,?,?,?)`,
    [asistencia_id, estado_desde, estado_hasta, usuario_id, nombre_usuario || null, comentario]
  )
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
    const { estado, identificacion, fecha_desde, fecha_hasta, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const { rol, usuario } = req.user

    let conditions = []
    const params   = []

    // Filtrar por rol operativo
    if (rol === 'asistente') {
      conditions.push('(asistente_id = ? OR asistente_id IS NULL)')
      params.push(usuario)
      if (!estado) { conditions.push("estado IN ('NUEVO','ASISTENCIA')") }
    } else if (rol === 'tanatologo') {
      conditions.push('(tanatologo_id = ? OR tanatologo_id IS NULL)')
      params.push(usuario)
      if (!estado) { conditions.push("estado = 'PRESERVACION'") }
    } else if (rol === 'asistente_tanatologo') {
      if (!estado) { conditions.push("estado IN ('ASISTENCIA','PRESERVACION')") }
    } else if (rol === 'supervisora') {
      if (!estado) { conditions.push("estado = 'ENCOFRADO'") }
    }

    if (estado)        { conditions.push('estado = ?');            params.push(estado) }
    if (identificacion){ conditions.push('identificacion LIKE ?'); params.push(`%${identificacion}%`) }
    if (fecha_desde)   { conditions.push('DATE(created_at) >= ?'); params.push(fecha_desde) }
    if (fecha_hasta)   { conditions.push('DATE(created_at) <= ?'); params.push(fecha_hasta) }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

    const [rows] = await db.query(
      `SELECT id, codigo, estado, nombre_ser_querido, identificacion,
              nombre_contacto, telefono_contacto, lugar_asistencia, causa_fallecimiento,
              asesor_id, asistente_id, tanatologo_id, created_at, updated_at
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

// GET /asistencias/:id/historial  — trazabilidad independiente
async function obtenerHistorial(req, res, next) {
  try {
    const { id } = req.params
    const [rows] = await db.query('SELECT id FROM asistencias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })

    const [historial] = await db.query(
      `SELECT id, estado_desde, estado_hasta, usuario_id, nombre_usuario, comentario, created_at
       FROM asistencia_historial
       WHERE asistencia_id = ?
       ORDER BY created_at ASC`,
      [id]
    )
    res.json(historial)
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
    const { usuario, nombre } = req.user
    const codigo = await generarCodigo()
    const {
      nombre_ser_querido, identificacion, contrato, certificado_defuncion,
      peso_aproximado, causa_fallecimiento, categoria_sanitaria,
      nombre_contacto, telefono_contacto,
      lugar_asistencia, condiciones_logisticas, conductor, fecha_contacto,
    } = req.body

    const [result] = await db.query(
      `INSERT INTO asistencias
       (codigo, nombre_ser_querido, identificacion, contrato, certificado_defuncion,
        peso_aproximado, causa_fallecimiento, categoria_sanitaria,
        nombre_contacto, telefono_contacto,
        lugar_asistencia, condiciones_logisticas, conductor, fecha_contacto, asesor_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        codigo, nombre_ser_querido, identificacion, contrato, certificado_defuncion,
        peso_aproximado, causa_fallecimiento, categoria_sanitaria || null,
        nombre_contacto, telefono_contacto,
        lugar_asistencia, JSON.stringify(condiciones_logisticas || []),
        conductor, fecha_contacto || null, usuario,
      ]
    )

    await insertarHistorial(result.insertId, null, 'NUEVO', usuario, nombre)

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
    const { usuario, nombre } = req.user

    const [rows] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })
    if (rows[0].estado !== 'NUEVO')
      return res.status(400).json({ mensaje: 'Solo se pueden asignar actores en estado NUEVO' })

    const updates = {}
    if (asistente_id)  updates.asistente_id  = asistente_id
    if (tanatologo_id) updates.tanatologo_id = tanatologo_id
    updates.estado = 'ASISTENCIA'

    await db.query('UPDATE asistencias SET ? WHERE id = ?', [updates, id])
    await insertarHistorial(
      id, 'NUEVO', 'ASISTENCIA', usuario, nombre,
      `Actores asignados: ${asistente_id || '-'} / ${tanatologo_id || '-'}`
    )

    const [actualizada] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    res.json(actualizada[0])
  } catch (err) { next(err) }
}

// PATCH /asistencias/:id/estado
async function cambiarEstado(req, res, next) {
  try {
    const { id } = req.params
    const { rol, usuario, nombre } = req.user
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
    await insertarHistorial(id, asistencia.estado, nuevoEstado, usuario, nombre, comentario || null)

    const [actualizada] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])

    // Notificar a GLPI en segundo plano (no bloquear respuesta)
    glpi.notificarTransicion(actualizada[0].glpi_ticket_id, nuevoEstado, actualizada[0])
      .catch(err => console.warn('[GLPI] notificarTransicion:', err.message))

    res.json(actualizada[0])
  } catch (err) { next(err) }
}

// Registra el uso del cofre al completar F-06 (fire-and-forget, no bloquea el guardado)
async function registrarUsoCofre(datos, asistencia_id, usuario_id) {
  const consecutivo = String(datos?.consecutivo_cofre || '').trim()
  const tipo = datos?.destino_final
  if (!consecutivo || !['INHUMACION', 'CREMACION'].includes(tipo)) return

  await db.query(
    `INSERT INTO cofres (consecutivo, ultimo_tipo, veces_usado, primer_uso_at, ultimo_uso_at)
     VALUES (?, ?, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       veces_usado = veces_usado + 1,
       ultimo_tipo = VALUES(ultimo_tipo),
       ultimo_uso_at = NOW()`,
    [consecutivo, tipo]
  )

  const [rows] = await db.query('SELECT id FROM cofres WHERE consecutivo = ?', [consecutivo])
  if (!rows.length) return
  const cofre_id = rows[0].id

  await db.query(
    `INSERT INTO cofre_usos (cofre_id, asistencia_id, tipo, observaciones, usuario_id)
     VALUES (?,?,?,?,?)`,
    [cofre_id, asistencia_id, tipo, datos?.observaciones || null, usuario_id]
  )
}

// POST /asistencias/:id/etapa
async function guardarEtapa(req, res, next) {
  try {
    const { id } = req.params
    const { etapa, datos, completar: completarRaw = false } = req.body
    const { rol, usuario, nombre } = req.user
    let completar = completarRaw
    let reprocesoDetectado = false

    const permitidas = ETAPAS_POR_ROL[rol] || []
    if (!permitidas.includes(etapa))
      return res.status(403).json({ mensaje: `Tu rol (${rol}) no puede guardar la etapa ${etapa}` })

    const [asist] = await db.query('SELECT estado FROM asistencias WHERE id = ?', [id])
    if (!asist.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })

    // Reproceso: si F-05 marca requiere_reproceso=true al cerrar, no completar y no avanzar
    if (etapa === 'F05_ENTREGA' && completar && datos?.requiere_reproceso === true) {
      completar = false
      reprocesoDetectado = true
    }

    // Persistir la etapa
    await db.query(
      `INSERT INTO asistencia_etapas (asistencia_id, etapa, datos, usuario_id, completado)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE datos=VALUES(datos), usuario_id=VALUES(usuario_id),
         completado=VALUES(completado), updated_at=NOW()`,
      [id, etapa, JSON.stringify(datos), usuario, completar ? 1 : 0]
    )

    // Registro de uso de cofre al completar F-06 (fire-and-forget)
    if (etapa === 'F06_ENCOFRADO' && completar) {
      registrarUsoCofre(datos, id, usuario).catch(e => console.warn('[cofres]', e.message))
    }

    // Avance de estado: solo si TODAS las etapas requeridas del estado actual están completas
    if (completar) {
      const estadoActual  = asist[0].estado
      const transicion    = TRANSICIONES[estadoActual]
      const estadosPorRol = ESTADOS_POR_ROL[rol] || []
      const requeridas    = (ETAPAS_PARA_CERRAR[rol] || {})[estadoActual] || []

      let puedeAvanzar = true
      if (requeridas.length > 0) {
        const placeholders = requeridas.map(() => '?').join(',')
        const [rows] = await db.query(
          `SELECT etapa FROM asistencia_etapas
           WHERE asistencia_id=? AND completado=1 AND etapa IN (${placeholders})`,
          [id, ...requeridas]
        )
        const completadas = new Set(rows.map(r => r.etapa))
        puedeAvanzar = requeridas.every(e => completadas.has(e))
      }

      if (puedeAvanzar && transicion && estadosPorRol.includes(estadoActual) && transicion.roles.includes(rol)) {
        await db.query('UPDATE asistencias SET estado=? WHERE id=?', [transicion.siguiente, id])
        await insertarHistorial(id, estadoActual, transicion.siguiente, usuario, nombre)
        glpi.notificarTransicion && glpi.notificarTransicion(null, transicion.siguiente, asist[0])
          .catch(e => console.warn('[GLPI]', e.message))
      }
    }

    const [actualizada] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    res.json({
      ok: true,
      mensaje: reprocesoDetectado
        ? 'Reproceso registrado — permanece en Encofrado'
        : `Etapa ${etapa} guardada`,
      reproceso: reprocesoDetectado,
      asistencia: actualizada[0],
    })
  } catch (err) { next(err) }
}

// POST /asistencias/:id/aprobar
async function aprobar(req, res, next) {
  try {
    const { id } = req.params
    const { rol, usuario, nombre } = req.user
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
      await insertarHistorial(id, 'APROBACION', 'RECHAZADO', usuario, nombre, comentario)
    } else {
      const [aprobaciones] = await db.query(
        'SELECT * FROM asistencia_aprobaciones WHERE asistencia_id = ? AND aprobado = 1', [id]
      )
      if (aprobaciones.length >= 2) {
        await db.query('UPDATE asistencias SET estado=?, closed_at=NOW() WHERE id=?', ['CERRADO', id])
        await insertarHistorial(id, 'APROBACION', 'CERRADO', usuario, nombre)
        const [a] = await db.query('SELECT glpi_ticket_id FROM asistencias WHERE id=?', [id])
        if (a[0]?.glpi_ticket_id) glpi.cerrarTicket(a[0].glpi_ticket_id).catch(console.warn)
      }
    }

    const [actualizada] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    res.json(actualizada[0])
  } catch (err) { next(err) }
}

/**
 * POST /:id/nota
 * Agrega una nota/comentario al historial sin cambiar el estado.
 * Útil para que contabilidad registre notas de facturación en casos CERRADOS.
 */
async function agregarNota(req, res, next) {
  try {
    const { id } = req.params
    const { comentario } = req.body
    const { usuario, nombre } = req.user

    if (!comentario?.trim()) {
      return res.status(400).json({ mensaje: 'El comentario es requerido' })
    }

    const [[asistencia]] = await db.query('SELECT estado FROM asistencias WHERE id = ?', [id])
    if (!asistencia) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })

    await insertarHistorial(id, asistencia.estado, asistencia.estado, usuario, nombre, comentario.trim())
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listar, obtener, obtenerHistorial, obtenerEtapa, crear, asignarActores, cambiarEstado, guardarEtapa, aprobar, agregarNota }
