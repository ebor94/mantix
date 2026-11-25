/**
 * h360/services/laboratorio.calendario.js
 *
 * Qué actividad del laboratorio toca y qué día. Acá vive la única lógica
 * difícil del módulo, aislada a propósito en funciones PURAS: sin base de
 * datos, sin reloj, sin estado. Así se puede probar sin montar MySQL, y el
 * generador del día (laboratorio.service.js) se queda solo con las consultas.
 *
 * ── Por qué este archivo no importa nada ──────────────────────────────────
 * El plan sugería consumir `fechaSolo` de `../controllers/desinfecciones.
 * controller`, que ya la exporta. No se hace, por dos razones:
 *
 *  1. Dirección de las dependencias. En este repo ningún servicio requiere un
 *     controlador: el flujo es siempre controlador → servicio. Invertirlo acá
 *     crea un ciclo en potencia en cuanto el controlador del laboratorio pida
 *     este módulo, que es justo lo que va a pasar en la Tarea 4.
 *  2. Y lo concreto: `desinfecciones.controller.js` requiere `../config/db` y
 *     `../services/desinfeccionEvidencia.service` al cargarse, y `db.js` llama
 *     a `mysql.createPool(...)` en el require. Importar el controlador acá
 *     abriría un pool de MySQL (y cargaría sharp y multer) con solo pedir una
 *     función que calcula días de la semana. La promesa de «sin base de datos»
 *     dejaría de ser cierta y las pruebas de este archivo, que no mockean nada,
 *     levantarían conexiones de verdad.
 *
 * Así que la validación de la fecha se duplica. Son cuatro líneas y no tienen
 * dueño natural todavía; si aparece una tercera copia, el lugar es
 * `src/h360/utils/`, no un controlador.
 */

/**
 * «2026-11-09» o cualquier ISO que empiece por una fecha → «2026-11-09».
 * Null si no es una fecha de verdad: el 31 de febrero se descarta comparando
 * contra un Date armado con los mismos números.
 *
 * Copia deliberada de `fechaSolo` de desinfecciones.controller.js — ver la
 * nota de arriba. Se trabaja con el TEXTO y no con `new Date(...)`: un
 * «2026-11-09» pasado por Date es medianoche UTC, que en Bogotá es el 8.
 */
function fechaSolo(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? '').trim())
  if (!m) return null
  const [, anio, mes, dia] = m
  const prueba = new Date(Date.UTC(+anio, +mes - 1, +dia))
  if (prueba.getUTCFullYear() !== +anio || prueba.getUTCMonth() !== +mes - 1 ||
      prueba.getUTCDate() !== +dia) return null
  return `${anio}-${mes}-${dia}`
}

/**
 * Día de la semana ISO de una fecha en texto: 1 = lunes … 7 = domingo.
 * Null si el argumento no es una fecha.
 *
 * Se arma con `Date.UTC(a, m-1, d)` y se lee con `getUTCDay()`, nunca con
 * `new Date('2026-11-28')`: ese constructor interpreta el ISO corto como
 * medianoche UTC y `getDay()` lo devuelve a la zona del proceso, así que en
 * Bogotá (UTC-5) el sábado se leería viernes. En este módulo eso mueve las dos
 * actividades semanales de la trampa de grasa a un día en que nadie las espera.
 *
 * `getUTCDay()` cuenta el domingo como 0; se mapea a 7 para que coincida con
 * `h360_lab_regla.dia_semana`, que es ISO (1=lunes .. 7=domingo).
 */
function diaSemanaISO(fechaTexto) {
  const dia = fechaSolo(fechaTexto)
  if (!dia) return null
  const [anio, mes, d] = dia.split('-').map(Number)
  const domingoEsCero = new Date(Date.UTC(anio, mes - 1, d)).getUTCDay()
  return domingoEsCero === 0 ? 7 : domingoEsCero
}

/**
 * ¿La regla le toca a esa fecha, mirando solo el calendario?
 *
 * DIARIA  → todos los días.
 * SEMANAL → solo su `dia_semana`.
 * CADA_N_DIAS → siempre false: no se decide por calendario sino por cuándo se
 *   hizo la última vez, y esa consulta es del generador. Si acá dijera true,
 *   una quincenal se programaría todos los días.
 * POR_EVENTO → siempre false: no tiene día. Se registra cuando ocurre el
 *   evento y nunca aparece en la lista del día.
 *
 * Una fecha inválida no le toca a nadie.
 */
function reglaAplicaEn(regla, fechaTexto) {
  if (!regla) return false
  const dia = diaSemanaISO(fechaTexto)
  if (dia === null) return false

  switch (regla.frecuencia) {
    case 'DIARIA':  return true
    case 'SEMANAL': return Number(regla.dia_semana) === dia
    default:        return false   // CADA_N_DIAS, POR_EVENTO y cualquier basura
  }
}

/**
 * ¿Una tarea pendiente de esta frecuencia sobrevive al cierre del día?
 *
 * Solo la DIARIA caduca: lo del lunes que no se hizo el lunes se marca
 * NO_HECHA y se abre una nueva el martes. Todo lo demás arrastra, sigue
 * PENDIENTE y acumula atraso, porque la limpieza quincenal de la trampa de
 * grasa no deja de deberse por pasar la medianoche.
 *
 * El default es arrastrar, no caducar: ante una frecuencia que no reconoce, el
 * error seguro es dejar la tarea abierta. Caducarla borra el atraso y el
 * informe de cumplimiento empieza a mentir a favor nuestro, que en una
 * auditoría sanitaria es el peor de los dos errores.
 */
function arrastra(frecuencia) {
  return frecuencia !== 'DIARIA'
}

module.exports = { diaSemanaISO, reglaAplicaEn, arrastra }
