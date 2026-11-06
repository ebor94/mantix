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
const { esMascota, ESTADOS_GESTION, normalizarSede } = require('../utils/duelo.catalogos')
const { malUso } = require('../utils/errores')
const { normalizarFechaHora } = require('../utils/fecha_hora')
// Quién manda la petición y sobre qué gestión: las mismas guardas que usa el
// controlador de atenciones (ver duelo.peticion.js). `eco` también vive ahí: es
// cómo se cita en un mensaje lo que llegó.
const { eco, usuarioDelLogin, sinUsuario, leerId, leerIdDeCuerpo, responderError } =
  require('../utils/duelo.peticion')

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
 * Las sedes de otras ciudades se reconocen por el centro de costo, y solo por
 * él. No se adivina por el municipio (es donde falleció, no donde es el
 * homenaje) ni por el convenio ni por la entidad: ver «Lo que NO es señal», más
 * abajo.
 *
 * La sede se compara por CONTENIDO sobre el texto normalizado (el ERP la escribe
 * a mano: «Sede San José», «Sede  Arauca» con dos espacios), y con la misma
 * normalización que usa esMascota en el archivo de catálogos: normalizarSede.
 * Antes cada uno normalizaba y comparaba a su manera, y una sede «MASCOTAS
 * CUCUTA» era local acá y no era mascota allá.
 */
const SEDES_LOCALES = ['GRAN COLOMBIA', 'SAN JOSE', 'SAN JOSÉ', 'CRISTO REY CUCUTA', 'MASCOTAS']

/**
 * Las sedes de otras ciudades que el módulo RECONOCE como tales: el ERP dice el
 * municipio por su propio centro de costo, así que para ellas la rama de «otra
 * ciudad» sale CONFIRMADA.
 *
 * La lista sale de una medición, no de una suposición. Medido el 2026-11-06
 * sobre `salas_ordenes_view` con `tipo_documento = 50`: 3975 órdenes de servicio
 * de los últimos 365 días. Es el universo COMPLETO de centros de costo, no una
 * muestra:
 *
 *   2888  Sede Gran Colombia   locales (SEDES_LOCALES): 3512
 *    422  Mascotas             "
 *    107  Sede San José        "
 *     95  Cristo Rey Cucuta    "
 *    288  Sede Pamplona        foráneas (esta lista): 462
 *    128  Sede Saravena        "
 *     36  Sede  Arauca         "  (dos espacios en el ERP)
 *     10  Sede Tame            "
 *      1  (vacío)              sin sede: no se adivina, RESIDENCIA sin confirmar
 *
 * Una sede NUEVA que el ERP gane mañana no está acá y no es un olvido: cae en
 * OTRA_CIUDAD «sin confirmar» (ver decidirRama) hasta que alguien la agregue a
 * esta lista a conciencia. Ése es el diseño: lo que nadie midió no se afirma.
 * Agregar una es una decisión que se ve en el código, con el nombre tal como lo
 * escribe el ERP y normalizado como normalizarSede lo deja; tres pruebas lo
 * cuidan (que sea exactamente lo medido, que esté normalizado y que ninguna
 * entrada sea una sede local, que es lo que gana siempre).
 *
 * A diferencia de SEDES_LOCALES, la sede se compara COMPLETA y no por contenido:
 * reconocer de más es lo que se está evitando.
 */
const SEDES_FORANEAS_CONOCIDAS = Object.freeze(['SEDE PAMPLONA', 'SEDE SARAVENA', 'SEDE ARAUCA', 'SEDE TAME'])

/*
 * LO QUE NO ES SEÑAL DE «OTRA CIUDAD». No lo repongas por intuición.
 *
 * esOtraCiudad comprobaba antes que `convenio` (el `descripcion_convenio` del
 * ERP) empezara por «OLIVOS <otra ciudad>». Se quitó. Medido el 2026-11-06 sobre
 * las mismas 3975 órdenes de servicio de 365 días:
 *
 *   1. Era código muerto: 0 de 3975 órdenes tienen un `descripcion_convenio` que
 *      empiece por «OLIVOS <otra ciudad>». No coincidió ni una vez en un año.
 *   2. El patrón «OLIVOS <ciudad>» SÍ existe en el ERP, pero en otro campo:
 *      `descripcion_entidad`, con 328 órdenes (Olivos Bogotá 95, Bucaramanga 68,
 *      Cali 37, Barrancabermeja 26, Villavicencio 16 y nueve ciudades más). Por
 *      eso parece la respuesta, y pasar la comprobación de `convenio` a `entidad`
 *      es la tentación.
 *   3. Pero `entidad` es la sucursal que VENDIÓ el plan, NO dónde es el
 *      homenaje (lo resolvió el dueño del sistema). El homenaje de esas 328
 *      órdenes es en Cúcuta. Mirarla mandaría a gestión telefónica a 264
 *      familias que están en Cúcuta.
 *
 * La única señal que funciona es el centro de costo: la sede.
 */

/**
 * La orden va a la rama de otra ciudad: tiene sede y no es ninguna de las
 * locales. Responde a DÓNDE se gestiona, no a cuánto se sabe (eso lo responde
 * otraCiudadReconocida). Sin sede no se adivina.
 */
function esOtraCiudad(orden) {
  const sede = normalizarSede(orden?.sede)
  return sede !== '' && !SEDES_LOCALES.some(s => sede.includes(s))
}

/**
 * Y además lo SABEMOS: la sede es una de las foráneas medidas
 * (SEDES_FORANEAS_CONOCIDAS), comparada completa y normalizada. Es la única
 * señal de otra ciudad que se afirma; el resto de las sedes no locales va a la
 * misma rama pero sin confirmar.
 */
function otraCiudadReconocida(orden) {
  return SEDES_FORANEAS_CONOCIDAS.includes(normalizarSede(orden?.sede))
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
 * Hay cuatro orígenes y dos de ellos son suposiciones:
 *   1. La ubicación del homenaje que H360 ya registró (sala o residencia): dato.
 *   2. Una sede foránea conocida (SEDES_FORANEAS_CONOCIDAS: Pamplona, Saravena,
 *      Arauca, Tame): dato, el ERP dice el municipio por su centro de costo.
 *      Ni el convenio ni la entidad cuentan: ver «Lo que NO es señal».
 *   3. Una sede que no es local y que nadie reconoce: se gestiona como otra
 *      ciudad, pero SIN confirmar. Una sede desconocida no es un dato: es la
 *      ausencia de uno. Si el ERP gana un centro de costo nuevo o renombra uno
 *      local de modo que ya no contenga su nombre («Sede GC»), esas familias
 *      caen en esta rama, y afirmarlo las dejaría con la insignia plena de «otra
 *      ciudad»: nadie las visita ni las llama como locales, que es justo lo que
 *      son. Sin confirmar, la pantalla dice que no se sabe y alguien lo revisa.
 *   4. Nada de lo anterior (sede local o vacía): RESIDENCIA POR DEFECTO, sin
 *      confirmar. Nadie sabe aún dónde será la velación (casi la mitad de las
 *      filas, y justo las más recientes: las órdenes de ayer y hoy, que todavía
 *      no tienen homenaje).
 *
 * Es la única función que decide las dos cosas a la vez, para que `rama` y
 * `confirmada` no puedan desfasarse: salen del mismo `if`.
 */
function decidirRama(orden, asistencia) {
  if (asistencia?.ubicacion_tipo) return { rama: asistencia.ubicacion_tipo, confirmada: true }
  if (otraCiudadReconocida(orden)) return { rama: RAMA.OTRA_CIUDAD, confirmada: true }
  if (esOtraCiudad(orden)) return { rama: RAMA.OTRA_CIUDAD, confirmada: false }
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
 *   1. Primero la que NO está en un estado terminal (CERRADO, DESISTIDO,
 *      RECHAZADO). Una asistencia viva dice dónde está la familia HOY; una
 *      cerrada dice dónde estuvo. Va antes que «tiene homenaje» a propósito: una
 *      activa que aún no registró el homenaje es mejor candidata que una cerrada
 *      que sí lo tiene, porque la pantalla ya sabe decir «sin confirmar» cuando
 *      no hay ubicación (rama_confirmada) y, en cambio, no tiene cómo avisar que
 *      la ubicación que muestra es la de un caso cerrado: mandaría a la
 *      psicóloga al lugar equivocado. (Medido en producción: el contrato 42492
 *      tiene una cerrada en residencia, más reciente, y una activa en sala; sin
 *      este criterio ganaba la cerrada.)
 *   2. Entre esas, la que tiene homenaje registrado (sala o residencia). Sin
 *      homenaje una asistencia no aporta lo único que H360 le agrega a la
 *      bandeja, que es DÓNDE es el homenaje; no debe tapar a una que sí lo sabe.
 *   3. Entre las que empatan, la más reciente (id más alto, que crece con cada
 *      asistencia nueva): la posterior reemplaza a la anterior.
 *   4. Dentro de una misma asistencia, el último homenaje de sala y, luego, el
 *      último de residencia: que ni el desempate quede al motor.
 *
 * Todo esto solo importa cuando un contrato tiene más de una asistencia, que hoy
 * son 2 casos y probablemente sean duplicados de carga. Con una sola asistencia
 * el orden no cambia nada: un estado terminal la baja de preferencia, no la
 * excluye, así que un contrato con una única asistencia cerrada sigue mostrando
 * su ubicación.
 *
 * El cruce se queda con la PRIMERA fila de cada contrato.
 */
async function asistenciasPorContrato(contratos) {
  const lista = contratos.map(c => String(c).trim()).filter(Boolean)
  if (!lista.length) return new Map()
  const [filas] = await db.query(
    `SELECT a.id, a.codigo, a.contrato, a.estado,
            a.nombre_contacto, a.telefono_contacto,
            sv.codigo AS sala_codigo, sd.nombre AS sede_nombre,
            hr.id AS residencia_id
       FROM asistencias a
       LEFT JOIN homenajes_sala hs  ON hs.asistencia_id = a.id
       LEFT JOIN salas_velacion sv  ON sv.id = hs.sala_id
       LEFT JOIN sedes sd           ON sd.id = sv.sede_id
       LEFT JOIN homenajes_residencia hr ON hr.asistencia_id = a.id
      WHERE a.contrato IN (${lista.map(() => '?').join(',')})
      ORDER BY (a.estado IN ('CERRADO', 'DESISTIDO', 'RECHAZADO')),
               (hs.id IS NULL AND hr.id IS NULL), a.id DESC, hs.id DESC, hr.id DESC`,
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
      // El contacto que el asesor llenó en el F-01. Es la mitigación que el §11
      // del diseño declara para el riesgo medido: 91 de 336 órdenes del ERP no
      // traen teléfono y H360 tiene uno guardado en el 54% de los casos; sin
      // estas dos columnas, para esas 91 familias el módulo no ofrecía NINGÚN
      // número en ninguna pantalla y la gestión terminaba NO_LOGRADA teniendo
      // nosotros el número. Van con el nombre de la tabla `asistencias`, sin
      // renombrar: es el mismo dato, no uno nuevo.
      nombre_contacto: f.nombre_contacto,
      telefono_contacto: f.telefono_contacto,
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
 * Lo que de un error del ERP se puede dejar en el log.
 *
 * NO el mensaje: el de mssql, en un error de conversión o de parámetro, cita el
 * valor que se consultó, y en este módulo ese valor es el nombre de un ser
 * querido o el contrato de una familia. No es dato de salud, pero es PII, y el
 * log de pm2 lo guarda en claro, rotado y legible por quien administre el
 * servidor.
 *
 * Lo que queda alcanza para diagnosticar y no lleva nada de la familia: el
 * nombre del error, su código y, cuando viene, el número de error de SQL Server
 * («RequestError (EREQUEST) nº 8114» es una conversión fallida; ESOCKET es red;
 * ELOGIN, credenciales).
 */
function causaDelErp(err) {
  const partes = [err?.name || 'Error']
  if (err?.code) partes.push(`(${err.code})`)
  if (err?.number !== undefined && err?.number !== null) partes.push(`nº ${err.number}`)
  return partes.join(' ')
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
 * Cuánto puede abarcar el rango de la bandeja, contando las dos puntas.
 *
 * Nada lo impedía y pedir un año tiene un costo medido: ~3008 órdenes del ERP y,
 * con ellas, dos consultas a H360 con un IN de 3008 marcadores. Eso no falla con
 * un mensaje: el `timeout: 15000` de axios del frontend lo convierte en «el
 * servidor tardó demasiado», que no dice qué pedir distinto, y la psicóloga
 * repite la misma consulta. Con el tope, lo que no se puede servir se dice en
 * palabras y antes de tocar el ERP.
 *
 * 90 días son tres meses de trabajo hacia atrás: más que cualquier rango que la
 * pantalla ofrece (abre en ayer y hoy) y suficiente para revisar un trimestre.
 */
const MAX_DIAS_RANGO = 90

const MS_POR_DIA = 86400000

/** El instante UTC de una fecha AAAA-MM-DD: aritmética de calendario, sin zonas. */
const instanteUtc = dia => {
  const [anio, mes, d] = dia.split('-').map(Number)
  return Date.UTC(anio, mes - 1, d)
}

/**
 * Días que abarca el rango, contando las dos puntas (un solo día es 1). Se
 * calcula en UTC y no con la zona del proceso: en una zona con horario de verano,
 * un rango que lo cruza tiene un día de 23 o 25 horas y el conteo se correría.
 */
const diasDelRango = (desde, hasta) =>
  (instanteUtc(hasta) - instanteUtc(desde)) / MS_POR_DIA + 1

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

  // Después de «al revés»: un rango invertido se nombra por lo que es, no por lo
  // largo que sería al derecho.
  const dias = diasDelRango(desde.valor, hasta.valor)
  if (dias > MAX_DIAS_RANGO)
    throw malUso(`El rango no puede ser mayor a ${MAX_DIAS_RANGO} días y el que pediste son ${dias}: `
      + `«desde» (${punta(desde)}) y «hasta» (${punta(hasta)}). `
      + 'Pide tramos más cortos: la bandeja consulta el ERP y H360 orden por orden, '
      + 'y un rango largo se queda sin responder en vez de tardar.')

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
      console.warn('[duelo] bandeja, ERP no disponible:', causaDelErp(err))
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
      console.warn('[duelo] búsqueda, ERP no disponible:', causaDelErp(err))
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
      console.warn('[duelo] ficha, ERP no disponible:', causaDelErp(err))
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
    // Quién abre la gestión sale del login y las dos columnas son NOT NULL: si la
    // sesión no trae nombre, es un 403 que lo explica (el mismo de atenciones) y
    // no un 500 de MySQL.
    const usuario = usuarioDelLogin(req)
    if (!usuario) return sinUsuario(res)

    const orden = String(req.body?.orden_servicio ?? '').trim()
    if (!orden) return res.status(400).json({ mensaje: 'Falta el número de orden' })

    // Lo que cabe en cada columna y que el id sea un id, ANTES de preguntarle a
    // la base por nada: un texto más largo que su columna salía como
    // ER_DATA_TOO_LONG y desde la API era un 500, igual que en el PATCH, que ya lo
    // cierra con los mismos topes (TOPES_GESTION, TOPE_ORDEN y acotar están más
    // abajo, junto a leerPsicologa). Hoy el formulario no escribe a mano ninguno
    // de estos campos; la ficha sí los edita por PATCH, y el día que el formulario
    // gane uno el 500 volvía sin que nadie lo notara. `orden_servicio` se mide ya
    // recortada, que es como se guarda; en la ficha la frena el ERP con un 400,
    // pero aquí no pasa por el ERP. Solo los campos que `crear` guarda:
    // `observaciones` y `psicologa_acompanante` no entran por acá.
    acotar('orden_servicio', orden, TOPE_ORDEN)
    const cuerpo = { ...req.body }
    for (const campo of TEXTOS_AL_ABRIR)
      if (cuerpo[campo] !== undefined) cuerpo[campo] = acotar(campo, cuerpo[campo], TOPES_GESTION[campo])
    if (cuerpo.asistencia_id !== undefined)
      cuerpo.asistencia_id = leerIdDeCuerpo(cuerpo.asistencia_id, 'asistencia_id')

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
      asistencia_id:      cuerpo.asistencia_id ?? null,
      ubicacion_tipo:     cuerpo.ubicacion_tipo ?? 'OTRO',
      ubicacion_detalle:  cuerpo.ubicacion_detalle ?? null,
      // Lo decide el servidor con el MISMO esMascota() con que la bandeja pinta
      // la insignia, y no `req.body.es_mascota`. Con el cliente decidiendo, los
      // dos podían desfasarse: la insignia decía «Mascota» y la fila guardaba un
      // 0, y es la fila la que va a alimentar el informe del R-56. Entran el
      // número de orden y la `sede` que manda el cuerpo (la sede es del ERP, no
      // nuestra; viaja en la fila de la bandeja desde donde se abre la gestión).
      // Si no llega, el prefijo MAS- del número sigue reconociéndolas: es la
      // degradación aceptada mientras el frontend no la manda todavía.
      es_mascota:         esMascota({ orden_servicio: orden, sede: cuerpo.sede }),
      titular_nombre:     cuerpo.titular_nombre ?? null,
      titular_parentesco: cuerpo.titular_parentesco ?? null,
      telefonos:          cuerpo.telefonos ?? null,
      estado:             'EN_GESTION',
      psicologa:          usuario,
      created_by:         usuario,
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

/**
 * Lo que cabe en cada columna de texto de h360_duelo_gestion, con la unidad en
 * que MySQL la mide. Los números son los del DDL (h360_duelo_tablas.sql) y una
 * prueba los compara contra ese archivo: si la tabla cambia y esto no, la
 * validación dejaría pasar lo que MySQL corta.
 *
 * Un texto más largo que su columna reventaba en MySQL con ER_DATA_TOO_LONG y
 * desde la API era un 500: la psicóloga perdía lo que acababa de escribir y el
 * mensaje no le decía qué recortar. Ahora es un 400 que nombra el campo y el
 * tope. `psicologa` no está acá: la valida leerPsicologa, que además exige que
 * no quede en blanco (es NOT NULL y es el responsable del caso).
 *
 * `observaciones` es TEXT y su tope son BYTES, no caracteres: una tilde ocupa
 * dos y un emoji cuatro. Las VARCHAR cuentan caracteres.
 *
 * `identificador: true` marca el campo cuyo valor es un identificador (un nombre
 * de usuario, el contrato) y no lo que una familia contó: es el único caso en
 * que el 400 puede citar lo que llegó (ver acotar). Por defecto se asume
 * contenido, que es el lado seguro.
 */
const TOPES_GESTION = Object.freeze({
  ubicacion_detalle:     { tope: 120,   unidad: 'caracteres' },
  titular_nombre:        { tope: 160,   unidad: 'caracteres' },
  titular_parentesco:    { tope: 40,    unidad: 'caracteres' },
  telefonos:             { tope: 120,   unidad: 'caracteres' },
  psicologa_acompanante: { tope: 50,    unidad: 'caracteres', identificador: true },
  observaciones:         { tope: 65535, unidad: 'bytes' },
})

/**
 * El tope de `orden_servicio` (VARCHAR(20), la clave única de la gestión). No
 * está en TOPES_GESTION porque la gestión no la edita —no es un campo del PATCH
 * y el bucle de `actualizar` la rechazaría sin motivo—, solo se escribe al
 * abrirla. Es el contrato del ERP: un identificador, así que se puede citar.
 */
const TOPE_ORDEN = Object.freeze({ tope: 20, unidad: 'caracteres', identificador: true })

/** Los textos que `crear` guarda y que el PATCH también edita: los mismos topes. */
const TEXTOS_AL_ABRIR = ['ubicacion_detalle', 'titular_nombre', 'titular_parentesco', 'telefonos']

/**
 * El valor si cabe en su columna; si no, 400. Es UNA función para los seis
 * campos (reciben campo y tope), no seis validaciones iguales.
 *
 * Nulo o ausente no es un largo inválido: así se limpia un dato de la ficha. Y
 * lo que cabe se devuelve TAL CUAL, sin recortar: recortar perdería en silencio
 * parte de lo que alguien escribió. El tipo tampoco se restringe acá —un número
 * en `telefonos` lo guarda MySQL como texto y eso ya funciona así—; lo que se
 * mide es el largo de lo que se va a escribir.
 *
 * El mensaje dice el campo, el tope, el largo que llegó y cuánto sobra, que es
 * lo que hace falta para recortar. NO cita el valor, salvo en los campos marcados
 * `identificador` (un usuario, el contrato): observaciones, el nombre de quien
 * atendió, los teléfonos y la ubicación son lo que una familia en duelo contó, y
 * un 400 termina en la pantalla, en el log del proxy y en lo que la gente pega
 * al pedir ayuda. Es el mismo criterio con que el módulo mantiene esos textos
 * fuera de sus logs; el precedente de citar un identificador es leerPsicologa.
 */
function acotar(campo, valor, { tope, unidad, identificador = false }) {
  if (valor === null || valor === undefined) return valor
  const texto = String(valor)
  const largo = unidad === 'bytes' ? Buffer.byteLength(texto, 'utf8') : texto.length
  if (largo > tope) {
    const cita = identificador ? ` (${eco(valor)})` : ''
    throw malUso(`«${campo}» no puede pasar de ${tope} ${unidad} y llegó con ${largo}${cita}: `
      + `sobran ${largo - tope}. Es el ancho de la columna en la base; acorta el texto y vuelve a guardar.`)
  }
  return valor
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
    const id = leerId(req.params.id)

    // Copia: lo que venga después en la cadena de middlewares ve el cuerpo completo.
    const cambios = { ...req.body }
    if (cambios.psicologa !== undefined) cambios.psicologa = leerPsicologa(cambios.psicologa)
    // INT UNSIGNED, y null es válido: desvincular la asistencia.
    if (cambios.asistencia_id !== undefined)
      cambios.asistencia_id = leerIdDeCuerpo(cambios.asistencia_id, 'asistencia_id')
    for (const [campo, limite] of Object.entries(TOPES_GESTION))
      if (cambios[campo] !== undefined) cambios[campo] = acotar(campo, cambios[campo], limite)

    // `false` es «el cuerpo no trae ningún campo editable», que es lo que dice el
    // mensaje. Una gestión que no existe NO llega acá: el servicio lanza un 404
    // (los dos casos salían antes como este mismo 400, y la pantalla decía
    // «Revisa lo que pediste» de una petición bien formada).
    const cambiado = await svc.actualizarGestion(id, cambios)
    if (!cambiado) return res.status(400).json({ mensaje: 'No hay cambios que guardar' })
    res.json({ ok: true })
  } catch (err) { responderError(res, next, err) }
}

// POST /api/h360/duelo/gestion/:id/intentos
async function agregarIntento(req, res, next) {
  try {
    // `usuario` es NOT NULL y es toda la auditoría del intento: la misma guarda
    // que en `crear` y en el controlador de atenciones.
    const usuario = usuarioDelLogin(req)
    if (!usuario) return sinUsuario(res)

    const id = await svc.agregarIntento(leerId(req.params.id), {
      momento:     req.body?.momento,
      canal:       req.body?.canal,
      resultado:   req.body?.resultado,
      observacion: req.body?.observacion ?? null,
      usuario,
    })
    res.status(201).json({ id })
  } catch (err) { responderError(res, next, err) }
}

// PUT /api/h360/duelo/gestion/:id/servicios
async function guardarServicios(req, res, next) {
  try {
    const id = leerId(req.params.id)
    if (!Array.isArray(req.body?.servicios))
      return res.status(400).json({ mensaje: 'Se espera una lista en "servicios"' })
    await svc.guardarServicios(id, req.body.servicios)
    // Los servicios traen created_at y updated_at: igual que en la ficha, sin Date.
    const data = (await svc.serviciosDeGestion(id)).map(fechasComoTexto)
    res.json({ data })
  } catch (err) { responderError(res, next, err) }
}

module.exports = { bandeja, buscar, ficha, crear, actualizar, agregarIntento,
  guardarServicios, esOtraCiudad, otraCiudadReconocida, normalizarSede, ramaDe,
  rangoPorDefecto, horaDePared, FILTROS_BANDEJA, SEDES_FORANEAS_CONOCIDAS,
  TOPES_GESTION, TOPE_ORDEN, TOPE_BUSQUEDA, MAX_DIAS_RANGO, verificarFiltros }
