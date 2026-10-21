const mysql = require('mysql2/promise');
const { migrar } = require('../scripts/migrar');

// Solo corre contra una BD local con nombre explícito (ver testing/guardaBd.js y jest.bigday-int.config.js).
const { prepararBdPrueba } = require('../testing/guardaBd');

const { describeSiBd, cfg } = prepararBdPrueba();

describeSiBd('migrar (integración)', () => {
  let conexion;

  beforeAll(async () => {
    conexion = await mysql.createConnection(cfg());
    await conexion.query('DROP VIEW IF EXISTS vw_bigday_resumen');
    await conexion.query('DROP TABLE IF EXISTS bigday_respuestas');
  });

  afterAll(async () => {
    if (conexion) await conexion.end();
  });

  it('crea la tabla y la vista, y es idempotente (se puede aplicar dos veces)', async () => {
    const mensajes = [];
    await migrar(cfg(), { log: (m) => mensajes.push(m) });
    await migrar(cfg(), { log: (m) => mensajes.push(m) });
    expect(mensajes).toHaveLength(4);

    const [tablas] = await conexion.query(
      "SELECT table_name AS n, table_type AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('bigday_respuestas','vw_bigday_resumen') ORDER BY n",
    );
    expect(tablas.map((r) => [r.n, r.t])).toEqual([
      ['bigday_respuestas', 'BASE TABLE'],
      ['vw_bigday_resumen', 'VIEW'],
    ]);
  });
});
