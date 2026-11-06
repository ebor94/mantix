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

/**
 * noEncontrado arma el error de algo que se pidió por id y no existe. Lleva
 * status = 404 porque no es lo que arma malUso: la petición está bien escrita y
 * lo que falta es la fila. Con los dos casos saliendo como un mismo 400, la
 * pantalla dice «revisa lo que pediste» de una petición correcta y quien depura
 * busca el error en el cuerpo, que es justo donde no está.
 *
 * Igual que malUso, devuelve el error y no lo lanza, para que la pila apunte a
 * la línea que lo detectó.
 */
function noEncontrado(mensaje) {
  const e = new Error(mensaje)
  e.status = 404
  return e
}

module.exports = { malUso, noEncontrado }
