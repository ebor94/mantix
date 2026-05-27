/**
 * src/sv/scripts/setup.js
 * Setup inicial del módulo SerVentas:
 *   1) Ejecuta migraciones .sql en order (001, 002, 999_seed)
 *   2) Genera hash bcrypt de 'serventas2026' y actualiza los usuarios PENDING
 *
 * Uso:
 *   node src/sv/scripts/setup.js
 *   node src/sv/scripts/setup.js --skip-migrations    # solo reset passwords
 *   node src/sv/scripts/setup.js --password 'otraPwd' # personalizar password seed
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const DEFAULT_PASSWORD = 'serventas2026';
const args = process.argv.slice(2);
const skipMigrations = args.includes('--skip-migrations');
const pwdIdx = args.indexOf('--password');
const seedPassword = pwdIdx >= 0 ? args[pwdIdx + 1] : DEFAULT_PASSWORD;

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

  const migDir = path.join(__dirname, '..', 'migrations');

  if (!skipMigrations) {
    const files = fs.readdirSync(migDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // 001, 002, 999_seed
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      console.log(`▶️  Ejecutando ${f} ...`);
      try {
        await conn.query(sql);
        console.log(`   ✅ ${f} OK`);
      } catch (e) {
        console.error(`   ❌ ${f} FAILED:`, e.message);
        process.exit(1);
      }
    }
  } else {
    console.log('⏭️  Saltando migraciones (--skip-migrations)');
  }

  // Generar bcrypt para usuarios PENDING
  const hash = await bcrypt.hash(seedPassword, 10);
  const [result] = await conn.execute(
    `UPDATE sv_org_usuarios SET usr_password_hash = ? WHERE usr_password_hash = 'PENDING'`,
    [hash]
  );
  console.log(`🔐 Passwords actualizadas: ${result.affectedRows} usuarios (clave: '${seedPassword}')`);

  // Listado de usuarios
  const [users] = await conn.execute(
    `SELECT u.usr_id, u.usr_email, r.rol_codigo AS rol,
            a.area_codigo AS area, g.grupo_codigo AS grupo
       FROM sv_org_usuarios u
       JOIN sv_org_roles r ON r.rol_id = u.usr_rol_id
  LEFT JOIN sv_cfg_areas_negocio a ON a.area_id  = u.usr_area_id
  LEFT JOIN sv_cfg_grupos_trabajo g ON g.grupo_id = u.usr_grupo_id
   ORDER BY u.usr_id`
  );
  console.log('\n👥 Usuarios SerVentas registrados:');
  for (const u of users) {
    console.log(`   #${u.usr_id.toString().padStart(2)} ${u.usr_email.padEnd(40)} ${u.rol.padEnd(13)} ${u.area || '-'} / ${u.grupo || '-'}`);
  }

  await conn.end();
  console.log('\n✅ Setup SerVentas completo.');
})().catch(e => {
  console.error('❌ Error fatal:', e);
  process.exit(1);
});
