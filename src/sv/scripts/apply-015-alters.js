/**
 * Aplica los ALTER TABLE faltantes de la migración 015.
 * Ejecuta cada columna por separado para evitar problemas de split SQL.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const STATEMENTS = [
  // sv_crm_empresas: categoría + presupuesto
  `ALTER TABLE sv_crm_empresas ADD COLUMN empresa_categoria VARCHAR(20) NULL COMMENT 'BRONCE / PLATA / ORO / PLATINO / DIAMANTE'`,
  `ALTER TABLE sv_crm_empresas ADD COLUMN empresa_presupuesto_fideliz DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT 'Presupuesto total asignado para fidelización (manual por empresa)'`,
  `ALTER TABLE sv_crm_empresas ADD COLUMN empresa_presupuesto_gastado DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT 'Acumulado de envíos descontados del presupuesto'`,
  `CREATE INDEX idx_empresa_categoria ON sv_crm_empresas (empresa_categoria)`,

  // sv_fideliz_envios: costo opcional
  `ALTER TABLE sv_fideliz_envios ADD COLUMN env_costo DECIMAL(15,2) NULL COMMENT 'Costo estimado del detalle/regalo enviado. Si está presente, se descuenta del presupuesto fidelización de la empresa'`
];

const IDEMPOTENT_CODES = ['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME'];

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
  });
  console.log(`✅ Conectado a ${process.env.DB_HOST}/${process.env.DB_NAME}\n`);

  for (let i = 0; i < STATEMENTS.length; i++) {
    const stmt = STATEMENTS[i];
    const preview = stmt.slice(0, 90);
    try {
      await conn.query(stmt);
      console.log(`✅ [${i + 1}/${STATEMENTS.length}] ${preview}...`);
    } catch (e) {
      if (IDEMPOTENT_CODES.includes(e.code)) {
        console.log(`⚠️  [${i + 1}/${STATEMENTS.length}] ya existe: ${preview}...`);
      } else {
        console.error(`❌ [${i + 1}/${STATEMENTS.length}] FALLÓ: ${preview}`);
        console.error(`    ${e.code}: ${e.message}`);
      }
    }
  }

  // Verificación
  console.log(`\n🔍 Verificación columnas:`);
  const checks = [
    ['sv_crm_empresas', 'empresa_categoria'],
    ['sv_crm_empresas', 'empresa_presupuesto_fideliz'],
    ['sv_crm_empresas', 'empresa_presupuesto_gastado'],
    ['sv_fideliz_envios', 'env_costo']
  ];
  for (const [tbl, col] of checks) {
    const [rows] = await conn.query(`SHOW COLUMNS FROM ${tbl} LIKE ?`, [col]);
    console.log(`   ${rows.length ? '✅' : '❌'} ${tbl}.${col}`);
  }

  await conn.end();
})().catch(e => {
  console.error('💥 Error fatal:', e.message);
  process.exit(1);
});
