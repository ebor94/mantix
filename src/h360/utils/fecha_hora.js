/**
 * fecha_hora.js — el reloj del negocio y la aritmética de fechas de h360.
 *
 * Este archivo es el ÚNICO lugar donde h360 debería decir «America/Bogota» y el
 * único donde debería armarse un `Date` para preguntarle algo a una fecha. No
 * requiere nada: ni el pool, ni Express, ni un controlador. Eso es a propósito,
 * porque es lo que deja que lo importe cualquiera —un servicio puro incluido—
 * sin abrir una conexión a MySQL ni cargar sharp y multer de rebote.
 *
 * ── Lo que falta migrar ────────────────────────────────────────────────────
 * Al cerrar la Tarea 3.5 del laboratorio quedan SEIS archivos de `src/h360` con
 * su propia manipulación de la zona o de las fechas. Son los próximos
 * candidatos, en orden de cuánto duplican:
 *
 *   1. `controllers/desinfecciones.controller.js` — tiene su propia copia de
 *      `relojBogota`, `fechaSolo`, `sumarDias` y `diasEntre`, que son las que se
 *      copiaron acá. Es el que más gana con la migración y el que hay que mover
 *      con más cuidado: las exporta y otros módulos y pruebas las consumen de
 *      ahí.
 *   2. `services/desinfecciones.service.js` — tiene un `hoyBogota()` propio que
 *      NO es el de acá: devuelve DD/MM/AAAA para el encabezado de un mensaje de
 *      Google Chat, no AAAA-MM-DD. Mismo nombre, otro contrato. Migrarlo es
 *      renombrarlo (`hoyBogotaParaMostrar` o parecido), no reapuntarlo.
 *   3. `controllers/duelo.controller.js` — `ZONA_NEGOCIO`, su propia aritmética
 *      UTC (`instanteUtc`, `diasDelRango`) y `horaDePared`, que lee un Date de
 *      la base con getters locales y depende de que el pool no defina
 *      `timezone`. Esa dependencia está documentada allá y hay que leerla antes
 *      de mover nada.
 *   4. `controllers/reapertura.controller.js` — un `toLocaleString` con la zona
 *      escrita a mano para el texto del aviso.
 *   5. `controllers/desinfeccionesAutorizacion.controller.js` — lo mismo.
 *   6. `jobs/desinfecciones.job.js` — la zona del cron (`timezone:
 *      'America/Bogota'` de node-cron). Es la que menos duplica: ahí la zona es
 *      configuración del planificador, no un cálculo.
 *
 * Los seis están en producción. Migrarlos es un cambio con su propia revisión y
 * NO entró en la Tarea 3.5 a propósito.
 */

// ── El reloj del negocio ───────────────────────────────────────────────────
//
// El «hoy» del negocio lo decide el SERVIDOR y en la zona de Bogotá, dicha a
// propósito:
//
//  - El navegador no sirve: el reloj y la zona del dispositivo no son
//    confiables, y un celular puesto en otra zona vería el día equivocado.
//  - La hora local del proceso tampoco: hoy el servidor corre en America/Bogota
//    porque la máquina está configurada así, no porque el código lo decida. En
//    un contenedor normalmente corre en UTC, y entonces entre las 19:00 y la
//    medianoche de Cúcuta el proceso ya marca el día siguiente.
const ZONA_NEGOCIO = 'America/Bogota'

// formatToParts y no el texto formateado, para que el resultado no dependa de
// cómo ordene la fecha un idioma. hourCycle h23 para que la hora venga 00..23 y
// no «5 PM».
const PARTES_BOGOTA = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_NEGOCIO, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

/** El día (AAAA-MM-DD) y la hora de pared (HH:MM) de Bogotá en un instante. */
function relojBogota(instante = new Date()) {
  const p = Object.fromEntries(PARTES_BOGOTA.formatToParts(instante).map(x => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

/**
 * El día de hoy (AAAA-MM-DD) en la zona del negocio.
 *
 * Es literalmente la parte de fecha de `relojBogota()`, y se deriva de ella en
 * vez de armar un segundo `Intl.DateTimeFormat`: dos formateadores paralelos es
 * exactamente la clase de copia que este archivo existe para no tener.
 *
 * OJO: `desinfecciones.service.js` tiene otro `hoyBogota()` que devuelve
 * DD/MM/AAAA para mostrar. Mismo nombre, otro contrato; ver la lista de arriba.
 */
function hoyBogota(instante = new Date()) {
  return relojBogota(instante).dia
}

// ── Fechas sin hora ───────────────────────────────────────────────────────

/**
 * «2026-11-09» o cualquier ISO que empiece por una fecha → «2026-11-09».
 * Null si no es una fecha de verdad: el 31 de febrero se descarta comparando
 * contra un Date armado con los mismos números.
 *
 * Se trabaja con el TEXTO y NO con `new Date(valor)`: un «2026-11-09» pasado por
 * Date es medianoche UTC, que en Bogotá es el 8.
 *
 * El rebote de validación es en UTC (`Date.UTC` + los getters `getUTC*`) y no en
 * la zona del proceso: así la respuesta no depende de en qué zona corra el
 * servidor. `normalizarFechaHora`, más abajo, rebota en hora local; ver la nota
 * que la acompaña.
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

// Aritmética de calendario en UTC, donde ningún horario de verano mueve el día.
function sumarDias(dia, dias) {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

function diasEntre(desde, hasta) {
  const utc = s => { const [a, m, d] = s.split('-').map(Number); return Date.UTC(a, m - 1, d) }
  return Math.round((utc(hasta) - utc(desde)) / 86400000)
}

// ── Fecha y hora de los inputs ────────────────────────────────────────────
//
// Un `<input type="datetime-local">` manda hora de pared local, sin zona:
// "2026-11-04T14:30". MySQL guarda DATETIME también sin zona, así que el texto
// se acomoda tal cual y NO se pasa por `new Date(...)`: convertirlo a Date y
// sacarle el ISO lo desplaza a UTC, y en Bogotá un encuentro de las 14:30
// quedaría guardado a las 19:30. Cinco horas de diferencia en una cita a la que
// tiene que llegar una familia.
//
// Devuelve "YYYY-MM-DD HH:MM:SS", o null si lo que llegó no es una fecha y hora
// de verdad. Null es la señal de rechazo: así quien llama decide si responde 400
// o lo deja pasar vacío.

// Acepta la T del input y el espacio del formato de MySQL; los segundos son
// opcionales porque datetime-local no los manda.
const PATRON = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/

function normalizarFechaHora(valor) {
  const m = PATRON.exec(String(valor ?? '').trim())
  if (!m) return null

  const anio = +m[1], mes = +m[2], dia = +m[3]
  const hora = +m[4], min = +m[5], seg = +(m[6] ?? 0)

  if (mes < 1 || mes > 12 || dia < 1) return null
  if (hora > 23 || min > 59 || seg > 59) return null

  // El patrón acepta un 31 de febrero: se compara contra un Date armado con
  // los mismos números para descartar días que no existen en ese mes.
  //
  // Este rebote es en hora LOCAL y el de `fechaSolo` es en UTC. Para decidir si
  // un día existe en su mes las dos formas responden igual, y se dejan como
  // están a propósito: unificarlas cambiaría el camino por el que pasan las
  // fechas del F-01 de duelo y de reapertura, que están en producción, sin que
  // ninguna prueba vea la diferencia. Es un cambio con su propia revisión.
  const prueba = new Date(anio, mes - 1, dia)
  if (prueba.getFullYear() !== anio || prueba.getMonth() !== mes - 1 || prueba.getDate() !== dia)
    return null

  const dd = n => String(n).padStart(2, '0')
  return `${anio}-${dd(mes)}-${dd(dia)} ${dd(hora)}:${dd(min)}:${dd(seg)}`
}

module.exports = {
  ZONA_NEGOCIO,
  relojBogota,
  hoyBogota,
  fechaSolo,
  sumarDias,
  diasEntre,
  normalizarFechaHora,
}
