/**
 * h360/services/laboratorio.service.js
 *
 * Materializa la lista de tareas del día del laboratorio en `h360_lab_tarea`.
 * Es el corazón del módulo: lo que esto escribe es lo que se ve en el tablero
 * y lo que cuenta como cumplimiento o incumplimiento en una auditoría
 * sanitaria. Un error acá no se nota en la pantalla, se nota en el informe.
 *
 * ── Las tres invariantes ───────────────────────────────────────────────────
 *
 * 1. IDEMPOTENTE. `generarDia` se dispara dos veces como mínimo: el cron de
 *    las 00:05 y la primera consulta del tablero del día. Se apoya en
 *    `uk_lab_tarea (laboratorio_id, regla_id, fecha)` con INSERT IGNORE: la
 *    unicidad la garantiza MySQL y no un SELECT previo, así que dos procesos
 *    simultáneos (cron y tablero a la misma hora) tampoco duplican.
 *
 * 2. NO SE ABRE UNA TAREA NUEVA MIENTRAS HAYA UNA ABIERTA de la misma regla,
 *    PERO SOLO SI ESA FRECUENCIA ARRASTRA. Sin el guardia, una quincenal
 *    atrasada dos semanas deja 14 filas y el informe diría que el laboratorio
 *    falló 14 veces cuando falló una. Con el guardia aplicado también a las
 *    DIARIA pasaba lo contrario y peor: la diaria de ayer todavía PENDIENTE
 *    bloqueaba la de hoy, el tablero amanecía con la lista de ayer y el día de
 *    hoy no quedaba escrito ni como incumplimiento. Cada día es un evento de
 *    cumplimiento propio; lo semanal y lo quincenal es una deuda que sigue.
 *
 * 3. SOLO LAS DIARIA CADUCAN. `cerrarDiariasVencidas` filtra por
 *    `r.frecuencia = 'DIARIA'`. Lo semanal y lo de cada N días sigue
 *    PENDIENTE acumulando atraso: la desinfección quincenal que no se hizo se
 *    sigue debiendo. Caducarla borraría el atraso y el informe empezaría a
 *    mentir a favor nuestro, que en una auditoría es el peor de los errores.
 *
 * ── Dos cosas que parecen servir y no sirven ───────────────────────────────
 *
 * · `arrastra()` NO decide nada sobre POR_EVENTO. Devuelve `true` para esa
 *   frecuencia, que es inocuo pero engañoso: una POR_EVENTO no tiene día, así
 *   que no hay tarea suya que pueda arrastrarse. Las POR_EVENTO se descartan
 *   por frecuencia en el WHERE de `SQL_REGLAS_DEL_DIA` y no entran al
 *   generador. Acá `arrastra()` se usa en un solo lugar —contar las tareas
 *   viejas que siguen abiertas— y sobre filas que salen de `h360_lab_tarea`,
 *   donde una POR_EVENTO nunca puede estar.
 *
 * · `reglaAplicaEn()` devuelve `false` para CADA_N_DIAS A PROPÓSITO: eso no lo
 *   decide el calendario sino cuándo se resolvió la anterior. Usarla como
 *   filtro único dejaría las dos quincenales fuera del tablero para siempre.
 *   Su camino propio es `cadaNDiasExigible()`, que mira lo que trae la
 *   consulta.
 *
 * ── Fechas ────────────────────────────────────────────────────────────────
 * El pool NO tiene `dateStrings`: un DATE vuelve como objeto y Express lo
 * serializa en UTC, que en Colombia corre el día hacia atrás. Por eso toda
 * fecha que sale de una consulta va con `DATE_FORMAT(x, '%Y-%m-%d')` y toda
 * aritmética de días se hace en SQL con `DATEDIFF`. Acá no se recorta ningún
 * ISO ni se construye ningún `Date` a partir de una fecha de la base.
 *
 * El «hoy» del negocio sale de `../utils/fecha_hora`, que es el único lugar de
 * h360 donde se dice `America/Bogota`. Antes este archivo tenía su propia copia
 * con un `Intl.DateTimeFormat` paralelo.
 */
const db = require('../config/db')
const { reglaAplicaEn, diaSemanaISO, arrastra } = require('./laboratorio.calendario')
const { hoyBogota } = require('../utils/fecha_hora')

// Quién queda como responsable del cierre automático. No es un usuario de
// LDAP: es la marca que deja distinguir «lo cerró el sistema porque se pasó el
// día» de «alguien lo cerró», igual que el ACTOR del barrido de vehículos.
const ACTOR = 'sistema'

/**
 * La fecha de trabajo, o null.
 *
 * Exige el formato exacto AAAA-MM-DD —no un ISO con hora— porque el texto se
 * manda tal cual a un DATE y a un DATEDIFF; y delega en `diaSemanaISO` la
 * verificación de que el día exista de verdad (el 31 de febrero no pasa).
 */
function fechaDeTrabajo(valor) {
  const txt = String(valor ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txt)) return null
  return diaSemanaISO(txt) === null ? null : txt
}

function enteroPositivo(valor) {
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 ? n : null
}

// ── Las consultas ───────────────────────────────────────────────────────────

/**
 * Las reglas que PUEDEN generar tarea en un laboratorio, con lo que hace falta
 * para decidir las de cada N días.
 *
 * Las POR_EVENTO se descartan acá, en el WHERE, y no más adelante: no tienen
 * día, así que no son candidatas a nada y traerlas solo invita a decidir sobre
 * ellas por error. El índice `idx_lab_regla_gen (laboratorio_id, activo,
 * frecuencia)` está hecho para este WHERE.
 *
 * `dias_desde_ejecucion` y `dias_desde_cierre` son DATEDIFF —no fechas— a
 * propósito: la aritmética de días la hace MySQL y JavaScript solo compara dos
 * enteros. Vienen NULL cuando no hay nada que medir (DATEDIFF de NULL es NULL),
 * y eso es justamente «nunca se resolvió».
 *
 * El segundo ancla, `dias_desde_cierre`, no estaba en el plan y hace falta: una
 * quincenal OMITIDA no deja registro de ejecución, así que midiendo solo por
 * ejecución volvería a ser exigible al día siguiente de omitirla, y al
 * siguiente, y al siguiente.
 */
const SQL_REGLAS_DEL_DIA = `
  SELECT r.id         AS regla_id,
         r.frecuencia AS frecuencia,
         r.dia_semana AS dia_semana,
         r.cada_dias  AS cada_dias,
         DATEDIFF(?, (SELECT MAX(g.fecha_ejecucion)
                        FROM h360_lab_registro g
                       WHERE g.regla_id       = r.id
                         AND g.laboratorio_id = r.laboratorio_id)) AS dias_desde_ejecucion,
         DATEDIFF(?, (SELECT MAX(t.fecha)
                        FROM h360_lab_tarea t
                       WHERE t.regla_id       = r.id
                         AND t.laboratorio_id = r.laboratorio_id
                         AND t.estado <> 'PENDIENTE'))             AS dias_desde_cierre
    FROM h360_lab_regla r
   WHERE r.laboratorio_id = ?
     AND r.activo = 1
     AND r.frecuencia IN ('DIARIA','SEMANAL','CADA_N_DIAS')
   ORDER BY r.id`

/**
 * Las tareas todavía abiertas del laboratorio, con la frecuencia de su regla.
 *
 * La fecha sale con DATE_FORMAT (ver la nota de fechas) porque se compara como
 * texto contra la fecha de trabajo. Usa `idx_lab_tarea_dia`.
 */
const SQL_TAREAS_ABIERTAS = `
  SELECT t.regla_id                       AS regla_id,
         r.frecuencia                     AS frecuencia,
         DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha_abierta
    FROM h360_lab_tarea t
    JOIN h360_lab_regla r ON r.id = t.regla_id
   WHERE t.laboratorio_id = ?
     AND t.estado = 'PENDIENTE'`

/**
 * `estado` no va en la lista de columnas: su DEFAULT es 'PENDIENTE' y dejarlo
 * al esquema evita que un cambio de default se tenga que replicar acá.
 *
 * IGNORE y no ON DUPLICATE KEY UPDATE por dos razones: el único conflicto
 * posible es `uk_lab_tarea` (los regla_id salen de la consulta de arriba, así
 * que la FK no puede fallar), y un UPDATE que no cambia nada igual tocaría
 * `updated_at` de las filas que ya estaban, borrando cuándo se abrió cada una.
 */
const SQL_ALTA_TAREAS = `
  INSERT IGNORE INTO h360_lab_tarea (laboratorio_id, regla_id, fecha) VALUES ?`

/**
 * El cierre de las diarias vencidas.
 *
 * `t.fecha < ?` y no `<=`: la diaria de hoy todavía se puede hacer hoy. Y
 * `r.frecuencia = 'DIARIA'` es la invariante 3: lo demás sigue pendiente.
 */
const SQL_CERRAR_DIARIAS = `
  UPDATE h360_lab_tarea t
    JOIN h360_lab_regla r ON r.id = t.regla_id
     SET t.estado      = 'NO_HECHA',
         t.cerrada_por = ?,
         t.cerrada_at  = NOW()
   WHERE t.estado = 'PENDIENTE'
     AND t.fecha < ?
     AND r.frecuencia = 'DIARIA'`

const SQL_LABORATORIOS_ACTIVOS = `
  SELECT l.id AS laboratorio_id
    FROM h360_lab l
   WHERE l.activo = 1
   ORDER BY l.id`

// ── El camino propio de CADA_N_DIAS ─────────────────────────────────────────

/**
 * ¿Una regla de cada N días se debe en la fecha de trabajo?
 *
 * Se debe cuando pasaron `cada_dias` o más desde la última vez que se
 * RESOLVIÓ, o cuando no se resolvió nunca. «Resuelta» es lo que viene de la
 * consulta: una ejecución registrada o una tarea cerrada (HECHA, OMITIDA o
 * NO_HECHA). Se toma la más reciente de las dos, que en distancias es la
 * menor.
 *
 * Que una tarea OMITIDA cuente como ancla es una decisión, no un descuido:
 * omitir no deja registro de ejecución, así que midiendo solo por ejecución la
 * regla volvería a ser exigible al día siguiente de omitirla y abriría una
 * tarea por día. El costo es que una quincenal hecha dos días antes de lo
 * esperado se vuelve a pedir contando desde la fecha esperada y no desde la
 * ejecución: dos días tarde en un ciclo de quince, contra el riesgo de inflar
 * el informe con incumplimientos que no ocurrieron.
 *
 * Los nulos se filtran ANTES de `Number`, no después: `Number(null)` es 0, y
 * un 0 acá significaría «se resolvió hoy» y la silenciaría para siempre.
 *
 * Sin `cada_dias` no se inventa un período: el CHECK `ck_lab_regla_cada_dias`
 * hace imposible esa fila, y si alguien lo quita, abrir una tarea diaria a una
 * quincenal es peor que no abrirla.
 */
function cadaNDiasExigible(regla) {
  const cada = Number(regla?.cada_dias)
  if (!Number.isInteger(cada) || cada < 1) return false

  const distancias = [regla.dias_desde_ejecucion, regla.dias_desde_cierre]
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(Number)
    .filter(Number.isFinite)

  if (!distancias.length) return true          // nunca se resolvió: se debe
  return Math.min(...distancias) >= cada
}

// ── La generación del día ───────────────────────────────────────────────────

/**
 * Materializa las tareas que le tocan a un laboratorio en una fecha.
 *
 * Idempotente: llamarla dos veces con la misma fecha devuelve `creadas: 0` la
 * segunda vez. Se puede llamar desde una consulta de lectura sin miedo.
 *
 * NO depende de que `cerrarDiariasVencidas` haya corrido antes: el guardia de
 * la invariante 2 solo mira las frecuencias que arrastran, así que una DIARIA
 * de ayer que quedó PENDIENTE no bloquea la de hoy. Eso es lo que hace que el
 * segundo disparador sirva de red: si el cron de las 00:05 no corrió porque el
 * servidor estaba caído, la primera consulta del tablero genera el día igual y
 * el cierre de ayer se hace cuando se pueda.
 *
 * @param {number} laboratorioId
 * @param {string} fecha  AAAA-MM-DD exacto, el día del negocio
 * @returns {Promise<{creadas:number, ya_existian:number, arrastradas:number}>}
 *   · creadas: filas nuevas en h360_lab_tarea.
 *   · ya_existian: candidatas cuya tarea de esa fecha ya estaba (la idempotencia).
 *   · arrastradas: tareas de días ANTERIORES que siguen PENDIENTE y se arrastran
 *     a este día. Cuenta solo las frecuencias que arrastran: una DIARIA vieja
 *     todavía pendiente es una que el cierre no alcanzó a cerrar, no un arrastre.
 */
async function generarDia(laboratorioId, fecha) {
  const lab = enteroPositivo(laboratorioId)
  if (!lab) throw new Error(`generarDia: laboratorio inválido (${laboratorioId})`)

  const dia = fechaDeTrabajo(fecha)
  if (!dia) throw new Error(`generarDia: fecha inválida (${fecha}); se espera AAAA-MM-DD`)

  const [reglas] = await db.query(SQL_REGLAS_DEL_DIA, [dia, dia, lab])

  // Cada frecuencia por su camino. Las POR_EVENTO ya quedaron fuera en el SQL;
  // si alguna llegara igual, `reglaAplicaEn` devuelve false y tampoco entra.
  const candidatas = (reglas || []).filter(r => (
    r.frecuencia === 'CADA_N_DIAS' ? cadaNDiasExigible(r) : reglaAplicaEn(r, dia)
  ))

  const [abiertas] = await db.query(SQL_TAREAS_ABIERTAS, [lab])

  // Invariante 2, y SOLO para lo que arrastra. Una tarea abierta de OTRO día
  // bloquea la nueva; la abierta de la misma fecha no bloquea nada, porque es
  // justo la que íbamos a crear y la clave única la va a descartar sola (eso es
  // `ya_existian`).
  //
  // El guardia se condiciona a `arrastra()` porque una DIARIA abierta de ayer
  // NO es la misma deuda que la de hoy: cada día es un evento de cumplimiento
  // propio, y el día que no se generó no se puede escribir después. Aplicado
  // también a las diarias, el guardia anulaba la red de seguridad del segundo
  // disparador —el tablero genera el día de forma perezosa justamente para
  // cubrir que el cron de las 00:05 no haya corrido— y dejaba la pantalla
  // mostrando la lista de ayer sin que el incumplimiento de hoy quedara
  // escrito nunca. Lo semanal y lo de cada N días conservan el guardia, que es
  // donde hacía falta: es lo que impide que una quincenal atrasada quince días
  // produzca quince incumplimientos en vez de uno.
  const bloqueadas = new Set()
  let arrastradas = 0
  for (const a of (abiertas || [])) {
    if (a.fecha_abierta === dia) continue
    if (!arrastra(a.frecuencia)) continue
    bloqueadas.add(a.regla_id)
    if (a.fecha_abierta < dia) arrastradas++
  }

  const porCrear = candidatas.filter(r => !bloqueadas.has(r.regla_id))
  if (!porCrear.length) return { creadas: 0, ya_existian: 0, arrastradas }

  // Un solo INSERT para las 14 o 16 filas del día: a medianoche esto corre por
  // cada laboratorio y no hace falta una ida y vuelta por actividad.
  const filas = porCrear.map(r => [lab, r.regla_id, dia])
  const [res] = await db.query(SQL_ALTA_TAREAS, [filas])
  const creadas = Number(res?.affectedRows || 0)

  return { creadas, ya_existian: porCrear.length - creadas, arrastradas }
}

/**
 * Cierra como NO_HECHA las tareas DIARIA que quedaron pendientes de días
 * anteriores. Es global: no recibe laboratorio porque el cron barre todos.
 *
 * Solo las diarias (invariante 3). Lo semanal y lo quincenal sigue PENDIENTE a
 * propósito, acumulando atraso, hasta que se registre o se omita con motivo.
 *
 * @param {string} fecha  AAAA-MM-DD; se cierra lo ANTERIOR a esta fecha
 * @returns {Promise<{cerradas:number}>}
 */
async function cerrarDiariasVencidas(fecha) {
  const dia = fechaDeTrabajo(fecha)
  if (!dia) throw new Error(`cerrarDiariasVencidas: fecha inválida (${fecha}); se espera AAAA-MM-DD`)

  const [res] = await db.query(SQL_CERRAR_DIARIAS, [ACTOR, dia])
  return { cerradas: Number(res?.affectedRows || 0) }
}

/**
 * Lo que llama el cron de medianoche: cierra las diarias de ayer y genera el
 * día de hoy en cada laboratorio activo.
 *
 * Se cierra primero y se genera después porque es el orden en que se lee —
 * cerrar ayer, abrir hoy— y porque deja el tablero sin la tarea vieja desde la
 * primera consulta. Ya NO es el orden el que garantiza que el día se genere:
 * eso lo garantiza el guardia, que solo mira lo que arrastra. Si el cierre
 * falla, la generación sigue y el día queda escrito igual.
 *
 * NUNCA lanza: acumula en `errores` y sigue. Cada laboratorio va en su propio
 * try porque son independientes —que una sede quede sin generar no puede dejar
 * a la otra sin tablero— y porque detrás del callback del cron no hay nadie
 * que atrape una excepción: subiría como `unhandledRejection`.
 *
 * @returns {Promise<{fecha:string, cerradas:number,
 *   laboratorios:Array<{laboratorio_id:number, creadas:number, ya_existian:number, arrastradas:number}>,
 *   errores:Array<{paso:string, laboratorio_id?:number, mensaje:string}>}>}
 */
async function ejecutarGeneracionDiaria() {
  const fecha = hoyBogota()
  const salida = { fecha, cerradas: 0, laboratorios: [], errores: [] }

  try {
    salida.cerradas = (await cerrarDiariasVencidas(fecha)).cerradas
  } catch (err) {
    salida.errores.push({ paso: 'cerrarDiariasVencidas', mensaje: err?.message })
    console.error('[laboratorio] cerrarDiariasVencidas falló:', err?.message)
    // Se sigue igual: sin cierre el tablero muestra la tarea vieja, pero sin
    // generación no muestra nada.
  }

  let laboratorios = []
  try {
    const [filas] = await db.query(SQL_LABORATORIOS_ACTIVOS)
    laboratorios = filas || []
  } catch (err) {
    salida.errores.push({ paso: 'laboratoriosActivos', mensaje: err?.message })
    console.error('[laboratorio] no se pudieron listar los laboratorios:', err?.message)
    return salida
  }

  for (const l of laboratorios) {
    const id = l.laboratorio_id
    try {
      const r = await generarDia(id, fecha)
      salida.laboratorios.push({ laboratorio_id: id, ...r })
    } catch (err) {
      salida.errores.push({ paso: 'generarDia', laboratorio_id: id, mensaje: err?.message })
      console.error(`[laboratorio] generarDia(${id}, ${fecha}) falló:`, err?.message)
    }
  }

  const creadas = salida.laboratorios.reduce((n, x) => n + x.creadas, 0)
  console.log(`[laboratorio] ${fecha}: ${salida.cerradas} diarias vencidas cerradas, ` +
              `${creadas} tareas creadas en ${salida.laboratorios.length} laboratorio(s)`)

  return salida
}

module.exports = {
  generarDia,
  cerrarDiariasVencidas,
  ejecutarGeneracionDiaria,
  // Expuestos para las pruebas: la decisión de las quincenales, que es la única
  // rama con aritmética propia, y el reloj con que este servicio decide el día
  // —reexportado de `utils/fecha_hora`, no una copia— para que la prueba del
  // cron afirme sobre el mismo que usa `ejecutarGeneracionDiaria`.
  _internos: { hoyBogota, cadaNDiasExigible, fechaDeTrabajo, ACTOR },
}
