/**
 * src/sv/scripts/apply-016.js
 * Aplica la migración 016 (SSO: org_identidad, org_sesion, org_aplicacion + ALTERs).
 * Idempotente: trata "ya existe" como warning y continúa.
 *
 * Uso:
 *   node src/sv/scripts/apply-016.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const IDEMPOTENT = new Set([
  'ER_DUP_FIELDNAME',
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_KEYNAME',
  'ER_FK_DUP_NAME',
  'ER_CANT_CREATE_TABLE',     // FK ya existe
  'ER_FK_CANNOT_DROP_PARENT'
]);

// Statements explícitos (no split por '; \n' por COMMENT multilínea)
const STATEMENTS = [
  // 1. org_identidad
  `CREATE TABLE IF NOT EXISTS org_identidad (
    id_identidad        INT AUTO_INCREMENT PRIMARY KEY,
    email_norm          VARCHAR(150) NOT NULL UNIQUE,
    nombre              VARCHAR(100),
    apellido            VARCHAR(100),
    telefono            VARCHAR(20),
    password_hash       VARCHAR(255) NOT NULL,
    password_changed_at DATETIME,
    must_reset          TINYINT(1) NOT NULL DEFAULT 0,
    activo              TINYINT(1) NOT NULL DEFAULT 1,
    ultimo_login        DATETIME,
    twofa_secret        VARCHAR(100),
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_identidad_email (email_norm)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 2. org_sesion
  `CREATE TABLE IF NOT EXISTS org_sesion (
    sesion_id            CHAR(36) PRIMARY KEY,
    sesion_identidad_id  INT NOT NULL,
    sesion_refresh_hash  CHAR(64) NOT NULL,
    sesion_ua            VARCHAR(250),
    sesion_ip            VARCHAR(45),
    sesion_expires_at    DATETIME,
    sesion_created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sesion_identidad FOREIGN KEY (sesion_identidad_id) REFERENCES org_identidad(id_identidad) ON DELETE CASCADE,
    INDEX idx_sesion_identidad (sesion_identidad_id),
    INDEX idx_sesion_expires (sesion_expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3. org_aplicacion
  `CREATE TABLE IF NOT EXISTS org_aplicacion (
    app_id             INT AUTO_INCREMENT PRIMARY KEY,
    app_codigo         VARCHAR(40)  NOT NULL UNIQUE,
    app_nombre         VARCHAR(120) NOT NULL,
    app_descripcion    VARCHAR(250),
    app_url_base       VARCHAR(250) NOT NULL,
    app_icon           VARCHAR(20) DEFAULT '📱',
    app_color_hex      VARCHAR(7),
    app_orden          INT DEFAULT 0,
    app_activa         TINYINT(1) NOT NULL DEFAULT 1,
    app_tabla_users    VARCHAR(60),
    app_columna_fk     VARCHAR(40),
    app_columna_activo VARCHAR(40) DEFAULT 'activo',
    app_created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 4. Seed apps
  `INSERT IGNORE INTO org_aplicacion
    (app_codigo, app_nombre, app_descripcion, app_url_base, app_icon, app_color_hex, app_orden, app_tabla_users, app_columna_fk, app_columna_activo) VALUES
    ('afiliaciones', 'Afiliaciones',   'Gestión de afiliados, pagos y recibos',  'https://losolivoscucuta.com/afiliaciones', '📋', '#1d4ed8', 1, 'usuarios',        'id_identidad',     'activo'),
    ('genflow',      'GenFlow CRM',    'CRM comercial multi-área Serfunorte',    'https://losolivoscucuta.com/genflow',      '💼', '#00875c', 2, 'sv_org_usuarios', 'usr_id_identidad', 'usr_activo'),
    ('h360',         'H360',           'RRHH, asistencia y gestión de personal', 'https://losolivoscucuta.com/h360',         '👥', '#7c3aed', 3, NULL,              NULL,                NULL),
    ('cym',          'CYM',            'Cementerio y mantenimiento',             'https://losolivoscucuta.com/cym',          '🏛️', '#9B4F20', 4, 'usuarios',        'id_identidad',     'activo'),
    ('r44',          'R44',            'Gestión de proveedores y documentos',    'https://losolivoscucuta.com/r44',          '📑', '#15803d', 5, 'usuarios',        'id_identidad',     'activo')`,

  // 5. ALTER usuarios + FK
  `ALTER TABLE usuarios ADD COLUMN id_identidad INT NULL`,
  `ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_identidad FOREIGN KEY (id_identidad) REFERENCES org_identidad(id_identidad)`,
  `CREATE INDEX idx_usuarios_identidad ON usuarios (id_identidad)`,

  // 6. ALTER sv_org_usuarios + FK
  `ALTER TABLE sv_org_usuarios ADD COLUMN usr_id_identidad INT NULL`,
  `ALTER TABLE sv_org_usuarios ADD CONSTRAINT fk_sv_usuarios_identidad FOREIGN KEY (usr_id_identidad) REFERENCES org_identidad(id_identidad)`,
  `CREATE INDEX idx_sv_usuarios_identidad ON sv_org_usuarios (usr_id_identidad)`
];

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

  console.log(`\n🔍 Verificación:`);
  for (const t of ['org_identidad', 'org_sesion', 'org_aplicacion']) {
    const [r] = await conn.query(`SHOW TABLES LIKE ?`, [t]);
    console.log(`   ${r.length ? '✅' : '❌'} tabla ${t}`);
  }
  for (const [tbl, col] of [['usuarios','id_identidad'], ['sv_org_usuarios','usr_id_identidad']]) {
    const [r] = await conn.query(`SHOW COLUMNS FROM ${tbl} LIKE ?`, [col]);
    console.log(`   ${r.length ? '✅' : '❌'} ${tbl}.${col}`);
  }
  const [apps] = await conn.query(`SELECT app_codigo, app_nombre FROM org_aplicacion ORDER BY app_orden`);
  console.log(`\n📱 Apps catalogadas (${apps.length}):`);
  apps.forEach(a => console.log(`   - ${a.app_codigo}: ${a.app_nombre}`));

  await conn.end();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('💥 Error fatal:', e.message);
  process.exit(1);
});
