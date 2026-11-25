/**
 * laboratorioInformes.controller.js — Los informes del seguimiento del aseo y
 * la desinfección del laboratorio: cumplimiento del período, resumen por
 * persona e historial plano paginado.
 *
 * Hermano de lectura de `laboratorio.controller.js`: ese registra y cierra, este
 * solo lee y agrupa. No escribe nada y no dispara la generación del día —el
 * tablero ya lo hace, y generar desde un informe materializaría tareas de un
 * período histórico que nacerían PENDIENTE para que el siguiente cierre las
 * marcara NO_HECHA, inventando incumplimientos de días en que el módulo no
 * existía.
 *
 * ── Lo que no se puede romper acá ─────────────────────────────────────────
 *
 * 1. LAS POR_EVENTO SALEN APARTE Y COMO CONTEO, NUNCA COMO PORCENTAJE. Es la
 *    razón de que este archivo exista separado del tablero. No tienen
 *    denominador: no se sabe cuántas preservaciones ni cuántas asistencias hubo,
 *    así que no existe un «se cumplió el 80% de los lavados de tubería». Un
 *    porcentaje inventado en un informe de auditoría sanitaria es peor que no
 *    tener el dato, porque el que lo lee no tiene forma de saber que es inventado.
 *    En `por_evento` el campo `porcentaje` NO EXISTE: no vale null, no vale 0.
 *
 * 2. UN PERÍODO SIN TAREAS DEVUELVE `porcentaje: null`, NUNCA `NaN` NI `100`.
 *    `0/0` en JavaScript es `NaN`, que `JSON.stringify` convierte en `null` —de
 *    casualidad el valor correcto— y cualquier aritmética posterior envenena.
 *    Y «100% de cumplimiento» cuando no hubo nada que cumplir es exactamente la
 *    mentira que este módulo existe para evitar.
 *
 * 3. TODA FECHA QUE SALE EN UNA RESPUESTA VA FORMATEADA EN SQL con
 *    `DATE_FORMAT(x, '%Y-%m-%d')`, incluidas las que salen de un `MIN()` o un
 *    `MAX()`: el pool NO tiene `dateStrings`, así que un DATE crudo sale como
 *    objeto, Express lo serializa en UTC y en Colombia (UTC-5) la pantalla
 *    muestra el día anterior. Por la misma razón ninguna consulta de acá trae
 *    `created_at`, `updated_at` ni `cerrada_at`: son TIMESTAMP, mismo problema,
 *    y no hacen falta en ningún informe.
 *
 * 4. EL BACKEND NO GENERA ARCHIVOS. La exportación a Excel la arma el frontend
 *    con los datos de `historial`, que por eso viene paginado y con el total.
 *
 * ── Por qué no importa `laboratorio.controller` ───────────────────────────
 * Ese archivo requiere `desinfeccionEvidencia.service` al cargarse —y con él
 * sharp y multer— y arma el handler de evidencia en la carga del módulo.
 * Importarlo acá para reusar cuatro constantes y un SELECT arrastraría todo eso
 * a un módulo que solo lee, y obligaría a cada prueba de informes a doblar tres
 * servicios para probar una suma. El SELECT del registro y las listas de enum
 * están duplicados a propósito, y la duplicación está acotada: si cambian las
 * columnas de `h360_lab_registro` hay que tocar los dos.
 */
const db = require('../config/db')
const { hoyBogota, fechaSolo } = require('../utils/fecha_hora')

const texto = (v, max) => String(v ?? '').trim().slice(0, max)

function enteroPositivo(v) {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Un agregado puede volver como texto según el driver; sumar texto concatena. */
const numero = v => Number(v) || 0

// Duplicado de `laboratorio.controller.js` a propósito (ver la cabecera).
const FRECUENCIAS = ['DIARIA', 'SEMANAL', 'CADA_N_DIAS', 'POR_EVENTO']

// El orden en que se lee la pantalla, el mismo del tablero: primero el
// laboratorio, después la trampa de grasa y al final lo operativo.
const BLOQUES_EN_ORDEN = ['LABORATORIO', 'TRAMPA_GRASA', 'OPERATIVA']
const ORDEN_BLOQUE_SQL = `FIELD(%s, 'LABORATORIO', 'TRAMPA_GRASA', 'OPERATIVA')`
const ordenBloque = columna => ORDEN_BLOQUE_SQL.replace('%s', columna)

/** El orden del tablero, para las listas que se arman en JS. */
function compararFilas(a, b) {
  const ia = BLOQUES_EN_ORDEN.indexOf(a.bloque)
  const ib = BLOQUES_EN_ORDEN.indexOf(b.bloque)
  // Un bloque que no está en la lista (un enum nuevo) va al final en vez de
  // quedar primero por el -1 de indexOf.
  const pa = ia === -1 ? BLOQUES_EN_ORDEN.length : ia
  const pb = ib === -1 ? BLOQUES_EN_ORDEN.length : ib
  if (pa !== pb) return pa - pb
  return String(a.actividad).localeCompare(String(b.actividad), 'es')
}

// ═══════════════════════════════════════════════════════════════════════════
// El período
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El rango del informe, con el mes en curso como valor por defecto.
 *
 * `hasta` por defecto es el «hoy» de Bogotá y `desde` el primero de SU mes, que
 * es la unidad en que se pide un informe sanitario. Sin un rango por defecto, un
 * informe sin parámetros agregaría toda la historia de la tabla, que es una
 * consulta que crece sola y un número que nadie pidió.
 *
 * El primero del mes se arma RECORTANDO EL TEXTO (`'2026-11-25'.slice(0,7)`) y
 * no con un `Date`: pasar un AAAA-MM-DD por `new Date()` es medianoche UTC, que
 * en Bogotá es el día anterior, y en un primero de mes eso cambia el mes.
 *
 * @returns {{desde:string, hasta:string}|{error:{mensaje:string, campo:string}}}
 */
function rangoDelInforme(q) {
  let hasta = hoyBogota()
  if (q.hasta !== undefined && q.hasta !== '') {
    hasta = fechaSolo(q.hasta)
    if (!hasta)
      return { error: { mensaje: 'La fecha «hasta» debe venir como AAAA-MM-DD', campo: 'hasta' } }
  }

  let desde = `${hasta.slice(0, 7)}-01`
  if (q.desde !== undefined && q.desde !== '') {
    desde = fechaSolo(q.desde)
    if (!desde)
      return { error: { mensaje: 'La fecha «desde» debe venir como AAAA-MM-DD', campo: 'desde' } }
  }

  // Comparación de texto: con AAAA-MM-DD el orden alfabético ES el cronológico,
  // así que no hace falta construir ningún Date para saberlo.
  if (desde > hasta)
    return { error: {
      mensaje: `El rango está invertido: «desde» (${desde}) es posterior a «hasta» (${hasta}).`,
      campo: 'desde',
    } }

  return { desde, hasta }
}

/**
 * El filtro opcional de laboratorio, como fragmento de WHERE y parámetro.
 *
 * Sin `laboratorio_id` el informe agrega TODOS los laboratorios. Hoy hay uno
 * solo, así que es el mismo número; cuando se agregue una sede, un informe sin
 * filtro suma las dos y eso es lo que pide un consolidado. El `laboratorio` que
 * se está mirando lo dice el tablero, no este endpoint.
 */
function filtroLaboratorio(q, columna) {
  if (q.laboratorio_id === undefined || q.laboratorio_id === '') return { sql: '', params: [] }
  const id = enteroPositivo(q.laboratorio_id)
  if (!id) return { error: { mensaje: 'laboratorio_id inválido', campo: 'laboratorio_id' } }
  return { sql: ` AND ${columna} = ?`, params: [id] }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cumplimiento
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El total del período, sin JOIN.
 *
 * Es el número OFICIAL del informe y por eso sale de `h360_lab_tarea` sola: un
 * JOIN que no empareja no puede encogerlo. El detalle por actividad sí necesita
 * los JOIN para el nombre, y si alguno dejara filas afuera el descuadre contra
 * este total lo delata. (Hoy no puede pasar: `fk_lab_tarea_regla` va ON DELETE
 * CASCADE, así que una tarea huérfana de regla no existe.)
 *
 * NO filtra por `r.frecuencia`. La separación entre lo programado y lo que pasa
 * por evento es ESTRUCTURAL —una regla POR_EVENTO no produce filas acá— y
 * filtrar por la frecuencia ACTUAL de la regla borraría del informe las tareas
 * reales de una actividad que después se pasó a POR_EVENTO: obligaciones que
 * existieron, con resultado escrito, desaparecidas del indicador.
 *
 * Usa `idx_lab_tarea_dia (laboratorio_id, fecha, estado)`.
 */
const SQL_ESTADOS = `
  SELECT t.estado    AS estado,
         COUNT(*)    AS total
    FROM h360_lab_tarea t
   WHERE t.fecha BETWEEN ? AND ?`

const SQL_ESTADOS_CIERRE = `
   GROUP BY t.estado`

/**
 * El mismo conteo abierto por actividad.
 *
 * El nombre sale del CATÁLOGO (`a.nombre`) y no de una copia, porque
 * `h360_lab_tarea` no copia nada: no tiene columna de nombre. Consecuencia a la
 * vista: renombrar una actividad RENOMBRA su histórico en este informe. El
 * nombre inmutable de lo que de verdad se ejecutó vive en
 * `h360_lab_registro.actividad_nombre`, que es lo que devuelve `historial`.
 */
const SQL_ACTIVIDADES = `
  SELECT a.nombre AS actividad,
         a.bloque AS bloque,
         t.estado AS estado,
         COUNT(*) AS total
    FROM h360_lab_tarea t
    JOIN h360_lab_regla r     ON r.id = t.regla_id
    JOIN h360_lab_actividad a ON a.id = r.actividad_id
   WHERE t.fecha BETWEEN ? AND ?`

const SQL_ACTIVIDADES_CIERRE = `
   GROUP BY a.nombre, a.bloque, t.estado
   ORDER BY ${ordenBloque('a.bloque')}, a.nombre`

/**
 * Las POR_EVENTO ejecutadas en el período, CONTADAS, nunca con porcentaje.
 *
 * Sale de `h360_lab_registro` y filtra por la frecuencia COPIADA en el registro,
 * no por la de la regla: es el valor que regía cuando se ejecutó, así que
 * cambiar una frecuencia hoy no reescribe el informe del mes pasado. Por la
 * misma razón agrupa por `actividad_nombre`, que también es copia.
 */
const SQL_POR_EVENTO_HECHAS = `
  SELECT g.actividad_nombre AS actividad,
         g.bloque           AS bloque,
         COUNT(*)           AS veces
    FROM h360_lab_registro g
   WHERE g.frecuencia = 'POR_EVENTO'
     AND g.fecha_ejecucion BETWEEN ? AND ?`

const SQL_POR_EVENTO_HECHAS_CIERRE = `
   GROUP BY g.actividad_nombre, g.bloque
   ORDER BY ${ordenBloque('g.bloque')}, g.actividad_nombre`

/**
 * Las POR_EVENTO configuradas, para que las que no pasaron ninguna vez aparezcan
 * con `veces: 0`.
 *
 * «No pasó nunca» y «no está configurada» son dos cosas distintas, y en una
 * auditoría la diferencia importa: si la lista se armara solo con los registros,
 * una actividad por evento que no se ejecutó en todo el mes sería indistinguible
 * de una que nadie configuró. Esta consulta mira la configuración VIGENTE, así
 * que una regla inactivada o borrada no aparece con 0; sus ejecuciones, si las
 * hubo, siguen contadas por la consulta de arriba y listadas en `historial`.
 */
const SQL_POR_EVENTO_CONFIGURADAS = `
  SELECT a.nombre AS actividad,
         a.bloque AS bloque
    FROM h360_lab_regla r
    JOIN h360_lab_actividad a ON a.id = r.actividad_id
   WHERE r.activo = 1
     AND r.frecuencia = 'POR_EVENTO'`

const SQL_POR_EVENTO_CONFIGURADAS_CIERRE = `
   ORDER BY ${ordenBloque('a.bloque')}, a.nombre`

const resumenVacio = () => ({ total: 0, hechas: 0, omitidas: 0, no_hechas: 0, pendientes: 0 })

/**
 * Suma una fila `(estado, total)` al resumen.
 *
 * Un estado que no esté en los cuatro conocidos suma al `total` y a ninguna
 * categoría: así, si mañana el enum crece, el descuadre entre `total` y la suma
 * de las categorías delata que falta clasificarlo, en vez de que las tareas
 * nuevas desaparezcan del informe en silencio.
 */
function acumular(resumen, estado, cuantas) {
  const n = numero(cuantas)
  resumen.total += n
  if (estado === 'HECHA')          resumen.hechas     += n
  else if (estado === 'OMITIDA')   resumen.omitidas   += n
  else if (estado === 'NO_HECHA')  resumen.no_hechas  += n
  else if (estado === 'PENDIENTE') resumen.pendientes += n
}

/**
 * El porcentaje, o null cuando no hay denominador.
 *
 * `null` y no `0` ni `100`: sin denominador no hubo nada que cumplir y cualquier
 * número es una afirmación que nadie puede respaldar. Tampoco se devuelve `NaN`
 * —el `0/0` de JavaScript—, que `JSON.stringify` convierte en `null` por
 * casualidad y envenena cualquier promedio que lo toque antes.
 *
 * Un decimal: `23/24` es 95.8 y no 96 (que redondea hacia arriba lo que no se
 * cumplió) ni 95.83333333333333.
 */
function porcentaje(parte, denominador) {
  if (!denominador || denominador <= 0) return null
  return Math.round((parte / denominador) * 1000) / 10
}

/**
 * Los dos porcentajes del resumen. LA DECISIÓN DE NEGOCIO DE ESTE ARCHIVO.
 *
 * ── Cómo cuentan las OMITIDA ───────────────────────────────────────────────
 * `porcentaje` las SACA DEL DENOMINADOR: es cumplimiento sobre lo que era
 * exigible. El motivo de omisión es obligatorio y legítimo —el laboratorio no
 * operó, no hubo preservaciones—, así que contarlas como incumplimiento
 * castigaría lo correcto: documentar por qué no se hizo. Y lo que se castiga,
 * se deja de hacer: la gente dejaría de omitir con motivo y las tareas se
 * quedarían pendientes, que es peor dato.
 *
 * `porcentaje_estricto` las cuenta como NO cumplidas, sobre el total. Está acá
 * porque sacarlas del denominador infla el indicador y el que lee el informe
 * tiene derecho a ver las dos lecturas: con 20 de 23 omitidas, `porcentaje`
 * diría 100 y `porcentaje_estricto` diría 13. El conteo `omitidas` viaja al lado
 * de los dos, así que la omisión NUNCA queda escondida y cualquier otra regla se
 * puede recalcular desde la respuesta sin volver a consultar.
 *
 * ESTO ES UNA DECISIÓN DE NEGOCIO Y EL USUARIO PUEDE QUERERLA DISTINTA. Cambiar
 * cuál de los dos es el principal es cambiar este objeto, no las consultas.
 *
 * ── Y las PENDIENTE ────────────────────────────────────────────────────────
 * Cuentan como NO cumplidas en los dos, y eso también es a propósito: solo las
 * DIARIA se cierran solas, así que una semanal atrasada se queda PENDIENTE
 * indefinidamente (acumulando atraso, por diseño). Si se excluyeran del
 * denominador, una actividad que nadie hace nunca desaparecería del indicador
 * justo cuando más tiene que decir. El costo es que el informe del mes en curso
 * se ve bajo porque el día de hoy todavía no terminó: para eso viaja
 * `pendientes`, que es lo que lo explica.
 */
function conPorcentajes(resumen) {
  return {
    ...resumen,
    porcentaje:          porcentaje(resumen.hechas, resumen.total - resumen.omitidas),
    porcentaje_estricto: porcentaje(resumen.hechas, resumen.total),
  }
}

/**
 * GET /laboratorio/informes/cumplimiento ?desde=&hasta=&laboratorio_id=
 *
 * Agrupa `h360_lab_tarea` por estado y por actividad, y devuelve las POR_EVENTO
 * aparte como conteo.
 *
 * ```js
 * {
 *   desde, hasta,
 *   programadas:  { total, hechas, omitidas, no_hechas, pendientes,
 *                   porcentaje, porcentaje_estricto },
 *   por_actividad:[ { actividad, bloque, ...los mismos campos } ],
 *   por_evento:   [ { actividad, bloque, veces } ],   // sin porcentaje, a propósito
 * }
 * ```
 */
async function cumplimiento(req, res, next) {
  try {
    const q = req.query || {}

    const rango = rangoDelInforme(q)
    if (rango.error) return res.status(400).json(rango.error)
    const { desde, hasta } = rango

    const lab = filtroLaboratorio(q, 't.laboratorio_id')
    if (lab.error) return res.status(400).json(lab.error)
    // La misma condición sobre las dos tablas que la nombran distinto.
    const labRegistro = lab.sql ? ' AND g.laboratorio_id = ?' : ''
    const labRegla    = lab.sql ? ' AND r.laboratorio_id = ?' : ''

    const [filasEstado] = await db.query(
      SQL_ESTADOS + lab.sql + SQL_ESTADOS_CIERRE, [desde, hasta, ...lab.params])

    const [filasActividad] = await db.query(
      SQL_ACTIVIDADES + lab.sql + SQL_ACTIVIDADES_CIERRE, [desde, hasta, ...lab.params])

    const [filasEvento] = await db.query(
      SQL_POR_EVENTO_HECHAS + labRegistro + SQL_POR_EVENTO_HECHAS_CIERRE,
      [desde, hasta, ...lab.params])

    const [filasConfiguradas] = await db.query(
      SQL_POR_EVENTO_CONFIGURADAS + labRegla + SQL_POR_EVENTO_CONFIGURADAS_CIERRE, lab.params)

    // ── Lo programado ──
    const programadas = resumenVacio()
    for (const f of filasEstado || []) acumular(programadas, f.estado, f.total)

    // ── Lo programado, por actividad. El orden lo trae el ORDER BY. ──
    const porActividad = []
    const indiceActividad = new Map()
    for (const f of filasActividad || []) {
      let fila = indiceActividad.get(f.actividad)
      if (!fila) {
        fila = { actividad: f.actividad, bloque: f.bloque, ...resumenVacio() }
        indiceActividad.set(f.actividad, fila)
        porActividad.push(fila)
      }
      acumular(fila, f.estado, f.total)
    }

    // ── Las POR_EVENTO: las configuradas arrancan en 0 y las ejecuciones las
    // llenan. Una ejecución de una actividad que ya no está configurada así se
    // agrega igual, en vez de perderse. ──
    const porEvento = []
    const indiceEvento = new Map()
    for (const f of filasConfiguradas || []) {
      const fila = { actividad: f.actividad, bloque: f.bloque, veces: 0 }
      indiceEvento.set(f.actividad, fila)
      porEvento.push(fila)
    }
    for (const f of filasEvento || []) {
      const fila = indiceEvento.get(f.actividad)
      if (fila) { fila.veces = numero(f.veces); continue }
      const nueva = { actividad: f.actividad, bloque: f.bloque, veces: numero(f.veces) }
      indiceEvento.set(f.actividad, nueva)
      porEvento.push(nueva)
    }
    porEvento.sort(compararFilas)

    res.json({
      desde,
      hasta,
      programadas: conPorcentajes(programadas),
      por_actividad: porActividad.map(conPorcentajes),
      // SIN porcentaje, y el campo no existe: no tienen denominador. Ver el
      // punto 1 de la cabecera.
      por_evento: porEvento,
    })
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Por persona
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lo que cerró cada quien, de `h360_lab_registro`.
 *
 * `nombre` sale de un `MAX()` y no del GROUP BY: `registrado_nombre` es una
 * copia por registro, así que si el nombre de LDAP cambió a mitad del período
 * hay dos valores para el mismo usuario. Agrupar por los dos partiría a la
 * persona en dos filas; `MAX` elige uno de forma determinista.
 *
 * `hechas` las cuenta TODAS, POR_EVENTO incluidas: mide trabajo hecho, no
 * cumplimiento. `por_evento` dice cuántas de esas no tenían día, que es lo que
 * impide leer este número como un porcentaje de cumplimiento por persona.
 *
 * Las dos fechas van con DATE_FORMAT: un `MIN()` sobre un DATE devuelve un
 * objeto igual que la columna, con el mismo corrimiento a UTC.
 *
 * Usa `idx_lab_reg_persona (registrado_por, fecha_ejecucion)`.
 */
const SQL_PERSONAS = `
  SELECT g.registrado_por                                     AS usuario,
         MAX(g.registrado_nombre)                             AS nombre,
         COUNT(*)                                             AS hechas,
         SUM(g.frecuencia = 'POR_EVENTO')                     AS por_evento,
         SUM(g.dias_atraso > 0)                               AS atrasadas,
         DATE_FORMAT(MIN(g.fecha_ejecucion), '%Y-%m-%d')      AS primera_fecha,
         DATE_FORMAT(MAX(g.fecha_ejecucion), '%Y-%m-%d')      AS ultima_fecha
    FROM h360_lab_registro g
   WHERE g.fecha_ejecucion BETWEEN ? AND ?`

const SQL_PERSONAS_CIERRE = `
   GROUP BY g.registrado_por
   ORDER BY hechas DESC, g.registrado_por`

/**
 * Lo que omitió cada quien, de `h360_lab_tarea.cerrada_por`.
 *
 * Va aparte porque omitir NO deja registro de ejecución: es un UPDATE sobre la
 * tarea. Sin esta consulta, quien pasó el mes omitiendo aparecería con cero
 * actividad, que es justo el dato que una auditoría quiere ver.
 *
 * `t.estado = 'OMITIDA'` también deja afuera el cierre automático, que escribe
 * `cerrada_por = 'sistema'` con estado NO_HECHA: el sistema no es nadie a quien
 * medir. El `<> ''` cubre el caso de un registro cerrado sin usuario en la
 * petición, que entraría como una persona de nombre vacío.
 *
 * El período se filtra por `t.fecha` —el día en que la tarea se esperaba, un
 * DATE— y NUNCA por `cerrada_at`, que es TIMESTAMP: en UTC, lo omitido entre las
 * 19:00 y la medianoche de Cúcuta caería en el día siguiente y cruzaría el borde
 * del mes.
 */
const SQL_OMITIDAS_POR_PERSONA = `
  SELECT t.cerrada_por AS usuario,
         COUNT(*)      AS omitidas
    FROM h360_lab_tarea t
   WHERE t.estado = 'OMITIDA'
     AND t.fecha BETWEEN ? AND ?
     AND t.cerrada_por IS NOT NULL
     AND t.cerrada_por <> ''`

const SQL_OMITIDAS_POR_PERSONA_CIERRE = `
   GROUP BY t.cerrada_por`

/**
 * GET /laboratorio/informes/por-persona ?desde=&hasta=&laboratorio_id=
 *
 * ```js
 * {
 *   desde, hasta,
 *   personas: [ { usuario, nombre, hechas, por_evento, omitidas, atrasadas,
 *                 primera_fecha, ultima_fecha } ],
 * }
 * ```
 *
 * NO lleva porcentaje por persona, y no es un olvido: el denominador tendría que
 * ser «cuántas tareas le tocaban a esta persona», y las tareas no se asignan a
 * nadie —cualquiera del turno cierra cualquiera—. Un porcentaje por persona
 * sería un número inventado, igual que el de las POR_EVENTO.
 */
async function porPersona(req, res, next) {
  try {
    const q = req.query || {}

    const rango = rangoDelInforme(q)
    if (rango.error) return res.status(400).json(rango.error)
    const { desde, hasta } = rango

    const lab = filtroLaboratorio(q, 'g.laboratorio_id')
    if (lab.error) return res.status(400).json(lab.error)
    const labTarea = lab.sql ? ' AND t.laboratorio_id = ?' : ''

    const [filasPersona] = await db.query(
      SQL_PERSONAS + lab.sql + SQL_PERSONAS_CIERRE, [desde, hasta, ...lab.params])

    const [filasOmitidas] = await db.query(
      SQL_OMITIDAS_POR_PERSONA + labTarea + SQL_OMITIDAS_POR_PERSONA_CIERRE,
      [desde, hasta, ...lab.params])

    const personas = []
    const indice = new Map()
    for (const f of filasPersona || []) {
      const fila = {
        usuario: f.usuario,
        nombre: f.nombre ?? null,
        hechas: numero(f.hechas),
        por_evento: numero(f.por_evento),
        omitidas: 0,
        atrasadas: numero(f.atrasadas),
        // Ya vienen formateadas por DATE_FORMAT; `?? null` es para el grupo sin
        // fechas, que no debería existir pero no cuesta nada.
        primera_fecha: f.primera_fecha ?? null,
        ultima_fecha: f.ultima_fecha ?? null,
      }
      indice.set(fila.usuario, fila)
      personas.push(fila)
    }

    // Quien SOLO omitió también es una persona del informe: si la lista se
    // armara únicamente con los registros, quedaría invisible.
    for (const f of filasOmitidas || []) {
      const fila = indice.get(f.usuario)
      if (fila) { fila.omitidas = numero(f.omitidas); continue }
      const nueva = {
        usuario: f.usuario, nombre: null, hechas: 0, por_evento: 0,
        omitidas: numero(f.omitidas), atrasadas: 0,
        primera_fecha: null, ultima_fecha: null,
      }
      indice.set(f.usuario, nueva)
      personas.push(nueva)
    }

    res.json({ desde, hasta, personas })
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Historial
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El registro como lo ve la pantalla, con las dos fechas formateadas en SQL y
 * ningún TIMESTAMP. `DATE_FORMAT` de NULL es NULL, así que un registro
 * POR_EVENTO devuelve `fecha_esperada: null` y no una fecha inventada.
 *
 * Copia del de `laboratorio.controller.js` (ver la cabecera: importarlo
 * arrastraría sharp y multer). Si cambian las columnas de `h360_lab_registro`,
 * hay que tocar los dos.
 */
const SELECT_REGISTRO = `
  SELECT g.id, g.laboratorio_id, g.regla_id, g.tarea_id,
         g.actividad_nombre, g.bloque, g.frecuencia, g.cada_dias, g.tipo_registro,
         g.dias_atraso, g.observaciones, g.registrado_por, g.registrado_nombre,
         DATE_FORMAT(g.fecha_ejecucion, '%Y-%m-%d') AS fecha_ejecucion,
         DATE_FORMAT(g.fecha_esperada,  '%Y-%m-%d') AS fecha_esperada,
         (SELECT COUNT(*) FROM h360_lab_evidencia e WHERE e.registro_id = g.id) AS evidencias
    FROM h360_lab_registro g`

/**
 * ── EL CONTRATO DE PAGINACIÓN ──────────────────────────────────────────────
 *
 * Entra `?page=1&limit=200` (1-based) y sale `{ data, total, page, limit }`, que
 * es la misma forma que ya usan `asistencias`, `cofres` y los homenajes: el
 * frontend tiene el patrón resuelto y no hay que inventarle otro.
 *
 * `limit` por defecto es 200 y 200 es el TOPE: la Tarea 5 entregó
 * `listarRegistros` con un `LIMIT 200` fijo, así que sin parámetros esto
 * devuelve exactamente lo mismo que ya devolvía. Un `limit` mayor NO se rechaza,
 * se ACOTA a 200 y la respuesta lo dice en su propio campo `limit` — el frontend
 * lee de ahí cuántas filas trajo y de `total` cuántas hay, y recorre páginas
 * hasta juntarlas todas para armar el Excel. Rechazarlo con 400 rompería una
 * exportación por pedir de más, en vez de darle las primeras 200.
 *
 * Un `page` o un `limit` que no son enteros positivos sí son 400: ahí no hay una
 * intención que acotar, hay un parámetro mal armado, y `parseInt('abc')` es
 * `NaN`, que en un `LIMIT` termina en un error de MySQL sin explicación.
 */
const TOPE_PAGINA = 200

/**
 * GET /laboratorio/informes/historial
 *   ?laboratorio_id=&desde=&hasta=&actividad=&registrado_por=&frecuencia=&page=&limit=
 *
 * El histórico plano y paginado, que es lo que el frontend recorre para armar el
 * Excel (el backend no genera archivos).
 *
 * NO tiene rango por defecto, al contrario de los dos informes de arriba: la
 * pantalla se abre mostrando lo más reciente de toda la historia, y el tope de
 * la página es lo que lo hace seguro. Inventarle un «mes en curso» escondería
 * los registros viejos justo cuando alguien busca uno.
 *
 * La búsqueda por actividad va contra `actividad_nombre`, que es la COPIA que
 * guarda el registro: una actividad renombrada se sigue encontrando por como se
 * llamaba cuando se ejecutó, que es lo que dice el papel que se está buscando.
 */
async function historial(req, res, next) {
  try {
    const q = req.query || {}
    const filtros = []
    const params  = []

    if (q.laboratorio_id !== undefined && q.laboratorio_id !== '') {
      const labId = enteroPositivo(q.laboratorio_id)
      if (!labId)
        return res.status(400).json({ mensaje: 'laboratorio_id inválido', campo: 'laboratorio_id' })
      filtros.push('g.laboratorio_id = ?'); params.push(labId)
    }

    const fechas = {}
    for (const [campo, comparador] of [['desde', '>='], ['hasta', '<=']]) {
      if (q[campo] === undefined || q[campo] === '') continue
      const fecha = fechaSolo(q[campo])
      if (!fecha)
        return res.status(400).json({ mensaje: `La fecha «${campo}» no es válida`, campo })
      fechas[campo] = fecha
      filtros.push(`g.fecha_ejecucion ${comparador} ?`); params.push(fecha)
    }
    if (fechas.desde && fechas.hasta && fechas.desde > fechas.hasta)
      return res.status(400).json({
        mensaje: `El rango está invertido: «desde» (${fechas.desde}) es posterior a ` +
                 `«hasta» (${fechas.hasta}).`,
        campo: 'desde',
      })

    if (q.actividad) {
      filtros.push('g.actividad_nombre LIKE ?')
      params.push(`%${texto(q.actividad, 80)}%`)
    }
    if (q.registrado_por) {
      filtros.push('g.registrado_por = ?')
      params.push(texto(q.registrado_por, 50))
    }
    if (q.frecuencia !== undefined && q.frecuencia !== '') {
      const frecuencia = texto(q.frecuencia, 20).toUpperCase()
      if (!FRECUENCIAS.includes(frecuencia))
        return res.status(400).json({
          mensaje: `La frecuencia debe ser una de: ${FRECUENCIAS.join(', ')}`, campo: 'frecuencia',
        })
      filtros.push('g.frecuencia = ?'); params.push(frecuencia)
    }

    // ── La paginación (ver el contrato arriba) ──
    let page = 1
    if (q.page !== undefined && q.page !== '') {
      page = enteroPositivo(q.page)
      if (!page)
        return res.status(400).json({
          mensaje: 'La página debe ser un entero mayor que cero', campo: 'page',
        })
    }
    let limit = TOPE_PAGINA
    if (q.limit !== undefined && q.limit !== '') {
      limit = enteroPositivo(q.limit)
      if (!limit)
        return res.status(400).json({
          mensaje: 'El tamaño de página debe ser un entero mayor que cero', campo: 'limit',
        })
      // Se acota, no se rechaza: la respuesta dice con qué `limit` se sirvió.
      if (limit > TOPE_PAGINA) limit = TOPE_PAGINA
    }
    const offset = (page - 1) * limit

    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''

    const [rows] = await db.query(
      `${SELECT_REGISTRO}
       ${where}
       ORDER BY g.fecha_ejecucion DESC, g.id DESC
       LIMIT ? OFFSET ?`, [...params, limit, offset])

    // El total con EL MISMO WHERE y SIN LIMIT: es lo que le dice al frontend
    // cuántas páginas pedir. Si llevara el LIMIT, la exportación se cortaría en
    // la primera página sin avisar y el Excel saldría incompleto sin que nada
    // falle.
    const [[conteo]] = await db.query(
      `SELECT COUNT(*) AS total FROM h360_lab_registro g ${where}`, params)

    res.json({ data: rows, total: numero(conteo?.total), page, limit })
  } catch (err) { next(err) }
}

module.exports = {
  cumplimiento,
  porPersona,
  historial,
  // Expuestos para las pruebas y para quien tenga que decidir lo mismo: el
  // porcentaje que devuelve null en vez de NaN, la regla de las OMITIDA y el
  // tope de la página.
  _internos: { porcentaje, conPorcentajes, acumular, rangoDelInforme, TOPE_PAGINA },
}
