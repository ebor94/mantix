/**
 * fecha_hora.js — normaliza lo que mandan los inputs de fecha y hora.
 *
 * Un `<input type="datetime-local">` manda hora de pared local, sin zona:
 * "2026-11-04T14:30". MySQL guarda DATETIME también sin zona, así que el texto
 * se acomoda tal cual y NO se pasa por `new Date(...)`: convertirlo a Date y
 * sacarle el ISO lo desplaza a UTC, y en Bogotá un encuentro de las 14:30
 * quedaría guardado a las 19:30. Cinco horas de diferencia en una cita a la
 * que tiene que llegar una familia.
 *
 * Devuelve "YYYY-MM-DD HH:MM:SS", o null si lo que llegó no es una fecha y
 * hora de verdad. Null es la señal de rechazo: así quien llama decide si
 * responde 400 o lo deja pasar vacío.
 */

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
  const prueba = new Date(anio, mes - 1, dia)
  if (prueba.getFullYear() !== anio || prueba.getMonth() !== mes - 1 || prueba.getDate() !== dia)
    return null

  const dd = n => String(n).padStart(2, '0')
  return `${anio}-${dd(mes)}-${dd(dia)} ${dd(hora)}:${dd(min)}:${dd(seg)}`
}

module.exports = { normalizarFechaHora }
