const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');

const hayDocker = (() => { try { execFileSync('docker', ['ps'], { stdio: 'ignore' }); return true; } catch { return false; } })();
(hayDocker ? test : test.skip)('genera respaldo con tablas trk_*, roles/usuarios TRK, fotos y checksums', async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  await conn.query("DELETE FROM usuarios WHERE email IN ('respaldo-trk@trikipeludos.local', 'respaldo-otro@ejemplo.com')");
  const [[rolJurado]] = await conn.query("SELECT id FROM roles WHERE nombre = 'TRK_JURADO'");
  const [[rolAdmin]] = await conn.query("SELECT id FROM roles WHERE nombre = 'Administrador'");
  await conn.query("INSERT INTO usuarios (rol_id, nombre, apellido, email, password) VALUES (?, 'JuradoRespaldo', '', 'respaldo-trk@trikipeludos.local', 'x')", [rolJurado.id]);
  await conn.query("INSERT INTO usuarios (rol_id, nombre, apellido, email, password) VALUES (?, 'AdminRespaldo', '', 'respaldo-otro@ejemplo.com', 'x')", [rolAdmin.id]);

  try {
    const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'trk-respaldo-'));
    fs.mkdirSync(process.env.TRK_FOTOS_PATH, { recursive: true });
    fs.writeFileSync(path.join(process.env.TRK_FOTOS_PATH, 'prueba.jpg'), 'x');
    const salida = execFileSync('bash', [path.join(__dirname, '..', 'respaldo.sh'), destino], {
      env: {
        ...process.env,
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        MYSQL: 'docker exec -i -e MYSQL_PWD mysql-trk-test mysql',
        MYSQLDUMP: 'docker exec -i -e MYSQL_PWD mysql-trk-test mysqldump'
      }
    }).toString().trim();
    const carpeta = salida.split('\n').pop();
    const sql = fs.readFileSync(path.join(carpeta, 'trk_tablas.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE `trk_participantes`');
    expect(sql).toContain('trk_vw_calificacion_totales');
    expect(sql).not.toContain('CREATE TABLE `usuarios`');
    const roles = fs.readFileSync(path.join(carpeta, 'trk_roles_usuarios.sql'), 'utf8');
    expect(roles).toContain('TRK_JURADO');
    expect(roles).not.toContain("'Administrador'");
    expect(roles).toContain('JuradoRespaldo');
    expect(roles).not.toContain('AdminRespaldo');
    expect(fs.existsSync(path.join(carpeta, 'fotos.tar.gz'))).toBe(true);
    expect(fs.readFileSync(path.join(carpeta, 'SHA256SUMS'), 'utf8')).toContain('trk_tablas.sql');
    expect(fs.statSync(carpeta).mode & 0o077).toBe(0);
  } finally {
    await conn.query("DELETE FROM usuarios WHERE email IN ('respaldo-trk@trikipeludos.local', 'respaldo-otro@ejemplo.com')");
    await conn.end();
  }
});
