/**
 * contrato.js — qué cuenta como número de contrato.
 *
 * Al abrir el servicio el contrato suele quedar en "PEND": el número real
 * llega después, en el encuentro. Eso importa hacia afuera: un correo que dice
 * "Contrato PEND" o un WhatsApp con ese texto no le sirve a nadie, y tampoco
 * se puede buscar después por el número que al final le quedó al caso.
 *
 * La regla estaba repetida en tres archivos. Vive aquí.
 */
const MIN_LARGO_CONTRATO = 4

/** Al menos cuatro caracteres y algún dígito: "PEND" no pasa, "42348" sí. */
const contratoValido = (v) => {
  const s = String(v ?? '').trim()
  return s.length >= MIN_LARGO_CONTRATO && /\d/.test(s)
}

/** El contrato si sirve; si no, null. */
const contratoONada = (v) => (contratoValido(v) ? String(v).trim() : null)

/**
 * Con qué se identifica el servicio ante alguien de afuera —un proveedor, un
 * conductor—: el contrato cuando ya existe, y si no el código de la
 * asistencia, que se asigna de una y no cambia nunca.
 */
const referenciaServicio = (contrato, codigo) => {
  const c = contratoONada(contrato)
  if (c) return `Contrato ${c}`
  const k = String(codigo ?? '').trim()
  return k || null
}

module.exports = { MIN_LARGO_CONTRATO, contratoValido, contratoONada, referenciaServicio }
