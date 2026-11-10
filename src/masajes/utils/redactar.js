// Proyección segura de un error de un adaptador para guardarlo en msj_notificaciones.ultimo_error y en logs
// (spec §17.5): sin cabeceras de autenticación, API keys, tokens, query strings ni celulares completos.
const MAX = 1000;

// El orden importa: primero el token Bearer, si no el patrón de cabeceras se come la palabra "Bearer" y deja el token.
const PATRONES = [
  [/(bearer\s+)[a-z0-9._~+/=-]+/gi, '$1[REDACTADO]'],
  [/(x-hablame-key|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)(\s*[:=]\s*)("?)[^"\s,&}]+/gi, '$1$2$3[REDACTADO]'],
  [/(https?:\/\/[^\s?"']+)\?[^\s"']*/gi, '$1?[REDACTADO]'],
  [/\b(57)?(3\d{2})\d{4}(\d{3})\b/g, (m, p57, a, b) => `${p57 || ''}${a}****${b}`],
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[CLAVE REDACTADA]'],
];

/** Texto corto y seguro de un error: nombre, código y mensaje redactados. Nunca la config ni las cabeceras. */
function redactar(err) {
  if (err === null || err === undefined) return null;
  const partes = [];
  if (err.name) partes.push(err.name);
  if (err.code) partes.push(`code=${err.code}`);
  if (err.status || err.statusCode) partes.push(`status=${err.status || err.statusCode}`);
  partes.push(typeof err === 'string' ? err : (err.message || String(err)));
  let s = partes.join(' | ');
  for (const [re, rep] of PATRONES) s = s.replace(re, rep);
  return s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s;
}

module.exports = { redactar, MAX };
