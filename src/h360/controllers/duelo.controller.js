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

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * La zona del negocio. El día de la bandeja es el de Bogotá (Cúcuta está en la
 * misma zona: UTC-5, sin horario de verano), y se dice aquí, a propósito.
 *
 * NO se hereda de la zona del proceso. El servidor hoy corre en America/Bogota
 * porque la máquina está configurada así, no porque el código lo decida: no hay
 * TZ fijada en ningún lado del repo. Si el backend se muda a un contenedor, lo
 * normal es que corra en UTC, y entonces entre las 19:00 y la medianoche de
 * Cúcuta el reloj del proceso ya marca el día siguiente: la bandeja abriría con
 * un día corrido y sin avisar, y las psicólogas perderían una jornada de casos.
 * Con la hora local ese error no avisa; con la zona explícita no puede ocurrir.
 */
const ZONA_NEGOCIO = 'America/Bogota'

// formatToParts y no el texto ya formateado: así el resultado no depende de cómo
// ordene la fecha un idioma. 'en-US' y no 'es-CO' por la misma razón de ir sobre
// seguro: cualquier ICU trae el inglés.
const PARTES_DEL_DIA = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit',
})

/** El día calendario de Bogotá (AAAA-MM-DD) en que cae un instante. */
function diaEnBogota(instante) {
  const p = Object.fromEntries(PARTES_DEL_DIA.formatToParts(instante).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/**
 * El día anterior a una fecha AAAA-MM-DD, por aritmética de calendario (en UTC,
 * donde no hay horario de verano que mueva el día): no se resta un día en
 * milisegundos a un instante, que dependería de la zona en que se lea.
 */
function diaAnterior(dia) {
  const [anio, mes, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, d - 1)).toISOString().slice(0, 10)
}

/**
 * Ayer y hoy, en Bogotá: es como trabajan hoy sobre el ERP. El parámetro es el
 * instante de «ahora» (solo se pasa en las pruebas).
 */
function rangoPorDefecto(ahora = new Date()) {
  const hoy = diaEnBogota(ahora)
  return { desde: diaAnterior(hoy), hasta: hoy }
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

/**
 * La rama de una orden y si esa rama es un dato o una suposición.
 *
 * Hay tres orígenes y solo el último es una suposición:
 *   1. La ubicación del homenaje que H360 ya registró (sala o residencia): dato.
 *   2. La sede del ERP, cuando dice que es de otra ciudad: dato.
 *   3. Ninguno de los dos: se devuelve RESIDENCIA POR DEFECTO. Nadie sabe aún
 *      dónde será la velación (casi la mitad de las filas, y justo las más
 *      recientes: las órdenes de ayer y hoy, que todavía no tienen homenaje).
 *
 * Es la única función que decide las dos cosas a la vez, para que `rama` y
 * `confirmada` no puedan desfasarse: salen del mismo `if`.
 */
function decidirRama(orden, asistencia) {
  if (asistencia?.ubicacion_tipo) return { rama: asistencia.ubicacion_tipo, confirmada: true }
  if (esOtraCiudad(orden)) return { rama: RAMA.OTRA_CIUDAD, confirmada: true }
  return { rama: RAMA.RESIDENCIA, confirmada: false }
}

/** Solo el texto de la rama. Se conserva porque el módulo la exporta y sus pruebas la llaman. */
const ramaDe = (orden, asistencia) => decidirRama(orden, asistencia).rama

/**
 * La clave con que se cruzan los contratos entre sistemas: recortada y en
 * mayúsculas. El IN de MySQL no distingue mayúsculas pero un Map sí, así que un
 * contrato guardado con otra capitalización llegaba en las filas y no se
 * enriquecía. (Hoy no es alcanzable en producción: ningún contrato difiere solo
 * en mayúsculas. Se cierra porque cuesta una línea y el día que ocurra nadie lo
 * vería.) Todo lo que se escribe o se lee en esos Map pasa por aquí.
 */
const claveContrato = c => String(c ?? '').trim().toUpperCase()

/**
 * Asistencias de H360 para un grupo de contratos, con su sala y sede. El Map sale
 * indexado por claveContrato.
 *
 * Un contrato puede tener MÁS DE UNA asistencia (medido en producción: dos
 * contratos tienen dos), y los LEFT JOIN de los homenajes pueden multiplicar las
 * filas de una misma asistencia. Sin ORDER BY, cuál quedaba dependía de qué fila
 * devolvía el motor, y la bandeja podía decir «sala» cuando el homenaje fue en
 * residencia y mandar a alguien al lugar equivocado. La elección es esta, a la
 * vista, y la consulta la hace llegar primera:
 *
 *   1. Primero la asistencia con homenaje registrado (sala o residencia). Sin
 *      homenaje una asistencia no aporta lo único que H360 le agrega a la
 *      bandeja, que es DÓNDE es el homenaje; no debe tapar a una que sí lo sabe.
 *   2. Entre las que empatan, la más reciente (id más alto, que crece con cada
 *      asistencia nueva): la posterior reemplaza a la anterior.
 *   3. Dentro de una misma asistencia, el último homenaje de sala y, luego, el
 *      último de residencia: que ni el desempate quede al motor.
 *
 * El cruce se queda con la PRIMERA fila de cada contrato.
 */
async function asistenciasPorContrato(contratos) {
  const lista = contratos.map(c => String(c).trim()).filter(Boolean)
  if (!lista.length) return new Map()
  const [filas] = await db.query(
    `SELECT a.id, a.codigo, a.contrato, a.estado,
            sv.codigo AS sala_codigo, sd.nombre AS sede_nombre,
            hr.id AS residencia_id
       FROM asistencias a
       LEFT JOIN homenajes_sala hs  ON hs.asistencia_id = a.id
       LEFT JOIN salas_velacion sv  ON sv.id = hs.sala_id
       LEFT JOIN sedes sd           ON sd.id = sv.sede_id
       LEFT JOIN homenajes_residencia hr ON hr.asistencia_id = a.id
      WHERE a.contrato IN (${lista.map(() => '?').join(',')})
      ORDER BY (hs.id IS NULL AND hr.id IS NULL), a.id DESC, hs.id DESC, hr.id DESC`,
    lista)

  const m = new Map()
  for (const f of filas) {
    const clave = claveContrato(f.contrato)
    if (m.has(clave)) continue // la consulta ya las ordenó: la primera es la preferida
    const ubicacion_tipo = f.sala_codigo ? RAMA.SALA : (f.residencia_id ? RAMA.RESIDENCIA : null)
    m.set(clave, {
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
  const [asistencias, gestionesCrudas] = await Promise.all([
    asistenciasPorContrato(contratos),
    svc.gestionesPorOrdenes(contratos),
  ])
  // El servicio indexa las gestiones por el número tal como está guardado: se
  // vuelven a indexar con la misma clave que las asistencias, por la misma razón.
  const gestiones = new Map([...gestionesCrudas].map(([orden, g]) => [claveContrato(orden), g]))

  return ordenes.map(o => {
    const clave = claveContrato(o.orden_servicio)
    const asistencia = asistencias.get(clave) || null
    const g = gestiones.get(clave) || null
    const { rama, confirmada } = decidirRama(o, asistencia)
    return {
      ...o,
      es_mascota: esMascota(o),
      asistencia,
      rama,
      // Existe porque `rama` sola afirma como hecho lo que a veces es una
      // suposición: sin esta marca la pantalla muestra «Residencia» idéntica
      // para un homenaje registrado y para una orden de la que nadie sabe aún
      // dónde será la velación, y una psicóloga planificaría una visita a
      // domicilio sin base. false = RESIDENCIA por defecto, no confirmada.
      rama_confirmada: confirmada,
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
    // El catálogo tal cual. La bandeja llama SIN_GESTION (PENDIENTE) a toda orden
    // sin gestión y ese valor ya viene en el catálogo: que siga ahí lo fija una
    // prueba (duelo.bandeja.test.js), no una suma aquí que nada verificaba.
    valores: ESTADOS_GESTION,
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
 * uno de menos). Y depende de que este número siga siendo el del servicio: el
 * servicio lo exporta como TOPE_BUSQUEDA y es con ese valor con el que arma el
 * TOP de su consulta. Si alguien lo cambia allá, hay que cambiarlo acá; una
 * prueba compara los dos valores.
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

// ── Ficha de una gestión ─────────────────────────────────────────────────────

/**
 * Las columnas de la gestión que la ficha sirve. Es una LISTA y no «lo que
 * venga»: gestionPorOrden hace un SELECT * y, si la tabla gana mañana una
 * columna con contenido sensible, la ficha la serviría sola y ninguna prueba lo
 * vería (el servicio está simulado en ellas). Así, incluir una columna es una
 * decisión explícita: se agrega aquí, a la vista de quien revisa. La bandeja
 * hace lo mismo con tres campos.
 *
 * Esta lista no es la de columnas editables del servicio: son cosas distintas.
 * Aquí entran también las que el PATCH no toca, como `created_by` (quién abrió la
 * gestión) y las fechas.
 */
const COLUMNAS_FICHA = [
  'id', 'orden_servicio', 'asistencia_id', 'ubicacion_tipo', 'ubicacion_detalle',
  'es_mascota', 'titular_nombre', 'titular_parentesco', 'telefonos', 'tipificacion',
  'estado', 'observaciones', 'psicologa', 'psicologa_acompanante', 'cerrada_at',
  'created_by', 'created_at', 'updated_at',
]

const dosDigitos = n => String(n).padStart(2, '0')

/**
 * Un DATETIME como el texto de su hora de pared: 'AAAA-MM-DD HH:MM', el mismo
 * formato con que intentosDeGestion entrega `momento`.
 *
 * El pool no define dateStrings, así que mysql2 entrega los DATETIME como Date,
 * armados con los dígitos de la base leídos en la zona del proceso (timezone
 * 'local'). Por eso aquí se leen con los getters LOCALES, que devuelven los mismos
 * dígitos en cualquier zona; Express, en cambio, serializa un Date en UTC
 * (toISOString) y una gestión cerrada a las 16:05 en Cúcuta saldría como 21:05Z.
 * Es la quinta vez que esta trampa aparece en el módulo: la regla es que de la
 * ficha ninguna fecha sale como Date.
 *
 * Depende de que el pool de config/db.js no defina `timezone` (por defecto es
 * 'local', que es lo que hace que los getters locales devuelvan los dígitos de la
 * base). Si algún día se define, esta lectura debe cambiar con él.
 */
function horaDePared(d) {
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`
    + ` ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`
}

/** Copia de una fila con cada valor Date convertido a texto de hora de pared. */
const fechasComoTexto = fila => Object.fromEntries(
  Object.entries(fila).map(([campo, v]) => [campo, v instanceof Date ? horaDePared(v) : v]))

/** La gestión tal como la sirve la ficha: solo COLUMNAS_FICHA y con las fechas como texto. */
const gestionDeFicha = g => (g
  ? fechasComoTexto(Object.fromEntries(COLUMNAS_FICHA.map(campo => [campo, g[campo]])))
  : null)

// GET /api/h360/duelo/gestion/:orden
async function ficha(req, res, next) {
  try {
    const orden = String(req.params.orden ?? '').trim()
    if (!orden) return res.status(400).json({ mensaje: 'Falta el número de orden' })

    const gestion = await svc.gestionPorOrden(orden)

    // El contrato se lee en vivo; si el ERP está caído la gestión sigue
    // sirviendo y se avisa, igual que hace el bloque del ERP en el detalle
    // de asistencia.
    //
    // Se usa buscarOrdenes y no ordenServicio porque la consulta de
    // ordenServicio no trae nombre, fecha de fallecimiento, teléfono ni
    // dirección, que es lo que la psicóloga necesita ver.
    let contrato = null, erp_error = null
    try {
      const filas = await ks.buscarOrdenes({ contrato: orden })
      contrato = filas[0] || null
    } catch (err) {
      // Una orden que el ERP rechaza por inválida (400: por ejemplo, más larga
      // que el campo) es de quien la escribió, no una caída: igual que en la
      // bandeja y en la búsqueda, sube al responderError de más abajo. Decir
      // «no se pudo leer el contrato» mandaría a esperar a un ERP que está bien.
      if (err?.status === 400) throw err
      console.warn('[duelo] ficha, ERP no disponible:', err.message)
      erp_error = 'No se pudo leer el contrato en Karingsoft (el ERP).'
    }

    // La asistencia de H360 va en la ficha para poder precargar la ubicación
    // al abrir la gestión: es el dato que el ERP no tiene.
    const asistencia = (await asistenciasPorContrato([orden])).get(claveContrato(orden)) || null

    const [intentos, servicios] = gestion
      ? await Promise.all([svc.intentosDeGestion(gestion.id), svc.serviciosDeGestion(gestion.id)])
      : [[], []]

    // La gestión se proyecta (COLUMNAS_FICHA) y toda fecha sale como texto de hora
    // de pared; los servicios traen created_at y updated_at (SELECT *) y los
    // intentos podrían traer los suyos si el servicio los agrega.
    res.json({ orden_servicio: orden, contrato, erp_error, asistencia,
      gestion: gestionDeFicha(gestion),
      intentos: intentos.map(fechasComoTexto),
      servicios: servicios.map(fechasComoTexto) })
  } catch (err) { responderError(res, next, err) }
}

// POST /api/h360/duelo/gestion
async function crear(req, res, next) {
  try {
    const orden = String(req.body?.orden_servicio ?? '').trim()
    if (!orden) return res.status(400).json({ mensaje: 'Falta el número de orden' })

    const ya = await svc.gestionPorOrden(orden)
    if (ya) return res.status(409).json({
      mensaje: 'Esta orden ya tiene una gestión abierta.', gestion_id: ya.id,
    })

    // La psicóloga sale del login y no del cuerpo: en el Excel se escribía a
    // mano 1850 veces y no hay forma de auditar quién atendió de verdad. `created_by`
    // (quién ABRIÓ la gestión) sale del mismo login y no se vuelve a escribir: ver
    // `actualizar`.
    const datos = {
      orden_servicio:     orden,
      asistencia_id:      req.body.asistencia_id ?? null,
      ubicacion_tipo:     req.body.ubicacion_tipo ?? 'OTRO',
      ubicacion_detalle:  req.body.ubicacion_detalle ?? null,
      es_mascota:         !!req.body.es_mascota,
      titular_nombre:     req.body.titular_nombre ?? null,
      titular_parentesco: req.body.titular_parentesco ?? null,
      telefonos:          req.body.telefonos ?? null,
      estado:             'EN_GESTION',
      psicologa:          req.user.usuario,
      created_by:         req.user.usuario,
    }
    let id
    try {
      id = await svc.crearGestion(datos)
    } catch (err) {
      // Son dos psicólogas trabajando la misma lista del día, así que las dos
      // pueden abrir la misma orden en el mismo segundo: el chequeo de arriba
      // pasa en las dos y el índice único (uk_orden) rechaza a la segunda. Sin
      // esto, a una de ellas le saldría un 500 por ER_DUP_ENTRY en vez del 409
      // que le dice que su compañera ya la abrió. Solo el duplicado se traduce:
      // cualquier otro fallo de MySQL sigue su camino.
      if (err?.code === 'ER_DUP_ENTRY') {
        const existente = await svc.gestionPorOrden(orden)
        return res.status(409).json({
          mensaje: 'Esta orden ya tiene una gestión abierta.',
          gestion_id: existente?.id ?? null,
        })
      }
      throw err
    }
    res.status(201).json({ id, orden_servicio: orden })
  } catch (err) { responderError(res, next, err) }
}

/** `psicologa` es VARCHAR(50) NOT NULL en h360_duelo_gestion. */
const MAX_PSICOLOGA = 50

/**
 * La psicóloga a la que se reasigna una gestión, recortada. Ahora que el campo se
 * puede escribir, un texto en blanco cumpliría el NOT NULL de la tabla y dejaría
 * el caso sin responsable, y uno más largo que la columna o que no es texto
 * reventaría en MySQL con un 500: se rechazan con 400 y un mensaje que dice qué
 * se esperaba. No se comprueba que sea un usuario existente.
 */
function leerPsicologa(valor) {
  const v = typeof valor === 'string' ? valor.trim() : ''
  if (!v || v.length > MAX_PSICOLOGA)
    throw malUso(`La psicóloga asignada debe ser un usuario (texto de 1 a ${MAX_PSICOLOGA} caracteres); `
      + `llegó ${eco(valor)}.`)
  return v
}

// PATCH /api/h360/duelo/gestion/:id
//
// Reasignar la gestión SÍ se puede (decisión del dueño del sistema): una psicóloga
// sale de turno, se incapacita o entra a vacaciones y la otra continúa el caso. La
// auditoría no se pierde por eso, porque la fila guarda dos cosas distintas y se
// tratan distinto:
//   - `created_by`: quién ABRIÓ la gestión. Se toma del login en `crear` y no está
//     entre los campos editables del servicio: ningún PATCH lo cambia. Es la huella.
//   - `psicologa`: quién la TIENE ahora. Es lo que se reasigna.
// Así la fila dice las dos cosas, sin ninguna columna nueva. (`psicologa_acompanante`
// es otra cosa: la segunda psicóloga cuando atienden las dos.)
async function actualizar(req, res, next) {
  try {
    // Copia: lo que venga después en la cadena de middlewares ve el cuerpo completo.
    const cambios = { ...req.body }
    if (cambios.psicologa !== undefined) cambios.psicologa = leerPsicologa(cambios.psicologa)

    const cambiado = await svc.actualizarGestion(req.params.id, cambios)
    if (!cambiado) return res.status(400).json({ mensaje: 'No hay cambios que guardar' })
    res.json({ ok: true })
  } catch (err) { responderError(res, next, err) }
}

// POST /api/h360/duelo/gestion/:id/intentos
async function agregarIntento(req, res, next) {
  try {
    const id = await svc.agregarIntento(req.params.id, {
      momento:     req.body?.momento,
      canal:       req.body?.canal,
      resultado:   req.body?.resultado,
      observacion: req.body?.observacion ?? null,
      usuario:     req.user.usuario,
    })
    res.status(201).json({ id })
  } catch (err) { responderError(res, next, err) }
}

// PUT /api/h360/duelo/gestion/:id/servicios
async function guardarServicios(req, res, next) {
  try {
    if (!Array.isArray(req.body?.servicios))
      return res.status(400).json({ mensaje: 'Se espera una lista en "servicios"' })
    await svc.guardarServicios(req.params.id, req.body.servicios)
    // Los servicios traen created_at y updated_at: igual que en la ficha, sin Date.
    const data = (await svc.serviciosDeGestion(req.params.id)).map(fechasComoTexto)
    res.json({ data })
  } catch (err) { responderError(res, next, err) }
}

module.exports = { bandeja, buscar, ficha, crear, actualizar, agregarIntento,
  guardarServicios, esOtraCiudad, ramaDe, rangoPorDefecto, horaDePared, FILTROS_BANDEJA,
  TOPE_BUSQUEDA, verificarFiltros }
