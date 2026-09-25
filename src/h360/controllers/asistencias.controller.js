const db    = require('../config/db')
const glpi  = require('../services/glpi.service')
const gchat = require('../services/googleChat.service')
const { PERMISOS_ABIERTOS } = require('../middleware/auth')

// El certificado de defunción se estaba llenando con "0" o "PTE" mientras no
// se tenía el número real, y eso lo daba por resuelto. Los reales son
// numéricos y largos (14 dígitos en los registros actuales).
const MIN_DIGITOS_CERTIFICADO = 7
const RE_CERTIFICADO = new RegExp(`^\\d{${MIN_DIGITOS_CERTIFICADO},}$`)
const certificadoValido = v => RE_CERTIFICADO.test(String(v ?? '').trim())

// Los nombres se registran en mayúsculas —así están en los listados, actas y
// avisos—, pero entraban como los escribiera cada asesor. Se normaliza en el
// servidor para que la regla no dependa de la pantalla desde la que se guarde.
const normalizarNombre = v => String(v ?? '').trim().toUpperCase()

// Rol → estados en que puede trabajar
const ESTADOS_POR_ROL = {
  asistente:            ['ASISTENCIA'],
  tanatologo:           ['PRESERVACION'],
  asistente_tanatologo: ['ASISTENCIA', 'PRESERVACION', 'ENCOFRADO'],
  supervisora:          ['ENCOFRADO', 'ENCUENTRO', 'SALA'],
}

// Rol → etapas que puede guardar
const ETAPAS_POR_ROL = {
  asistente:            ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE'],
  tanatologo:           ['F04_TANATOPRAXIA', 'F07_SALIDA_NO_CONFORME'],
  asistente_tanatologo: ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE', 'F04_TANATOPRAXIA', 'F06_ENCOFRADO', 'F07_SALIDA_NO_CONFORME'],
  supervisora:          ['F06_ENCOFRADO', 'F05_ENTREGA', 'F07_SALIDA_NO_CONFORME'],
  asesor:               ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE', 'F05_ENTREGA'],
  coordinador:          ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE'],
  admin:                ['F02_INVENTARIO_CUERPO', 'F03_INVENTARIO_RETOQUE', 'F04_TANATOPRAXIA', 'F06_ENCOFRADO', 'F05_ENTREGA', 'F07_SALIDA_NO_CONFORME'],
}

// Etapas requeridas para cerrar cada estado por rol.
// Flujo: ENCOFRADO(F06) → ENCUENTRO(F05) → SALA (manual) → APROBACION.
// F-03 no se exige para empezar a preservar —son las prendas de retoque que
// trae la familia y pueden llegar más tarde—, pero sí para encofrar: al cerrar
// el cofre ya no hay manera de inventariar lo que el ser querido lleva puesto.
const ETAPAS_PARA_CERRAR = {
  asistente:            { ASISTENCIA:   ['F02_INVENTARIO_CUERPO'] },
  tanatologo:           { PRESERVACION: ['F04_TANATOPRAXIA', 'F03_INVENTARIO_RETOQUE'] },
  asistente_tanatologo: { ASISTENCIA:   ['F02_INVENTARIO_CUERPO'],
                          PRESERVACION: ['F04_TANATOPRAXIA', 'F03_INVENTARIO_RETOQUE'],
                          ENCOFRADO:    ['F06_ENCOFRADO'] },
  supervisora:          { ENCOFRADO:    ['F06_ENCOFRADO'],
                          ENCUENTRO:    ['F05_ENTREGA'],
                          SALA:         [] },
  asesor:               { ENCUENTRO:    ['F05_ENTREGA'] },
  admin:                { ASISTENCIA:   ['F02_INVENTARIO_CUERPO'],
                          PRESERVACION: ['F04_TANATOPRAXIA', 'F03_INVENTARIO_RETOQUE'],
                          ENCOFRADO:    ['F06_ENCOFRADO'],
                          ENCUENTRO:    ['F05_ENTREGA'],
                          SALA:         [],
                          APROBACION:   [] },
}

// Requisitos para salir de cada estado, sin distinguir rol.
// Se derivan de ETAPAS_PARA_CERRAR, que los repite por rol con los mismos
// valores: qué etapas se exigen es una regla del proceso, no un permiso.
const REQUISITOS_CIERRE = Object.values(ETAPAS_PARA_CERRAR).reduce((acc, porEstado) => {
  for (const [estado, etapas] of Object.entries(porEstado)) acc[estado] = etapas
  return acc
}, {})

const ETIQUETA_ETAPA = {
  F02_INVENTARIO_CUERPO:  'F-02 Inventario recibido',
  F03_INVENTARIO_RETOQUE: 'F-03 Inventario retoque',
  F04_TANATOPRAXIA:       'F-04 Tanatopraxia',
  F05_ENTREGA:            'F-05 Encuentro',
  F06_ENCOFRADO:          'F-06 Encofrado',
  F07_SALIDA_NO_CONFORME: 'F-07 Salida no conforme',
}

// Devuelve las etapas que faltan por cerrar para poder salir de `estado`.
async function etapasPendientesPara(asistenciaId, estado) {
  const requeridas = REQUISITOS_CIERRE[estado] || []
  if (!requeridas.length) return []
  const [filas] = await db.query(
    `SELECT etapa FROM asistencia_etapas
      WHERE asistencia_id = ? AND completado = 1
        AND etapa IN (${requeridas.map(() => '?').join(',')})`,
    [asistenciaId, ...requeridas]
  )
  const cerradas = new Set(filas.map(f => f.etapa))
  return requeridas.filter(e => !cerradas.has(e))
}

// Columnas por las que puede ordenar el listado. Lista blanca: el nombre entra
// en el SQL, así que nunca se interpola lo que llegue por query.
const ORDEN_ESTADOS = ['NUEVO', 'ASISTENCIA', 'PRESERVACION', 'ENCOFRADO', 'ENCUENTRO',
                       'SALA', 'APROBACION', 'CERRADO', 'RECHAZADO', 'DESISTIDO']
const COLUMNAS_ORDEN = {
  codigo:             'codigo',
  contrato:           'contrato',
  nombre_ser_querido: 'nombre_ser_querido',
  nombre_contacto:    'nombre_contacto',
  lugar_asistencia:   'lugar_asistencia',
  // El estado ordena por avance del proceso: alfabéticamente "APROBACION" iría
  // antes que "NUEVO" y no diría nada.
  estado:             `FIELD(estado, ${ORDEN_ESTADOS.map(e => `'${e}'`).join(', ')})`,
  created_at:         'created_at',
}

// Transiciones del flujo
const TRANSICIONES = {
  NUEVO:        { siguiente: 'ASISTENCIA',   roles: ['asesor', 'coordinador', 'admin'] },
  ASISTENCIA:   { siguiente: 'PRESERVACION', roles: ['asistente', 'asistente_tanatologo', 'admin'] },
  PRESERVACION: { siguiente: 'ENCOFRADO',    roles: ['tanatologo', 'asistente_tanatologo', 'admin'] },
  ENCOFRADO:    { siguiente: 'ENCUENTRO',    roles: ['supervisora', 'coordinador', 'asistente_tanatologo', 'admin'] },
  ENCUENTRO:    { siguiente: 'SALA',         roles: ['asesor', 'supervisora', 'coordinador', 'admin'] },
  SALA:         { siguiente: 'APROBACION',   roles: ['supervisora', 'coordinador', 'admin'] },
  APROBACION:   { siguiente: 'CERRADO',      roles: ['coordinador', 'contabilidad', 'admin'] },
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

// Devuelve el próximo código H360-YYYY-####. Usa MAX del sufijo real, no COUNT,
// para no colisionar con huecos (borrados) ni con secuencias mixtas.
async function generarCodigo() {
  const year = new Date().getFullYear()
  const [rows] = await db.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(codigo, '-', -1) AS UNSIGNED)), 0) AS maxNum
     FROM asistencias
     WHERE codigo LIKE ?`,
    [`H360-${year}-%`]
  )
  const n = (Number(rows[0].maxNum) + 1).toString().padStart(4, '0')
  return `H360-${year}-${n}`
}

// GET /asistencias
async function listar(req, res, next) {
  try {
    const { estado, identificacion, q, fecha_desde, fecha_hasta, orden, dir, page = 1, limit = 20 } = req.query
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
      if (!estado) {
        // También ver casos en ENCOFRADO con salida no conforme pendiente (F-07)
        conditions.push(`(estado = 'PRESERVACION' OR EXISTS (
          SELECT 1 FROM asistencia_etapas ae
          WHERE ae.asistencia_id = asistencias.id
            AND ae.etapa = 'F07_SALIDA_NO_CONFORME'
            AND ae.completado = 0
        ))`)
      }
    } else if (rol === 'asistente_tanatologo') {
      if (!estado) { conditions.push("estado IN ('ASISTENCIA','PRESERVACION','ENCOFRADO')") }
    } else if (rol === 'supervisora') {
      if (!estado) { conditions.push("estado IN ('ENCOFRADO','ENCUENTRO','SALA')") }
    }

    if (estado) {
      // Soporta un solo estado ('PRESERVACION') o varios separados por coma ('PRESERVACION,ENCOFRADO')
      const estados = String(estado).split(',').map(s => s.trim()).filter(Boolean)
      if (estados.length === 1) {
        conditions.push('estado = ?'); params.push(estados[0])
      } else if (estados.length > 1) {
        conditions.push(`estado IN (${estados.map(() => '?').join(',')})`)
        params.push(...estados)
      }
    }
    if (identificacion){ conditions.push('identificacion LIKE ?'); params.push(`%${identificacion}%`) }
    if (q) {
      const term = `%${q}%`
      conditions.push('(codigo LIKE ? OR nombre_ser_querido LIKE ? OR identificacion LIKE ? OR contrato LIKE ?)')
      params.push(term, term, term, term)
    }
    if (fecha_desde)   { conditions.push('DATE(created_at) >= ?'); params.push(fecha_desde) }
    if (fecha_hasta)   { conditions.push('DATE(created_at) <= ?'); params.push(fecha_hasta) }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

    // `id` de desempate: sin él, dos filas con el mismo valor pueden cambiar de
    // posición entre páginas y "Cargar más" repetiría o se saltaría registros.
    const columna   = COLUMNAS_ORDEN[orden] || COLUMNAS_ORDEN.created_at
    const direccion = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    const orderBy   = `ORDER BY ${columna} ${direccion}, id ${direccion}`

    const [rows] = await db.query(
      `SELECT id, codigo, estado, nombre_ser_querido, identificacion, contrato,
              nombre_contacto, telefono_contacto, lugar_asistencia, causa_fallecimiento,
              conductor, asesor_id, asistente_id, tanatologo_id,
              motivo_desistimiento, desistido_por, desistido_por_nombre, desistido_at,
              created_at, updated_at
       FROM asistencias ${where}
       ${orderBy} LIMIT ? OFFSET ?`,
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

    // Qué falta para poder salir del estado actual. Va aquí para que la vista
    // lo muestre sin reimplementar la regla: la autoridad sigue siendo el
    // backend, que la vuelve a comprobar al avanzar.
    const pendientes = await etapasPendientesPara(asistencia.id, asistencia.estado)
    asistencia.etapas_pendientes = pendientes.map(e => ({ etapa: e, label: ETIQUETA_ETAPA[e] || e }))

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
    const {
      nombre_ser_querido, identificacion, contrato, certificado_defuncion,
      peso_aproximado, edad, fecha_fallecimiento, hora_fallecimiento,
      causa_fallecimiento, categoria_sanitaria,
      nombre_contacto, telefono_contacto,
      lugar_asistencia, condiciones_logisticas, conductor, fecha_contacto,
    } = req.body

    // Reintenta hasta 3 veces si el codigo generado colisiona (race condition
    // entre asesores creando simultaneamente).
    let result, codigo
    for (let intento = 0; intento < 3; intento++) {
      codigo = await generarCodigo()
      try {
        ;[result] = await db.query(
          `INSERT INTO asistencias
           (codigo, nombre_ser_querido, identificacion, contrato, certificado_defuncion,
            peso_aproximado, edad, fecha_fallecimiento, hora_fallecimiento,
            causa_fallecimiento, categoria_sanitaria,
            nombre_contacto, telefono_contacto,
            lugar_asistencia, condiciones_logisticas, conductor, fecha_contacto, asesor_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            codigo, normalizarNombre(nombre_ser_querido), identificacion, contrato, certificado_defuncion,
            peso_aproximado, edad || null, fecha_fallecimiento || null, hora_fallecimiento || null,
            causa_fallecimiento, categoria_sanitaria || null,
            nombre_contacto, telefono_contacto,
            lugar_asistencia, JSON.stringify(condiciones_logisticas || []),
            conductor, fecha_contacto || null, usuario,
          ]
        )
        break
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' && intento < 2) {
          console.warn(`[asistencias.crear] codigo duplicado ${codigo}, reintentando…`)
          continue
        }
        throw err
      }
    }

    await insertarHistorial(result.insertId, null, 'NUEVO', usuario, nombre)

    // Aviso operativo. Fire-and-forget: la asistencia ya está creada y un
    // webhook caído no debe afectar la respuesta al asesor.
    gchat.enviarOperaciones([
      `🆕 *Nueva asistencia* ${codigo}`,
      `Ser querido: ${nombre_ser_querido || 's/n'}`,
      identificacion ? `Identificación: ${identificacion}` : null,
      lugar_asistencia ? `Lugar: ${lugar_asistencia}` : null,
      nombre_contacto ? `Contacto: ${nombre_contacto}${telefono_contacto ? ' · ' + telefono_contacto : ''}` : null,
      conductor ? `Conductor: ${conductor}` : null,
      `Registró: ${nombre || usuario}`,
    ].filter(Boolean).join('\n')).catch(() => {})

    glpi.crearTicket({ id: result.insertId, codigo, nombre_ser_querido, lugar_asistencia, nombre_contacto })
      .then(ticketId => {
        if (ticketId) db.query('UPDATE asistencias SET glpi_ticket_id=? WHERE id=?', [ticketId, result.insertId])
      })
      .catch(err => console.warn('[GLPI] crearTicket:', err.message))

    const [nueva] = await db.query('SELECT * FROM asistencias WHERE id = ?', [result.insertId])
    res.status(201).json(nueva[0])
  } catch (err) { next(err) }
}

// POST /asistencias/:id/actores
// - Llamado por n8n (o admin) con { asistente_id, tanatologo_id } para asignar actores.
// - Llamado por el asesor sin body para avanzar de NUEVO → ASISTENCIA sin pre-asignar
//   (el asistente/tanatólogo que finalmente diligencie F-02/F-04 se auto-asigna).
//   Puede traer `conductor` cuando el F-01 quedó sin él: al despachar ya se sabe
//   quién sale, y es el último momento para registrarlo.
async function asignarActores(req, res, next) {
  try {
    const { id } = req.params
    const { asistente_id, tanatologo_id, conductor } = req.body || {}
    const { usuario, nombre } = req.user

    const [rows] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })
    if (rows[0].estado !== 'NUEVO')
      return res.status(400).json({ mensaje: 'Solo se puede avanzar en estado NUEVO' })

    const updates = {}
    if (asistente_id)  updates.asistente_id  = asistente_id
    if (tanatologo_id) updates.tanatologo_id = tanatologo_id
    const conductorNuevo = String(conductor ?? '').trim()
    if (conductorNuevo) updates.conductor = conductorNuevo
    updates.estado = 'ASISTENCIA'

    await db.query('UPDATE asistencias SET ? WHERE id = ?', [updates, id])
    const motivo = (asistente_id || tanatologo_id)
      ? `Actores asignados: ${asistente_id || '-'} / ${tanatologo_id || '-'}`
      : `Avanzado a ASISTENCIA por ${nombre || usuario}${conductorNuevo ? ` · Conductor: ${conductorNuevo}` : ''}`
    await insertarHistorial(id, 'NUEVO', 'ASISTENCIA', usuario, nombre, motivo)

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

    // El avance manual exige las mismas etapas que el cierre automático. Sin
    // esto se podía saltar un formulario obligatorio —p. ej. pasar de
    // PRESERVACION a ENCOFRADO con la tanatopraxia en borrador— y el caso
    // seguía adelante sin que nada lo advirtiera.
    const pendientes = await etapasPendientesPara(id, asistencia.estado)
    if (pendientes.length) {
      const nombres = pendientes.map(e => ETIQUETA_ETAPA[e] || e).join(', ')
      return res.status(409).json({
        mensaje: `No se puede avanzar a ${nuevoEstado}: falta cerrar ${nombres}.`,
        etapas_pendientes: pendientes,
      })
    }

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

    const [asist] = await db.query(
      'SELECT estado, certificado_defuncion FROM asistencias WHERE id = ?', [id])
    if (!asist.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })

    // El certificado de defunción es obligatorio para cerrar F-02: si no vino
    // en F-01, hay que registrarlo aquí.
    if (etapa === 'F02_INVENTARIO_CUERPO' && completar) {
      if (!certificadoValido(asist[0].certificado_defuncion) &&
          !certificadoValido(datos?.certificado_defuncion))
        return res.status(400).json({
          mensaje: `El certificado de defunción debe ser numérico y tener al menos ${MIN_DIGITOS_CERTIFICADO} dígitos.`
        })
    }

    // Reproceso: si F-05 marca requiere_reproceso=true al cerrar, no completar y no avanzar
    if (etapa === 'F05_ENTREGA' && completar && datos?.requiere_reproceso === true) {
      completar = false
      reprocesoDetectado = true
    }

    // Salida no conforme pendiente: si al cerrar F-05 (sin reproceso) hay una F-07
    // sin completar, bloquear hasta que se resuelva.
    if (etapa === 'F05_ENTREGA' && completar && datos?.requiere_reproceso !== true) {
      const [f07] = await db.query(
        `SELECT completado FROM asistencia_etapas
         WHERE asistencia_id=? AND etapa='F07_SALIDA_NO_CONFORME'`,
        [id]
      )
      if (f07.length && f07[0].completado !== 1) {
        return res.status(400).json({
          mensaje: 'Hay una salida no conforme pendiente. Resuelve F-07 antes de cerrar el encuentro.'
        })
      }
    }

    // Persistir la etapa
    await db.query(
      `INSERT INTO asistencia_etapas (asistencia_id, etapa, datos, usuario_id, completado)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE datos=VALUES(datos), usuario_id=VALUES(usuario_id),
         completado=VALUES(completado), updated_at=NOW()`,
      [id, etapa, JSON.stringify(datos), usuario, completar ? 1 : 0]
    )

    // Auto-asignación de responsable según la etapa (solo roles operativos).
    // F02/F03 → asistente_id (inventario); F04 → tanatologo_id (tanatopraxia).
    // Asesor/coordinador pueden llenar F-03 pero NO deben sobrescribir la asignación.
    const rolesOperativos = ['asistente', 'tanatologo', 'asistente_tanatologo', 'admin']
    if (rolesOperativos.includes(rol)) {
      if (etapa === 'F02_INVENTARIO_CUERPO' || etapa === 'F03_INVENTARIO_RETOQUE') {
        await db.query('UPDATE asistencias SET asistente_id=? WHERE id=?', [usuario, id])
      } else if (etapa === 'F04_TANATOPRAXIA') {
        await db.query('UPDATE asistencias SET tanatologo_id=? WHERE id=?', [usuario, id])
      }
    }

    // Certificado de defunción: cuando F-01 quedó sin él, se puede completar
    // desde F-02. El WHERE solo rellena vacíos — sobrescribir uno ya registrado
    // sigue exigiendo reapertura de F-01 con token.
    if (etapa === 'F02_INVENTARIO_CUERPO' && certificadoValido(datos?.certificado_defuncion)) {
      // Rellena el vacío y también reemplaza un valor inválido tipo "0" o "PTE".
      // Un certificado ya válido no se toca: cambiarlo exige reapertura de F-01.
      await db.query(
        `UPDATE asistencias SET certificado_defuncion = ?
          WHERE id = ?
            AND (certificado_defuncion IS NULL
                 OR certificado_defuncion = ''
                 OR certificado_defuncion NOT REGEXP ?)`,
        [String(datos.certificado_defuncion).trim(), id, `^[0-9]{${MIN_DIGITOS_CERTIFICADO},}$`]
      )
    }

    // Fecha y hora de fallecimiento: el F-01 se llena en la llamada, cuando a
    // veces no se saben. El F-02 las captura junto con el certificado y aquí se
    // rellenan, solo si siguen vacías: corregir una ya registrada exige
    // reapertura del F-01, igual que el certificado.
    if (etapa === 'F02_INVENTARIO_CUERPO') {
      for (const campo of ['fecha_fallecimiento', 'hora_fallecimiento']) {
        const valor = String(datos?.[campo] ?? '').trim()
        if (!valor) continue
        await db.query(
          `UPDATE asistencias SET ${campo} = ? WHERE id = ? AND ${campo} IS NULL`,
          [valor, id]
        )
      }
    }

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

      // Cerrar una etapa rezagada (p. ej. F-03 cuando el caso ya está en
      // PRESERVACION) no debe empujar el estado: esa etapa no pertenece a los
      // requisitos del estado actual y avanzar dejaría fuera otras pendientes.
      const esDelEstadoActual = requeridas.length === 0 || requeridas.includes(etapa)

      if (esDelEstadoActual && puedeAvanzar && transicion && estadosPorRol.includes(estadoActual) && transicion.roles.includes(rol)) {
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
// POST /asistencias/:id/desistir
// body: { motivo }
// Marca la asistencia como DESISTIDO. Bloquea futura edición.
async function desistir(req, res, next) {
  try {
    const { id } = req.params
    const { usuario, nombre } = req.user
    const { motivo } = req.body || {}

    if (!motivo?.trim() || motivo.trim().length < 5)
      return res.status(400).json({ mensaje: 'El motivo debe tener al menos 5 caracteres.' })

    const [rows] = await db.query('SELECT id, estado FROM asistencias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })
    if (rows[0].estado === 'CERRADO')
      return res.status(400).json({ mensaje: 'No se puede marcar como desistida una asistencia CERRADA.' })
    if (rows[0].estado === 'DESISTIDO')
      return res.status(400).json({ mensaje: 'La asistencia ya está marcada como desistida.' })

    const estadoAnterior = rows[0].estado
    await db.query(
      `UPDATE asistencias SET
        estado = 'DESISTIDO',
        motivo_desistimiento = ?,
        desistido_por = ?,
        desistido_por_nombre = ?,
        desistido_at = NOW()
       WHERE id = ?`,
      [motivo.trim(), usuario, nombre || null, id]
    )

    await insertarHistorial(id, estadoAnterior, 'DESISTIDO', usuario, nombre,
      `Familia desistió: ${motivo.trim()}`)

    const [updated] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    res.json({ ok: true, asistencia: updated[0] })
  } catch (err) { next(err) }
}

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

/**
 * Avance de estado disparado por un hecho registrado en otro módulo — hoy,
 * finalizar el homenaje de sala, que da por terminada la velación.
 *
 * No exige el rol de la transición: quien registra el hecho es quien lo vive,
 * y negarlo aquí dejaría el homenaje finalizado con la asistencia atrás sin
 * que nadie lo note. El movimiento queda en el historial con su comentario.
 *
 * Nunca lanza: devuelve { ok, motivo } para que quien llama informe sin
 * perder lo que ya guardó.
 */
async function avanzarPorEvento(asistenciaId, destino, { usuario, nombre, comentario } = {}) {
  try {
    const [[a]] = await db.query('SELECT * FROM asistencias WHERE id = ?', [asistenciaId])
    if (!a) return { ok: false, motivo: 'La asistencia no existe' }
    if (a.estado === destino) return { ok: false, motivo: `ya estaba en ${destino}` }

    const transicion = TRANSICIONES[a.estado]
    if (!transicion || transicion.siguiente !== destino)
      return { ok: false, motivo: `está en ${a.estado} y desde ahí no pasa a ${destino}` }

    const pendientes = await etapasPendientesPara(asistenciaId, a.estado)
    if (pendientes.length)
      return { ok: false, motivo: `falta cerrar ${pendientes.map(e => ETIQUETA_ETAPA[e] || e).join(', ')}` }

    await db.query('UPDATE asistencias SET estado = ? WHERE id = ?', [destino, asistenciaId])
    await insertarHistorial(asistenciaId, a.estado, destino, usuario, nombre, comentario || null)

    glpi.notificarTransicion(a.glpi_ticket_id, destino, { ...a, estado: destino })
      .catch(err => console.warn('[GLPI] notificarTransicion:', err.message))

    return { ok: true, desde: a.estado, hasta: destino }
  } catch (err) {
    console.warn('[asistencias] avanzarPorEvento:', err.message)
    return { ok: false, motivo: err.message }
  }
}

module.exports = { listar, obtener, obtenerHistorial, obtenerEtapa, crear, asignarActores, cambiarEstado, guardarEtapa, aprobar, agregarNota, desistir, avanzarPorEvento }
