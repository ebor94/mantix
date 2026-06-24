/**
 * src/sv/scripts/apply-020.js
 * Migración 020 — Roles nuevos para la jerarquía comercial.
 *
 *   - DIRECTOR_COMERCIAL (nivel 2): jefe de los grupos Empresariales + PAP +
 *     SVC. Hace gestiones y supervisa toda la actividad de Previsión. NO ve
 *     Prenecesidad (telemercadeo es área aparte).
 *   - COORDINADOR_PREVISION (nivel 3): jefe del equipo Empresarial. Mismo
 *     nivel que SUPERVISOR pero rol distinto para semántica clara y para
 *     diferenciar permisos a futuro.
 *
 * La restricción de áreas (Director NO ve PRENEC) se hace asignando solo
 * 3 entries en sv_org_usuario_areas cuando se cree el usuario director;
 * el rol no aplica restricción por sí mismo (es cross-grupo dentro de su
 * scope multi-área).
 *
 * Idempotente.  Uso:  node src/sv/scripts/apply-020.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const IDEMPOTENT = new Set(['ER_DUP_ENTRY', 'ER_DUP_KEYNAME']);

const STATEMENTS = [
  `INSERT IGNORE INTO sv_org_roles
     (rol_codigo, rol_nombre, rol_nivel, rol_permisos, rol_activo)
   VALUES (
     'DIRECTOR_COMERCIAL',
     'Director Comercial',
     2,
     '{"crm":["read","write"],"reportes":["read","export"],"auditoria":["read"],"agenda":["read","write"]}',
     1
   )`,

  `INSERT IGNORE INTO sv_org_roles
     (rol_codigo, rol_nombre, rol_nivel, rol_permisos, rol_activo)
   VALUES (
     'COORDINADOR_PREVISION',
     'Coordinador de Previsión',
     3,
     '{"crm":["read","write"],"reportes":["read","export"],"agenda":["read","write"]}',
     1
   )`
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
      const [res] = await conn.query(stmt);
      const insertados = res.affectedRows || 0;
      if (insertados === 0) {
        console.log(`⚠️  [${i + 1}/${STATEMENTS.length}] ya existía: ${preview}...`);
        skipped++;
      } else {
        console.log(`✅ [${i + 1}/${STATEMENTS.length}] insertado: ${preview}...`);
        ok++;
      }
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

  console.log(`\n📊 ${ok} insertados · ${skipped} ya existían · ${failed} fallos`);

  console.log('\n🔍 Verificación:');
  const [roles] = await conn.query(
    "SELECT rol_id, rol_codigo, rol_nombre, rol_nivel FROM sv_org_roles WHERE rol_codigo IN ('DIRECTOR_COMERCIAL','COORDINADOR_PREVISION') ORDER BY rol_nivel"
  );
  console.table(roles);

  await conn.end();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('💥 Error fatal:', e.message); process.exit(1); });
