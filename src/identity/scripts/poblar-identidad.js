/**
 * src/identity/scripts/poblar-identidad.js
 *
 * Pobla la tabla maestra org_identidad a partir de los usuarios existentes
 * en `usuarios` (Afiliaciones) y `sv_org_usuarios` (GenFlow).
 *
 * Idempotente: puede correrse múltiples veces sin duplicar identidades
 * (UNIQUE en email_norm + INSERT IGNORE + verificación de id_identidad NULL).
 *
 * Estrategia:
 *   1. Lee todas las filas de `usuarios` con email no nulo.
 *      Para cada email normalizado:
 *        a) INSERT IGNORE en org_identidad con sus datos + password_hash.
 *        b) UPDATE usuarios.id_identidad con el id de la identidad.
 *   2. Lee todas las filas de sv_org_usuarios con usr_email no nulo.
 *      Para cada email normalizado:
 *        a) Si ya existe en org_identidad (overlap), compara password:
 *           - Si difiere → marca must_reset=1 (el más reciente gana,
 *             prefiere sv por ser más nuevo).
 *           - Si coincide → no toca.
 *           Sea como sea, prefiere datos personales de sv (más recientes).
 *        b) Si no existe → INSERT.
 *        c) UPDATE sv_org_usuarios.usr_id_identidad con el id.
 *   3. Reporte final con conteos y conflictos.
 *
 * Uso:
 *   node src/identity/scripts/poblar-identidad.js
 *   node src/identity/scripts/poblar-identidad.js --dry-run    (solo reporta, no escribe)
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DRY = process.argv.includes('--dry-run');

function normEmail(e) {
  return (e || '').toString().trim().toLowerCase();
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
  });
  console.log(`✅ Conectado a ${process.env.DB_HOST}/${process.env.DB_NAME}${DRY ? '  (DRY-RUN)' : ''}\n`);

  let identidadesNuevas = 0;
  let identidadesExistentes = 0;
  let enlazadosAfiliaciones = 0;
  let enlazadosGenflow = 0;
  let conflictosPassword = 0;
  let saltadosSinEmail = 0;

  // ──────────────────────── PASO 1: usuarios (Afiliaciones) ────────────────────────
  console.log('━━━ PASO 1: usuarios (Afiliaciones) ━━━');
  const [usuarios] = await conn.query(`SELECT id, email, nombre, apellido, telefono, password, activo FROM usuarios`);
  console.log(`  ${usuarios.length} filas leídas.`);

  for (const u of usuarios) {
    const email = normEmail(u.email);
    if (!email) { saltadosSinEmail++; continue; }

    if (!DRY) {
      const [r] = await conn.query(
        `INSERT IGNORE INTO org_identidad
           (email_norm, nombre, apellido, telefono, password_hash, activo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [email, u.nombre, u.apellido, u.telefono, u.password, u.activo ? 1 : 0]
      );
      if (r.affectedRows > 0) identidadesNuevas++; else identidadesExistentes++;

      // Resolver id_identidad y enlazar
      const [[ident]] = await conn.query(`SELECT id_identidad FROM org_identidad WHERE email_norm = ?`, [email]);
      if (ident) {
        await conn.query(`UPDATE usuarios SET id_identidad = ? WHERE id = ? AND (id_identidad IS NULL OR id_identidad <> ?)`,
          [ident.id_identidad, u.id, ident.id_identidad]);
        enlazadosAfiliaciones++;
      }
    } else {
      console.log(`   [DRY] crear/enlazar identidad para ${email}`);
    }
  }
  console.log(`  ✅ ${identidadesNuevas} identidades nuevas creadas, ${identidadesExistentes} ya existían.`);
  console.log(`  ✅ ${enlazadosAfiliaciones} filas de \`usuarios\` enlazadas.\n`);

  // ──────────────────── PASO 2: sv_org_usuarios (GenFlow) ────────────────────
  console.log('━━━ PASO 2: sv_org_usuarios (GenFlow) ━━━');
  const [svUsuarios] = await conn.query(
    `SELECT usr_id, usr_email, usr_nombre, usr_apellido, usr_telefono, usr_password_hash, usr_activo
     FROM sv_org_usuarios`
  );
  console.log(`  ${svUsuarios.length} filas leídas.`);

  let svNuevas = 0, svFusion = 0;
  for (const u of svUsuarios) {
    const email = normEmail(u.usr_email);
    if (!email) { saltadosSinEmail++; continue; }

    if (!DRY) {
      // Buscar si ya existe identidad
      const [[ident]] = await conn.query(`SELECT * FROM org_identidad WHERE email_norm = ?`, [email]);
      let idIdentidad;
      if (ident) {
        // Overlap detectado: comparar passwords
        if (ident.password_hash !== u.usr_password_hash) {
          await conn.query(
            `UPDATE org_identidad SET
               nombre        = COALESCE(?, nombre),
               apellido      = COALESCE(?, apellido),
               telefono      = COALESCE(?, telefono),
               password_hash = ?,
               must_reset    = 1
             WHERE id_identidad = ?`,
            [u.usr_nombre, u.usr_apellido, u.usr_telefono, u.usr_password_hash, ident.id_identidad]
          );
          conflictosPassword++;
        } else {
          // Mismo password: solo refresca datos personales (SV más reciente)
          await conn.query(
            `UPDATE org_identidad SET
               nombre   = COALESCE(?, nombre),
               apellido = COALESCE(?, apellido),
               telefono = COALESCE(?, telefono)
             WHERE id_identidad = ?`,
            [u.usr_nombre, u.usr_apellido, u.usr_telefono, ident.id_identidad]
          );
        }
        svFusion++;
        idIdentidad = ident.id_identidad;
      } else {
        const [r] = await conn.query(
          `INSERT INTO org_identidad
             (email_norm, nombre, apellido, telefono, password_hash, activo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [email, u.usr_nombre, u.usr_apellido, u.usr_telefono, u.usr_password_hash, u.usr_activo ? 1 : 0]
        );
        idIdentidad = r.insertId;
        svNuevas++;
      }

      // Enlazar
      await conn.query(
        `UPDATE sv_org_usuarios SET usr_id_identidad = ?
         WHERE usr_id = ? AND (usr_id_identidad IS NULL OR usr_id_identidad <> ?)`,
        [idIdentidad, u.usr_id, idIdentidad]
      );
      enlazadosGenflow++;
    } else {
      console.log(`   [DRY] sincronizar identidad para ${email}`);
    }
  }
  console.log(`  ✅ ${svNuevas} identidades NUEVAS de GenFlow, ${svFusion} fusionadas con afiliaciones.`);
  console.log(`  ⚠️  ${conflictosPassword} conflictos de password (must_reset=1).`);
  console.log(`  ✅ ${enlazadosGenflow} filas de sv_org_usuarios enlazadas.\n`);

  // ──────────────────── REPORTE FINAL ────────────────────
  console.log('━━━ REPORTE FINAL ━━━');
  if (saltadosSinEmail > 0) console.log(`  ⚠️  ${saltadosSinEmail} filas saltadas (sin email)`);

  const [[tot]] = await conn.query(`SELECT COUNT(*) AS n FROM org_identidad`);
  const [[aSinId]] = await conn.query(`SELECT COUNT(*) AS n FROM usuarios WHERE id_identidad IS NULL AND email IS NOT NULL AND email <> ''`);
  const [[svSinId]] = await conn.query(`SELECT COUNT(*) AS n FROM sv_org_usuarios WHERE usr_id_identidad IS NULL AND usr_email IS NOT NULL AND usr_email <> ''`);
  const [[mustReset]] = await conn.query(`SELECT COUNT(*) AS n FROM org_identidad WHERE must_reset = 1`);

  console.log(`  org_identidad total: ${tot.n}`);
  console.log(`  usuarios sin id_identidad: ${aSinId.n}  ${aSinId.n === 0 ? '✅' : '⚠️'}`);
  console.log(`  sv_org_usuarios sin usr_id_identidad: ${svSinId.n}  ${svSinId.n === 0 ? '✅' : '⚠️'}`);
  console.log(`  identidades marcadas must_reset=1: ${mustReset.n}`);

  await conn.end();
  process.exit(0);
})().catch(e => {
  console.error('💥 Error fatal:', e.message);
  console.error(e.stack);
  process.exit(1);
});
