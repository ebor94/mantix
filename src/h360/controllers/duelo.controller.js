/**
 * duelo.controller.js
 * R-56: bandeja del día, búsqueda y gestión del acompañamiento al duelo.
 *
 * La bandeja sale del ERP y no de H360. Se midió: de 336 órdenes en 30 días
 * solo 180 tienen asistencia en 360, así que una bandeja alimentada por 360
 * habría dejado fuera al 46% de las familias. H360 enriquece, no manda.
 *
 * Las atenciones psicológicas NO están acá: duelo_atenciones.controller.js.
 */
const db  = require('../config/db')
const ks  = require('../services/karingsoft.service')
const svc = require('../services/duelo.service')
const { esMascota } = require('../utils/duelo.catalogos')

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  + `-${String(d.getDate()).padStart(2, '0')}`

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Ayer y hoy: es como trabajan hoy sobre el ERP. */
function rangoPorDefecto() {
  const hoy = new Date()
  const ayer = new Date(hoy.getTime() - 86400000)
  return { desde: iso(ayer), hasta: iso(hoy) }
}

/**
 * Las sedes de otras ciudades se reconocen por el centro de costo o porque el
 * convenio es otra sucursal de Olivos. No se adivina por el municipio: el
 * municipio es donde falleció, no donde es el homenaje.
 */
const SEDES_LOCALES = ['GRAN COLOMBIA', 'SAN JOSE', 'SAN JOSÉ', 'CRISTO REY CUCUTA', 'MASCOTAS']

function esOtraCiudad(orden) {
  const sede = String(orden.sede ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
  if (sede && !SEDES_LOCALES.some(s => sede.includes(s))) return true
  const conv = String(orden.convenio ?? '').toUpperCase()
  return /^OLIVOS (?!CUCUTA)/.test(conv.trim())
}

function ramaDe(orden, asistencia) {
  if (asistencia?.ubicacion_tipo) return asistencia.ubicacion_tipo
  if (esOtraCiudad(orden)) return 'OTRA_CIUDAD'
  return 'RESIDENCIA'
}

/** Asistencias de H360 para un grupo de contratos, con su sala y sede. */
async function asistenciasPorContrato(contratos) {
  const lista = contratos.map(c => String(c).trim()).filter(Boolean)
  if (!lista.length) return new Map()
  const [filas] = await db.query(
    `SELECT a.id, a.codigo, a.contrato, a.estado, a.viene_otra_ciudad,
            sv.codigo AS sala_codigo, sd.nombre AS sede_nombre,
            hr.id AS residencia_id
       FROM asistencias a
       LEFT JOIN homenajes_sala hs  ON hs.asistencia_id = a.id
       LEFT JOIN salas_velacion sv  ON sv.id = hs.sala_id
       LEFT JOIN sedes sd           ON sd.id = sv.sede_id
       LEFT JOIN homenajes_residencia hr ON hr.asistencia_id = a.id
      WHERE a.contrato IN (${lista.map(() => '?').join(',')})`,
    lista)

  const m = new Map()
  for (const f of filas) {
    const ubicacion_tipo = f.sala_codigo ? 'SALA' : (f.residencia_id ? 'RESIDENCIA' : null)
    m.set(String(f.contrato).trim(), {
      id: f.id, codigo: f.codigo, estado: f.estado,
      ubicacion_tipo,
      ubicacion_detalle: f.sala_codigo ? `${f.sede_nombre} · ${f.sala_codigo}` : null,
    })
  }
  return m
}

/** Arma las filas de la bandeja a partir de las órdenes del ERP. */
async function armarFilas(ordenes) {
  const contratos = ordenes.map(o => o.orden_servicio)
  const [asistencias, gestiones] = await Promise.all([
    asistenciasPorContrato(contratos),
    svc.gestionesPorOrdenes(contratos),
  ])

  return ordenes.map(o => {
    const asistencia = asistencias.get(String(o.orden_servicio).trim()) || null
    const g = gestiones.get(String(o.orden_servicio).trim()) || null
    return {
      ...o,
      es_mascota: esMascota(o),
      asistencia,
      rama: ramaDe(o, asistencia),
      // Solo lo que la bandeja necesita: nunca el contenido de una atención.
      gestion: g ? { id: g.id, estado: g.estado, tipificacion: g.tipificacion } : null,
    }
  })
}

/**
 * Un 400 que viene del servicio se responde como 400, no como 500.
 *
 * Las consultas al ERP validan la forma de las fechas y el largo del nombre y
 * lanzan con `status = 400`: sin este mapeo, una fecha mal escrita por una
 * psicóloga saldría como error del servidor y en el log quedaría un error de
 * protocolo TDS que no le dice nada a nadie.
 */
function responderError(res, next, err) {
  if (err?.status === 400) return res.status(400).json({ mensaje: err.message })
  return next(err)
}

function sinErp(res) {
  return res.status(503).json({
    mensaje: 'No se pudo consultar Karingsoft (el ERP). La bandeja del día '
           + 'necesita esa conexión; una gestión ya abierta sigue funcionando.',
  })
}

// GET /api/h360/duelo/bandeja?desde=&hasta=&rama=&estado=&incluir_mascotas=
async function bandeja(req, res, next) {
  try {
    if (!ks.configurado()) return sinErp(res)

    const def = rangoPorDefecto()
    const desde = ES_FECHA.test(req.query.desde || '') ? req.query.desde : def.desde
    const hasta = ES_FECHA.test(req.query.hasta || '') ? req.query.hasta : def.hasta

    let ordenes
    try { ordenes = await ks.ordenesDelRango(desde, hasta) }
    catch (err) {
      // Una entrada que el ERP rechaza (400) es de quien escribió, no una caída:
      // sube al responderError de abajo en vez de disfrazarse de 503.
      if (err?.status === 400) throw err
      console.warn('[duelo] bandeja, ERP no disponible:', err.message)
      return sinErp(res)
    }

    let filas = await armarFilas(ordenes)
    if (req.query.rama)   filas = filas.filter(f => f.rama === req.query.rama)
    if (req.query.estado) filas = filas.filter(f => (f.gestion?.estado ?? 'PENDIENTE') === req.query.estado)
    if (req.query.incluir_mascotas === 'false') filas = filas.filter(f => !f.es_mascota)

    res.json({ desde, hasta, total: filas.length, data: filas })
  } catch (err) { responderError(res, next, err) }
}

/** ¿Llegó algo más que espacios? El servicio ignora los criterios en blanco. */
const hayTexto = v => String(v ?? '').trim() !== ''

// GET /api/h360/duelo/buscar?contrato=&nombre=&fecha_fallecimiento=&fecha_hasta=
async function buscar(req, res, next) {
  try {
    if (!ks.configurado()) return sinErp(res)

    const criterios = {
      contrato:   req.query.contrato,
      nombre:     req.query.nombre,
      fechaDesde: req.query.fecha_fallecimiento,
      fechaHasta: req.query.fecha_hasta,
    }
    // Sin esto, «   » pasaría por criterio y el servicio, que no busca con
    // criterios en blanco, devolvería vacío: un «sin resultados» que no es cierto.
    if (!hayTexto(criterios.contrato) && !hayTexto(criterios.nombre) && !hayTexto(criterios.fechaDesde))
      return res.status(400).json({
        mensaje: 'Indica al menos un criterio: contrato, nombre del ser querido o fecha de fallecimiento.',
      })

    let ordenes
    try { ordenes = await ks.buscarOrdenes(criterios) }
    catch (err) {
      // Igual que en la bandeja: una entrada inválida es 400, no una caída.
      if (err?.status === 400) throw err
      console.warn('[duelo] búsqueda, ERP no disponible:', err.message)
      return sinErp(res)
    }

    const filas = await armarFilas(ordenes)
    res.json({ total: filas.length, data: filas })
  } catch (err) { responderError(res, next, err) }
}

module.exports = { bandeja, buscar, esOtraCiudad, ramaDe }
