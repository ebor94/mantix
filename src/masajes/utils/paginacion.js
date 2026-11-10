// Paginación de los listados de admin. LIMIT/OFFSET van dentro del SQL (mysql2 execute() no los acepta como ?),
// así que el repositorio solo acepta enteros seguros: un valor raro lanza en vez de llegar al SQL.
const MAX_POR_PAGINA = 100;

function paginar({ pagina = 1, porPagina = 50 } = {}) {
  const p = Number.isSafeInteger(pagina) && pagina >= 1 ? pagina : 1;
  const n = Number.isSafeInteger(porPagina) && porPagina >= 1 ? Math.min(porPagina, MAX_POR_PAGINA) : 50;
  return { pagina: p, porPagina: n, limite: n, desplazamiento: (p - 1) * n };
}

function enteroSql(v) {
  if (!Number.isSafeInteger(v) || v < 0) throw new Error('PAGINACION_INVALIDA');
  return String(v);
}

module.exports = { paginar, enteroSql, MAX_POR_PAGINA };
