/**
 * r34.controller.js — R-34 "Contratación de servicios".
 *
 * Reemplaza la hoja de cálculo donde se llevaban a mano los R-34: la orden que
 * se le manda a un proveedor por un servicio del contrato (coro, carroza,
 * transporte de acompañantes, ramos o transporte de flores).
 *
 * Los servicios salen del ERP, pero un R-34 NO es uno por línea del ERP: es
 * uno por proveedor y servicio. En el contrato 42303 hay tres líneas de ramos
 * del mismo proveedor y operaciones emitió un solo R-34 que dice "3 ARREGLO
 * TRADICIONAL". Por eso las líneas se agrupan antes de ofrecerlas.
 *
 * Lo que se guarda es el documento, no una referencia al ERP: si mañana allá
 * cambian la observación, el R-34 que firmó el proveedor sigue diciendo lo que
 * decía cuando se firmó.
 */
const db         = require('../config/db')
const karingsoft = require('../services/karingsoft.service')
const { generarR34Pdf } = require('../services/r34Pdf')
const { enviarR34 }     = require('../services/r34Envio.service')

const texto = (v, max) => String(v ?? '').trim().slice(0, max)

function malaPeticion(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 })
}

/**
 * Observación sugerida para el R-34 agrupado.
 *
 * Con una sola línea se respeta lo que diga el ERP. Con varias se antepone la
 * cantidad y se usa la descripción del servicio, que es como lo escriben a
 * mano: "3 ARREGLO TRADICIONAL". Las observaciones particulares de cada línea
 * se conservan detrás, porque a veces dicen algo que importa.
 */
function observacionSugerida(lineas) {
  const propias = [...new Set(lineas.map(l => l.observacion).filter(Boolean))]
  const cantidad = lineas.reduce((s, l) => s + Number(l.cantidad || 1), 0)

  if (lineas.length === 1) return propias[0] || `${cantidad} ${lineas[0].servicio || ''}`.trim()

  const base = `${cantidad} ${(lineas[0].servicio || '').toUpperCase()}`.trim()
  return propias.length ? `${base} · ${propias.join(' · ')}` : base
}

/**
 * Agrupa las líneas del ERP: un R-34 es un proveedor y un servicio.
 *
 * La clave incluye el código del servicio, no solo la casilla del formato.
 * "Otro" es un cajón donde caben cosas distintas —el traslado local y el
 * traslado contratado— y si se agrupara solo por casilla, dos servicios
 * distintos del mismo proveedor saldrían en un R-34 que dice "2 TRASLADO
 * LOCAL DEL CUERPO". Con el código, los tres ramos del mismo proveedor
 * siguen juntos, que es lo que se quería, y esos dos quedan separados.
 */
function agrupar(items) {
  const grupos = new Map()
  for (const i of items) {
    // Sin proveedor no se puede agrupar por NIT: cada línea va suelta, para
    // que quien la trabaje decida si contrata afuera o es servicio propio.
    const clave = i.nit_proveedor
      ? `${i.grupo_clave}|${i.codigo}|${i.nit_proveedor}`
      : `${i.grupo_clave}|${i.codigo}|sin-proveedor|${i.item}`

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        clave,
        grupo: i.grupo_clave,
        grupo_etiqueta: i.grupo_etiqueta,
        codigo_servicio: i.codigo,
        servicio_desc: i.servicio,
        proveedor_nit: i.nit_proveedor || null,
        proveedor_nombre: i.proveedor || null,
        proveedor_email: i.proveedor_email || null,
        proveedor_celular: i.proveedor_celular || null,
        lineas: [],
      })
    }
    grupos.get(clave).lineas.push(i)
  }

  return [...grupos.values()].map(g => ({
    ...g,
    items: g.lineas.map(l => l.item),
    cantidad: g.lineas.reduce((s, l) => s + Number(l.cantidad || 1), 0),
    observacion_sugerida: observacionSugerida(g.lineas),
    alertas: [...new Set(g.lineas.flatMap(l => [l.alerta_proveedor, l.alerta_costo].filter(Boolean)))],
    lineas: undefined,
  }))
}

/**
 * GET /r34/contrato/:contrato
 * Lo que hay que contratar en ese contrato, ya agrupado, más lo que el
 * formato necesita de la orden y los R-34 que ya se emitieron.
 */
async function porContrato(req, res, next) {
  try {
    const contrato = texto(req.params.contrato, 20)
    if (!contrato) return res.status(400).json({ mensaje: 'Falta el número de contrato' })

    const erp = await karingsoft.itemsR34(contrato)
    if (!erp)
      return res.status(404).json({ mensaje: `El ERP no tiene una orden de servicio con el contrato ${contrato}.`, contrato })

    const grupos = agrupar(erp.items)

    // Correos que alguien completó antes: el ERP no los tiene todos y no vale
    // la pena volver a preguntarlos.
    const nits = grupos.map(g => g.proveedor_nit).filter(Boolean)
    if (nits.length) {
      const [guardados] = await db.query(
        `SELECT nit, email FROM h360_proveedor_contacto WHERE nit IN (${nits.map(() => '?').join(',')})`, nits)
      const porNit = new Map(guardados.map(g => [String(g.nit), g.email]))
      for (const g of grupos) {
        if (!g.proveedor_email && porNit.get(String(g.proveedor_nit)))
          g.proveedor_email = porNit.get(String(g.proveedor_nit))
      }
    }

    const [emitidos] = await db.query(
      `SELECT id, consecutivo, grupo, proveedor_nit, proveedor_nombre, item,
              fecha_entrega, hora_prestacion, observaciones, enviado_at, enviado_a, created_at,
              autoriza_nombre, autoriza_usuario
         FROM h360_r34 WHERE contrato = ? ORDER BY consecutivo_num DESC`, [contrato])

    // La sala sale de H360 cuando el caso está aquí: el ERP no la guarda en la
    // orden, y a mano escriben justamente eso ("SALA 4", "SAN JOSE").
    const [[sala]] = await db.query(
      `SELECT sv.nombre AS sala, s.nombre AS sede
         FROM asistencias a
         JOIN homenajes_sala hs ON hs.asistencia_id = a.id
         JOIN salas_velacion sv ON sv.id = hs.sala_id
         LEFT JOIN sedes s ON s.id = sv.sede_id
        WHERE a.contrato = ? ORDER BY hs.id DESC LIMIT 1`, [contrato])

    res.json({
      contrato,
      cabecera: {
        ...erp.cabecera,
        direccion_homenaje: sala ? [sala.sala, sala.sede].filter(Boolean).join(' · ') : '',
      },
      grupos,
      emitidos,
    })
  } catch (err) {
    console.warn('[r34] porContrato:', err.message)
    res.status(502).json({ mensaje: `No se pudo consultar el ERP: ${err.message}` })
  }
}

const GRUPOS_VALIDOS = ['CORO', 'CARROZA', 'SALA_HOMENAJE', 'EQ_NOVENARIO', 'EQ_ULTIMA_NOCHE',
  'EQ_VELACION_NOVENARIO', 'EQ_VELACION', 'RAMOS', 'TRANSPORTE_ACOMPANANTES',
  'TRANSPORTE_FLORES', 'OTRO']

/**
 * Toma el siguiente número de la serie.
 *
 * El UPDATE bloquea la fila hasta el commit, así que dos personas generando al
 * mismo tiempo se forman en fila en vez de llevarse el mismo número. Con
 * MAX(..)+1 se lo llevarían los dos.
 */
async function siguienteConsecutivo(conn) {
  await conn.query(`UPDATE h360_consecutivos SET ultimo = ultimo + 1 WHERE clave = 'R34'`)
  const [[c]] = await conn.query(`SELECT ultimo FROM h360_consecutivos WHERE clave = 'R34'`)
  return c.ultimo
}

// POST /r34
async function crear(req, res, next) {
  const conn = await db.getConnection()
  try {
    const { usuario, nombre } = req.user
    const b = req.body

    const contrato = texto(b.contrato, 20)
    const grupo    = texto(b.grupo, 40).toUpperCase()
    if (!contrato) throw malaPeticion('Falta el número de contrato')
    if (!GRUPOS_VALIDOS.includes(grupo)) throw malaPeticion('El servicio no es uno de los del formato')
    if (!texto(b.proveedor_nombre, 200)) throw malaPeticion('Falta el proveedor')
    if (!texto(b.observaciones, 4000)) throw malaPeticion('Falta la observación: es lo que le dice al proveedor qué entregar')

    await conn.beginTransaction()
    const num = await siguienteConsecutivo(conn)

    const fila = {
      consecutivo: `SERV-${num}`,
      consecutivo_num: num,
      contrato,
      item: b.item ?? null,
      codigo_servicio: texto(b.codigo_servicio, 10) || null,
      grupo,
      servicio_desc: texto(b.servicio_desc, 200) || null,
      cantidad: b.cantidad != null ? Number(b.cantidad) : null,
      proveedor_nit: texto(b.proveedor_nit, 30) || null,
      proveedor_nombre: texto(b.proveedor_nombre, 200),
      proveedor_email: texto(b.proveedor_email, 200) || null,
      ser_querido: texto(b.ser_querido, 200) || null,
      contratante: texto(b.contratante, 200) || null,
      direccion_homenaje: texto(b.direccion_homenaje, 200) || null,
      telefono_cliente: texto(b.telefono_cliente, 60) || null,
      fecha_entrega: texto(b.fecha_entrega, 10) || null,
      hora_prestacion: texto(b.hora_prestacion, 20) || null,
      lugar_exequias: texto(b.lugar_exequias, 150) || null,
      cementerio: texto(b.cementerio, 150) || null,
      observaciones: texto(b.observaciones, 4000),
      autoriza_usuario: usuario,
      autoriza_nombre: texto(nombre, 150) || null,
    }

    const [r] = await conn.query('INSERT INTO h360_r34 SET ?', [fila])

    // El correo que escriban queda para la próxima vez: el ERP solo tiene el
    // de la mitad de los proveedores y así el hueco se cierra solo.
    if (fila.proveedor_nit && fila.proveedor_email) {
      await conn.query(
        `INSERT INTO h360_proveedor_contacto (nit, nombre, email, actualizado_por)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), email = VALUES(email),
                                 actualizado_por = VALUES(actualizado_por)`,
        [fila.proveedor_nit, fila.proveedor_nombre, fila.proveedor_email, usuario])
    }

    await conn.commit()
    const [[creado]] = await db.query('SELECT * FROM h360_r34 WHERE id = ?', [r.insertId])
    res.status(201).json(creado)
  } catch (err) {
    await conn.rollback().catch(() => {})
    if (err.status === 400) return res.status(400).json({ mensaje: err.message })
    next(err)
  } finally {
    conn.release()
  }
}

async function traer(id) {
  const [[r]] = await db.query('SELECT * FROM h360_r34 WHERE id = ?', [id])
  return r || null
}

// GET /r34/:id/pdf
async function pdf(req, res, next) {
  try {
    const r34 = await traer(req.params.id)
    if (!r34) return res.status(404).json({ mensaje: 'R-34 no encontrado' })

    const buffer = await generarR34Pdf(r34)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${r34.consecutivo}.pdf"`)
    res.send(buffer)
  } catch (err) { next(err) }
}

// POST /r34/:id/enviar
async function enviar(req, res, next) {
  try {
    const r34 = await traer(req.params.id)
    if (!r34) return res.status(404).json({ mensaje: 'R-34 no encontrado' })

    const correo = texto(req.body?.email, 200) || r34.proveedor_email
    if (!correo) return res.status(400).json({ mensaje: 'No hay correo del proveedor. Escríbelo para poder enviarlo.' })

    const resultado = await enviarR34(r34, correo, req.user)

    await db.query(
      `UPDATE h360_r34 SET enviado_at = NOW(), enviado_a = ?, envio_resultado = ?,
                           proveedor_email = COALESCE(NULLIF(proveedor_email,''), ?)
        WHERE id = ?`,
      [correo, JSON.stringify(resultado), correo, r34.id])

    // Si el correo lo escribieron aquí, también se recuerda.
    if (r34.proveedor_nit && correo) {
      await db.query(
        `INSERT INTO h360_proveedor_contacto (nit, nombre, email, actualizado_por)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE email = VALUES(email), actualizado_por = VALUES(actualizado_por)`,
        [r34.proveedor_nit, r34.proveedor_nombre, correo, req.user.usuario])
    }

    res.json({ ...(await traer(r34.id)), envio: resultado })
  } catch (err) { next(err) }
}

// GET /r34  ?contrato=&proveedor=&desde=&hasta=
async function listar(req, res, next) {
  try {
    const filtros = []
    const params  = []
    const { contrato, proveedor, desde, hasta } = req.query
    if (contrato)  { filtros.push('contrato = ?');            params.push(texto(contrato, 20)) }
    if (proveedor) { filtros.push('proveedor_nombre LIKE ?'); params.push(`%${texto(proveedor, 60)}%`) }
    if (desde)     { filtros.push('DATE(created_at) >= ?');   params.push(texto(desde, 10)) }
    if (hasta)     { filtros.push('DATE(created_at) <= ?');   params.push(texto(hasta, 10)) }

    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `SELECT id, consecutivo, contrato, grupo, servicio_desc, proveedor_nombre, proveedor_email,
              ser_querido, fecha_entrega, hora_prestacion, observaciones,
              autoriza_nombre, autoriza_usuario, enviado_at, enviado_a, created_at
         FROM h360_r34 ${where}
        ORDER BY consecutivo_num DESC LIMIT 200`, params)
    res.json(rows)
  } catch (err) { next(err) }
}

module.exports = { porContrato, crear, pdf, enviar, listar, agrupar, observacionSugerida }
