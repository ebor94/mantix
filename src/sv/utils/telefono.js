/**
 * sv/utils/telefono.js
 * Normalización de teléfonos colombianos.
 * - Quita espacios, guiones, paréntesis.
 * - Quita prefijo internacional 57 (+57) si está presente.
 * - Resultado: solo dígitos. Si no es colombiano se preserva con `+` inicial.
 */

function normalizar(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Quita espacios, guiones, paréntesis y puntos.
  s = s.replace(/[\s\-().]+/g, '');

  // Si empieza con +
  if (s.startsWith('+')) {
    // +57XXXXXXXXXX → quitar +57 (Colombia)
    if (s.startsWith('+57') && s.length >= 13) {
      return s.slice(3);
    }
    // Otros países → preservar formato e+
    return s;
  }

  // Si empieza con 0057 / 0057... → quitar
  if (s.startsWith('0057')) return s.slice(4);
  // Si empieza con 57 y tiene 12 dígitos → tratar como +57
  if (/^57\d{10}$/.test(s)) return s.slice(2);

  // Solo dígitos
  return s.replace(/\D/g, '');
}

function esValido(raw) {
  const n = normalizar(raw);
  if (!n) return false;
  // Móvil colombiano: 10 dígitos comenzando por 3
  // Fijo Cúcuta/Norte: 7 dígitos (607x...), permitir 7-15 dígitos genéricos
  const digitos = n.replace(/^\+/, '');
  return digitos.length >= 7 && digitos.length <= 15;
}

module.exports = { normalizar, esValido };
