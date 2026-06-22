/**
 * src/sv/scripts/apply-018.js
 * Migración 018 — Eventos de agenda (transversal: EMP + PAP + manuales).
 *
 *   - sv_org_eventos_agenda: actividades que el asesor agenda en su calendario
 *     personal. Pueden tener vinculación opcional a un prospecto o empresa.
 *     El supervisor puede crear eventos a nombre de cualquier asesor del grupo.
 *
 * Idempotente.  Uso:  node src/sv/scripts/apply-018.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const IDEMPOTENT = new Set([
  'ER_DUP_FIELDNAME',
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_KEYNAME',
  'ER_FK_DUP_NAME',
  'ER_CANT_CREATE_TABLE',
  'ER_DUP_ENTRY'
]);

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sv_org_eventos_agenda (
    evento_id            INT AUTO_INCREMENT PRIMARY KEY,
    evento_asesor_id     INT NOT NULL,
    evento_creado_por    INT NOT NULL,
    evento_titulo        VARCHAR(180) NOT NULL,
    evento_descripcion   TEXT,
    evento_tipo          VARCHAR(40) NOT NULL DEFAULT 'OTRO',
    evento_fecha_hora    DATETIME NOT NULL,
    evento_prosp_id      INT NULL,
    evento_empresa_id    INT NULL,
    evento_completado    TINYINT(1) NOT NULL DEFAULT 0,
    evento_completado_at DATETIME NULL,
    evento_created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    evento_updated_at    DATETIME ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_evento_asesor   FOREIGN KEY (evento_asesor_id)  REFERENCES sv_org_usuarios(usr_id),
    CONSTRAINT fk_evento_creador  FOREIGN KEY (evento_creado_por) REFERENCES sv_org_usuarios(usr_id),
    CONSTRAINT fk_evento_prosp    FOREIGN KEY (evento_prosp_id)   REFERENCES sv_crm_prospectos(prosp_id) ON DELETE SET NULL,
    CONSTRAINT fk_evento_empresa  FOREIGN KEY (evento_empresa_id) REFERENCES sv_crm_empresas(empresa_id) ON DELETE SET NULL,
    INDEX idx_evento_asesor_fecha (evento_asesor_id, evento_fecha_hora),
    INDEX idx_evento_fecha (evento_fecha_hora),
    INDEX idx_evento_completado (evento_completado, evento_fecha_hora)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
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
  console.log('\n🔍 Verificación:');
  const [r] = await conn.query("SHOW TABLES LIKE 'sv_org_eventos_agenda'");
  console.log(`   ${r.length ? '✅' : '❌'} tabla sv_org_eventos_agenda`);

  await conn.end();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('💥 Error fatal:', e.message);
  process.exit(1);
});
