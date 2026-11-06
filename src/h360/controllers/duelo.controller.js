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
const { esMascota, ESTADOS_GESTION } = require('../utils/duelo.catalogos')
const { malUso } = require('../utils/errores')
const { normalizarFechaHora } = require('../utils/fecha_hora')

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

/**
 * Las tres ramas que la bandeja produce. Es la única lista: ramaDe y el cruce
 * con H360 la usan para calcular y el filtro de rama la usa para validar, así
 * que lo que se puede pedir y lo que se puede obtener no se desfasan.
 */
const RAMA = Object.freeze({ SALA: 'SALA', RESIDENCIA: 'RESIDENCIA', OTRA_CIUDAD: 'OTRA_CIUDAD' })

function ramaDe(orden, asistencia) {
  if (asistencia?.ubicacion_tipo) return asistencia.ubicacion_tipo
  if (esOtraCiudad(orden)) return RAMA.OTRA_CIUDAD
  return RAMA.RESIDENCIA
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
    const ubicacion_tipo = f.sala_codigo ? RAMA.SALA : (f.residencia_id ? RAMA.RESIDENCIA : null)
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

/**
 * ── Validación de la entrada ─────────────────────────────────────────────────
 *
 * Una lista vacía en esta pantalla se lee como «hoy no hay nadie a quien
 * llamar». Un filtro por un valor que no existe, una fecha que no existe o un
 * rango al revés nunca coinciden con nada: si respondieran 200 con la lista
 * vacía, ese día nadie llamaría a ninguna familia. Por eso toda entrada que no
 * pueda dar un resultado correcto se rechaza con 400 y un mensaje que dice qué
 * se esperaba; un error visible es mejor que una lista vacía que miente.
 * Tampoco se reemplaza por un valor por defecto lo que se pidió y no se entiende
 * (una fecha «ayer»): la lista saldría de otro día y nadie lo sabría.
 *
 * La regla vale para todo lo que entra por aquí, no para cada filtro por
 * separado: los filtros de la bandeja se DECLARAN en FILTROS_BANDEJA con sus
 * valores válidos, y esa misma declaración es la que se valida y la que se
 * aplica. Un filtro nuevo no puede aplicarse sin haber declarado qué acepta.
 */

/** Cuánto de lo que llegó se cita en un mensaje: el valor puede ser enorme. */
const eco = v => {
  const t = String(v)
  return JSON.stringify(t.length > 40 ? `${t.slice(0, 40)}…` : t)
}

/**
 * Un parámetro de texto, recortado. Ausente o en blanco es '' (no se pidió
 * nada, y eso no es inválido: un selector en «todas» manda `rama=`). Un
 * parámetro repetido llega como arreglo y uno anidado como objeto: no hay un
 * valor que usar, y adivinar uno daría una lista que nadie pidió.
 */
function leerTexto(query, campo) {
  const v = query[campo]
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string')
    throw malUso(`«${campo}» debe venir una sola vez y como texto; llegaron varios valores.`)
  return v.trim()
}

/**
 * ¿Existe esa fecha? ES_FECHA solo mira la forma y deja pasar «2026-13-45» o un
 * 31 de febrero; el ERP las compara como texto y no encuentra nada. La
 * existencia la decide normalizarFechaHora (arma un Date y compara que las
 * partes vuelvan iguales): se le pasa la fecha a medianoche y se reusa tal cual.
 */
const existe = fecha => normalizarFechaHora(`${fecha} 00:00`) !== null

const msjFechaInexistente = (campo, valor) =>
  `«${campo}» no es una fecha que exista: llegó ${eco(valor)}. `
  + 'Se esperaba una fecha real en formato AAAA-MM-DD, por ejemplo 2026-11-04.'

/**
 * Una fecha de la petición: '' si no vino (ausente o en blanco no se pidió, y eso
 * no es inválido) y, si vino, debe ser una fecha real AAAA-MM-DD o es 400 con el
 * nombre del campo. La usan el rango de la bandeja y los criterios de la
 * búsqueda. El servicio también rechaza la forma, pero con el nombre de su
 * parámetro interno (fechaDesde); acá se nombra el de la API.
 */
function leerFecha(query, campo) {
  const v = leerTexto(query, campo)
  if (v === '') return ''
  if (!ES_FECHA.test(v))
    throw malUso(`«${campo}» debe ser una fecha en formato AAAA-MM-DD (por ejemplo 2026-11-04); llegó ${eco(v)}.`)
  if (!existe(v)) throw malUso(msjFechaInexistente(campo, v))
  return v
}

/** Cada punta con su valor, y «por defecto» si no la escribió nadie. */
const punta = ({ valor, porDefecto }) => (porDefecto ? `${valor}, por defecto` : valor)

/**
 * El rango de la bandeja. Ausente o en blanco es «no se pidió rango»: ayer y hoy
 * (cada punta por separado, y la respuesta dice cuál se usó). Presente es una
 * petición y tiene que entenderse: una fecha con forma inválida («ayer»,
 * «5/11/2026»), una que no existe o un «desde» posterior a «hasta» son 400. Usar
 * el defecto en lugar de lo que no se entiende le daría a la psicóloga la lista
 * de otro día sin avisarle.
 *
 * Las puntas no están en FILTROS_BANDEJA: ese catálogo declara un dominio finito
 * de valores y cómo aplicarlo a una fila, y una fecha no tiene ni lo uno ni lo
 * otro (se le pasa al ERP, no filtra filas). Lo común a toda fecha es leerFecha.
 */
function leerRango(query) {
  const defecto = rangoPorDefecto()
  const leer = campo => {
    const v = leerFecha(query, campo)
    return v === '' ? { valor: defecto[campo], porDefecto: true } : { valor: v, porDefecto: false }
  }
  const desde = leer('desde')
  const hasta = leer('hasta')
  // YYYY-MM-DD ordena como texto igual que como fecha. Un solo día (iguales) es válido.
  if (desde.valor > hasta.valor)
    throw malUso(`El rango está al revés: «desde» (${punta(desde)}) es posterior a «hasta» (${punta(hasta)}). `
      + '«desde» debe ser igual o anterior a «hasta».')
  return { desde: desde.valor, hasta: hasta.valor }
}

const SIN_GESTION = 'PENDIENTE' // el estado implícito de una orden sin gestión

/**
 * Los filtros de la bandeja. Cada uno declara los valores que acepta (`valores`)
 * y cómo se aplica a una fila (`aplica`). Es la única lista: leerFiltros valida
 * contra `valores` y aplica con `aplica`, de modo que un filtro sin dominio
 * declarado no existe. Las pruebas recorren esta tabla, así que un filtro nuevo
 * queda cubierto sin escribirle una prueba aparte.
 */
const FILTROS_BANDEJA = {
  rama: {
    valores: Object.values(RAMA),
    aplica: (f, v) => f.rama === v,
  },
  estado: {
    // PENDIENTE ya viene en el catálogo; se suma de todos modos porque la bandeja
    // lo usa para las órdenes sin gestión y no debe depender de que siga ahí.
    valores: [...new Set([...ESTADOS_GESTION, SIN_GESTION])],
    aplica: (f, v) => (f.gestion?.estado ?? SIN_GESTION) === v,
  },
  incluir_mascotas: {
    valores: ['true', 'false'],
    aplica: (f, v) => v === 'true' || !f.es_mascota,
  },
}

/**
 * Un filtro sin dominio declarado no se puede validar, y uno que no se valida es
 * la puerta de vuelta a la lista vacía muda. Se comprueba al cargar el módulo:
 * si alguien agrega un filtro y olvida declarar sus valores, el servidor no
 * arranca, en vez de aceptar cualquier cosa en silencio.
 */
function verificarFiltros(filtros) {
  for (const [campo, def] of Object.entries(filtros)) {
    if (!Array.isArray(def?.valores) || !def.valores.length)
      throw new Error(`FILTROS_BANDEJA.${campo}: todo filtro declara los valores que acepta (valores)`)
    if (typeof def.aplica !== 'function')
      throw new Error(`FILTROS_BANDEJA.${campo}: todo filtro declara cómo se aplica a una fila (aplica)`)
  }
}
verificarFiltros(FILTROS_BANDEJA)

/** Los filtros pedidos, ya validados. Ausente o en blanco no filtra; un valor que no existe es 400. */
function leerFiltros(query) {
  const pedidos = []
  for (const [campo, def] of Object.entries(FILTROS_BANDEJA)) {
    const valor = leerTexto(query, campo)
    if (valor === '') continue
    if (!def.valores.includes(valor))
      throw malUso(`«${campo}» no es válido: llegó ${eco(valor)} y se esperaba uno de estos valores: `
        + `${def.valores.join(', ')}.`)
    pedidos.push({ def, valor })
  }
  return pedidos
}

// GET /api/h360/duelo/bandeja?desde=&hasta=&rama=&estado=&incluir_mascotas=
// Una entrada que no puede dar un resultado correcto es un 400 que dice qué se
// esperaba (ver leerRango y leerFiltros); un parámetro ausente o en blanco no
// es inválido: sin rango se usa ayer y hoy, sin filtros no se filtra.
async function bandeja(req, res, next) {
  try {
    if (!ks.configurado()) return sinErp(res)

    // Antes de tocar el ERP: una entrada mal escrita no es una caída del ERP.
    const { desde, hasta } = leerRango(req.query)
    const filtros = leerFiltros(req.query)

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
    for (const { def, valor } of filtros) filas = filas.filter(f => def.aplica(f, valor))

    res.json({ desde, hasta, total: filas.length, data: filas })
  } catch (err) { responderError(res, next, err) }
}

/**
 * Tope de filas de la búsqueda: 200. No se decide acá: es el `TOP 200` de
 * `buscarOrdenes` en karingsoft.service.js, que corta la consulta en el ERP sin
 * decir nada. Sin un aviso, una búsqueda amplia parece completa y la psicóloga
 * puede concluir que una familia no está en el sistema.
 *
 * El corte se DEDUCE: si llegaron tantas filas como el tope, se avisa. La
 * deducción tiene un límite que no se puede cerrar desde el controlador: no
 * distingue «exactamente 200 resultados» de «hay más de 200, y se mostraron las
 * primeras 200». Se equivoca solo hacia el lado seguro (un aviso de más, nunca
 * uno de menos). Y depende de que este número siga siendo el del servicio: si
 * alguien cambia el TOP allá, hay que cambiarlo acá; una prueba compara los dos.
 */
const TOPE_BUSQUEDA = 200

// GET /api/h360/duelo/buscar?contrato=&nombre=&fecha_fallecimiento=&fecha_hasta=
// Igual que la bandeja: lo que no puede dar un resultado correcto es 400, no un
// «sin resultados» que haría creer que la familia no está.
async function buscar(req, res, next) {
  try {
    if (!ks.configurado()) return sinErp(res)

    // leerTexto ya recorta: «   » llega como '' y no cuenta como criterio.
    const criterios = {
      contrato:   leerTexto(req.query, 'contrato'),
      nombre:     leerTexto(req.query, 'nombre'),
      fechaDesde: leerFecha(req.query, 'fecha_fallecimiento'),
      fechaHasta: leerFecha(req.query, 'fecha_hasta'),
    }
    if (criterios.fechaDesde && criterios.fechaHasta && criterios.fechaDesde > criterios.fechaHasta)
      throw malUso(`El rango está al revés: «fecha_fallecimiento» (${criterios.fechaDesde}) es posterior a `
        + `«fecha_hasta» (${criterios.fechaHasta}). «fecha_fallecimiento» debe ser igual o anterior a «fecha_hasta».`)

    // Sin esto, «   » pasaría por criterio y el servicio, que no busca con
    // criterios en blanco, devolvería vacío: un «sin resultados» que no es cierto.
    if (!criterios.contrato && !criterios.nombre && !criterios.fechaDesde)
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
    // `truncado` y `tope` permiten decir «mostrando los primeros 200». Se mide
    // sobre lo que devolvió el ERP (armarFilas no descarta ninguna fila).
    res.json({ total: filas.length, truncado: ordenes.length >= TOPE_BUSQUEDA, tope: TOPE_BUSQUEDA, data: filas })
  } catch (err) { responderError(res, next, err) }
}

module.exports = { bandeja, buscar, esOtraCiudad, ramaDe, FILTROS_BANDEJA, TOPE_BUSQUEDA, verificarFiltros }
