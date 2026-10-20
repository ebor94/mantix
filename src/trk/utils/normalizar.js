// Normalización de texto para búsquedas y claves naturales (sin tildes, minúsculas, espacios simples).
function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(valor) {
  return normalizarTexto(valor).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'usuario';
}

module.exports = { normalizarTexto, slug };
