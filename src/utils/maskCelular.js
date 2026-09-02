// Enmascara un celular dejando visibles solo los últimos 4 dígitos.
// Ej: "3151234567" -> "••••••4567". Entrada vacía -> "".
module.exports = function maskCelular(cel) {
  const digits = String(cel || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  return '•'.repeat(digits.length - 4) + digits.slice(-4);
};
