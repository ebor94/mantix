/**
 * src/sv/scripts/apply-017.js
 * Migración 017 — Categorización de empresas y grupos empresariales.
 *
 *   - sv_cfg_tipos_empresa: catálogo parametrizable (Grupo / Grupo Recaudo / Mixta).
 *     Se usa "tipo" en BD para no chocar con la columna existente
 *     `empresa_categoria` (tier de fidelización BRONCE/PLATA/ORO/...). En UI
 *     se etiqueta como "Categoría" siguiendo el lenguaje del negocio.
 *
 *   - sv_crm_grupos_empresariales: grupos económicos (ej. Grupo Éxito) a los
 *     que una empresa puede pertenecer (opcional, N empresas:1 grupo).
 *
 *   - ALTER sv_crm_empresas: agrega los dos FKs (empresa_tipo_id NOT NULL en
 *     la práctica vía la validación de la app; aquí queda nullable para no
 *     romper datos existentes — el backfill se hace asignando tipo MIXTA a
 *     las empresas viejas como default conservador).
 *
 * Idempotente.  Uso:  node src/sv/scripts/apply-017.js
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
  // 1. Catálogo parametrizable de tipos / categorías de empresa
  `CREATE TABLE IF NOT EXISTS sv_cfg_tipos_empresa (
    tipoemp_id          INT AUTO_INCREMENT PRIMARY KEY,
    tipoemp_codigo      VARCHAR(40) NOT NULL UNIQUE,
    tipoemp_nombre      VARCHAR(120) NOT NULL,
    tipoemp_descripcion VARCHAR(250),
    tipoemp_orden       INT NOT NULL DEFAULT 0,
    tipoemp_activo      TINYINT(1) NOT NULL DEFAULT 1,
    tipoemp_created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    tipoemp_updated_at  DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tipoemp_activo (tipoemp_activo, tipoemp_orden)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 2. Grupos empresariales (Grupo Éxito, Grupo Bolívar, etc.)
  `CREATE TABLE IF NOT EXISTS sv_crm_grupos_empresariales (
    grupemp_id          INT AUTO_INCREMENT PRIMARY KEY,
    grupemp_nombre      VARCHAR(180) NOT NULL,
    grupemp_descripcion VARCHAR(500),
    grupemp_activo      TINYINT(1) NOT NULL DEFAULT 1,
    grupemp_creado_por  INT NULL,
    grupemp_created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    grupemp_updated_at  DATETIME ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_grupemp_nombre (grupemp_nombre),
    INDEX idx_grupemp_activo (grupemp_activo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3. ALTER sv_crm_empresas — agregar empresa_tipo_id
  `ALTER TABLE sv_crm_empresas ADD COLUMN empresa_tipo_id INT NULL`,

  // 4. FK + índice tipo
  `ALTER TABLE sv_crm_empresas
     ADD CONSTRAINT fk_emp_tipo
     FOREIGN KEY (empresa_tipo_id) REFERENCES sv_cfg_tipos_empresa(tipoemp_id)`,
  `CREATE INDEX idx_emp_tipo ON sv_crm_empresas (empresa_tipo_id)`,

  // 5. ALTER sv_crm_empresas — agregar empresa_grupo_empresarial_id
  `ALTER TABLE sv_crm_empresas ADD COLUMN empresa_grupo_empresarial_id INT NULL`,

  // 6. FK + índice grupo empresarial
  `ALTER TABLE sv_crm_empresas
     ADD CONSTRAINT fk_emp_grupemp
     FOREIGN KEY (empresa_grupo_empresarial_id) REFERENCES sv_crm_grupos_empresariales(grupemp_id)`,
  `CREATE INDEX idx_emp_grupemp ON sv_crm_empresas (empresa_grupo_empresarial_id)`,

  // 7. Seed inicial de tipos de empresa
  `INSERT IGNORE INTO sv_cfg_tipos_empresa (tipoemp_codigo, tipoemp_nombre, tipoemp_descripcion, tipoemp_orden) VALUES
     ('GRUPO',         'Grupo',         'Convenio grupal puro: la empresa cubre el plan a sus empleados.', 1),
     ('GRUPO_RECAUDO', 'Grupo Recaudo','Convenio con recaudo descontado por nómina al empleado.',         2),
     ('MIXTA',         'Mixta',         'Combinación de cobertura grupal + recaudo por nómina.',           3)`
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
  for (const t of ['sv_cfg_tipos_empresa', 'sv_crm_grupos_empresariales']) {
    const [r] = await conn.query('SHOW TABLES LIKE ?', [t]);
    console.log(`   ${r.length ? '✅' : '❌'} tabla ${t}`);
  }
  for (const col of ['empresa_tipo_id', 'empresa_grupo_empresarial_id']) {
    const [r] = await conn.query('SHOW COLUMNS FROM sv_crm_empresas LIKE ?', [col]);
    console.log(`   ${r.length ? '✅' : '❌'} sv_crm_empresas.${col}`);
  }
  const [tipos] = await conn.query('SELECT tipoemp_codigo, tipoemp_nombre FROM sv_cfg_tipos_empresa ORDER BY tipoemp_orden');
  console.log(`\n🏷️  Tipos seed (${tipos.length}):`);
  tipos.forEach(t => console.log(`   - ${t.tipoemp_codigo}: ${t.tipoemp_nombre}`));

  await conn.end();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('💥 Error fatal:', e.message);
  process.exit(1);
});
