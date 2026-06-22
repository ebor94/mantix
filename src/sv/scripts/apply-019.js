/**
 * src/sv/scripts/apply-019.js
 * Migración 019 — Periodicidad de seguimiento post-firma para empresas.
 *
 * Agrega `empresa_periodicidad_seguimiento` a sv_crm_empresas. La fecha de
 * inicio del convenio ya vive en sv_crm_prospectos.prosp_fecha_inicio_convenio
 * (Fase 8), así que aquí no se duplica.
 *
 * Idempotente.  Uso:  node src/sv/scripts/apply-019.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const IDEMPOTENT = new Set([
  'ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_FK_DUP_NAME'
]);

const STATEMENTS = [
  `ALTER TABLE sv_crm_empresas
     ADD COLUMN empresa_periodicidad_seguimiento VARCHAR(20) NULL
     COMMENT 'BIMENSUAL | TRIMESTRAL | ANUAL — null = sin seguimiento automático'`
];

(async () => {
  console.log('🔌 Conectando a BD...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
  });
  console.log(`✅ Conectado a ${process.env.DB_HOST}/${process.env.DB_NAME}\n`);

  let ok = 0, skipped = 0, failed = 0;
  for (let i = 0; i < STATEMENTS.length; i++) {
    const stmt = STATEMENTS[i];
    const preview = stmt.split('\n')[0].slice(0, 80).trim();
    try {
      await conn.query(stmt);
      console.log(`✅ [${i + 1}/${STATEMENTS.length}] ${preview}...`);
      ok++;
    } catch (e) {
      if (IDEMPOTENT.has(e.code)) {
        console.log(`⚠️  [${i + 1}/${STATEMENTS.length}] ya existe: ${preview}  (${e.code})`);
        skipped++;
      } else {
        console.error(`❌ [${i + 1}/${STATEMENTS.length}] FALLÓ: ${preview}`);
        console.error(`    ${e.code}: ${e.message}`);
        failed++;
      }
    }
  }
  console.log(`\n📊 ${ok} ejecutados · ${skipped} ya existían · ${failed} fallos`);
  const [r] = await conn.query("SHOW COLUMNS FROM sv_crm_empresas LIKE 'empresa_periodicidad_seguimiento'");
  console.log(`   ${r.length ? '✅' : '❌'} sv_crm_empresas.empresa_periodicidad_seguimiento`);
  await conn.end();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('💥 Error fatal:', e.message); process.exit(1); });
