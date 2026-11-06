/**
 * errores.js — errores que el controlador sabe contestar.
 *
 * malUso arma el error de una entrada inválida de quien llama (un parámetro de
 * la petición que llegó malformado o demasiado largo). Lleva status = 400 para
 * que el controlador, que mira err.status === 400, responda 400 con el mensaje
 * en vez de un 500 genérico. Sin ese status, una validación correcta del
 * servicio se vería en la API como una falla del servidor y la persona no
 * sabría qué corregir.
 *
 * Devuelve el error, no lo lanza: se usa como `throw malUso('...')`, para que
 * la pila apunte a la línea de la validación.
 */
function malUso(mensaje) {
  const e = new Error(mensaje)
  e.status = 400
  return e
}

module.exports = { malUso }
