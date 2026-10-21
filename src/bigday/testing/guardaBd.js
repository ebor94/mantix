// Guarda de las pruebas de integración destructivas (DROP/DELETE): solo corren contra una BD local y con nombre explícito.
const HOSTS_LOCALES = ['127.0.0.1', 'localhost'];

/** Devuelve { ok: true, cfg } o { ok: false, motivo }. Sin BIGDAY_TEST_DB_HOST también es "no ok" (se omite). */
function configBdPrueba(env = process.env) {
  const host = env.BIGDAY_TEST_DB_HOST;
  if (!host) return { ok: false, motivo: 'BIGDAY_TEST_DB_HOST no definido' };
  if (!HOSTS_LOCALES.includes(host)) {
    return { ok: false, motivo: `BIGDAY_TEST_DB_HOST=${host} no es local (solo 127.0.0.1 o localhost): pruebas omitidas` };
  }
  if (!env.BIGDAY_TEST_DB_NAME || !env.BIGDAY_TEST_DB_NAME.trim()) {
    return { ok: false, motivo: 'BIGDAY_TEST_DB_NAME es obligatorio (sin valor por defecto): pruebas omitidas' };
  }
  return {
    ok: true,
    cfg: {
      host,
      port: Number(env.BIGDAY_TEST_DB_PORT) || 3306,
      user: env.BIGDAY_TEST_DB_USER || 'root',
      password: env.BIGDAY_TEST_DB_PASSWORD || '',
      database: env.BIGDAY_TEST_DB_NAME,
    },
  };
}

/** Para los archivos *.int.test.js: describe o describe.skip, avisando el motivo si se omite. */
function prepararBdPrueba() {
  const r = configBdPrueba();
  if (!r.ok && process.env.BIGDAY_TEST_DB_HOST) console.warn(`bigday int: ${r.motivo}`);
  return { describeSiBd: r.ok ? describe : describe.skip, cfg: () => r.cfg };
}

module.exports = { configBdPrueba, prepararBdPrueba };
