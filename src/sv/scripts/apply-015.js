/**
 * src/sv/scripts/apply-015.js
 * Aplica únicamente la migración 015_emp_categoria_documentos.sql.
 * Maneja idempotencia: detecta "Duplicate column / Table exists" y los
 * trata como warnings (sigue) en lugar de abortar.
 *
 * Uso:
 *   node src/sv/scripts/apply-015.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATION = '015_emp_categoria_documentos.sql';
const IDEMPOTENT_CODES = [
  'ER_DUP_FIELDNAME',     // ADD COLUMN ya existe
  'ER_TABLE_EXISTS_ERROR',// CREATE TABLE ya existe
  'ER_DUP_KEYNAME',       // CREATE INDEX ya existe
  'ER_FK_DUP_NAME'        // FK ya existe
];

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  console.log(`✅ Conectado a ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  const sqlPath = path.join(__dirname, '..', 'migrations', MIGRATION);
  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ No existe ${sqlPath}`);
    process.exit(1);
  }
  const fullSql = fs.readFileSync(sqlPath, 'utf8');

  // Dividir en statements separados (rough split por `;\n` final de línea)
  // Esto permite manejar errores idempotentes por statement individual.
  const statements = fullSql
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.trim())
    .filter(s => s && !s.match(/^\s*--/));

  let ok = 0, skipped = 0, failed = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.split('\n')[0].slice(0, 80);
    try {
      await conn.query(stmt);
      console.log(`   ✅ [${i + 1}/${statements.length}] ${preview}`);
      ok++;
    } catch (e) {
      if (IDEMPOTENT_CODES.includes(e.code)) {
        console.log(`   ⚠️  [${i + 1}/${statements.length}] ya existe: ${preview}  (${e.code})`);
        skipped++;
      } else {
        console.error(`   ❌ [${i + 1}/${statements.length}] FALLÓ: ${preview}`);
        console.error(`      ${e.code}: ${e.message}`);
        failed++;
      }
    }
  }

  console.log(`\n📊 ${MIGRATION}: ${ok} ejecutados, ${skipped} ya existían, ${failed} fallos`);

  // Verificación
  console.log(`\n🔍 Verificación:`);
  const checks = [
    `SHOW COLUMNS FROM sv_crm_empresas LIKE 'empresa_categoria'`,
    `SHOW COLUMNS FROM sv_crm_empresas LIKE 'empresa_presupuesto_fideliz'`,
    `SHOW COLUMNS FROM sv_crm_empresas LIKE 'empresa_presupuesto_gastado'`,
    `SHOW COLUMNS FROM sv_fideliz_envios LIKE 'env_costo'`,
    `SHOW TABLES LIKE 'sv_cfg_tipos_documento'`,
    `SHOW TABLES LIKE 'sv_crm_empresa_documentos'`,
    `SHOW TABLES LIKE 'sv_crm_empresa_propuestas'`,
    `SHOW TABLES LIKE 'sv_crm_fideliz_movimientos'`
  ];
  for (const q of checks) {
    const [rows] = await conn.query(q);
    const exists = rows && rows.length > 0;
    const label = q.replace(/SHOW (COLUMNS FROM|TABLES LIKE)/i, '').trim();
    console.log(`   ${exists ? '✅' : '❌'} ${label}`);
  }

  // Conteo de tipos seed
  const [tipos] = await conn.query(`SELECT tipo_codigo, tipo_nombre FROM sv_cfg_tipos_documento ORDER BY tipo_orden`);
  console.log(`\n📋 Tipos de documento (${tipos.length}):`);
  tipos.forEach(t => console.log(`   - ${t.tipo_codigo}: ${t.tipo_nombre}`));

  await conn.end();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('💥 Error fatal:', e.message);
  process.exit(1);
});
