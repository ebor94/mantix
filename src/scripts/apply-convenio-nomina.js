#!/usr/bin/env node
/**
 * Migración: nómina de empleados e invitaciones de convenio.
 *
 *   node src/scripts/apply-convenio-nomina.js
 *
 * Qué hace:
 *   1. CREATE TABLE convenio_empleados — la nómina que la empresa (o el
 *      asesor) importa para el convenio. UNIQUE (convenioId, numeroDocumento)
 *      hace idempotente reimportar la misma nómina (Task 3 usa
 *      ON DUPLICATE KEY UPDATE con esa clave).
 *   2. CREATE TABLE convenio_invitaciones — un token por empleado invitado.
 *      El token lo genera Task 3 con crypto.randomBytes(32).toString('base64url'),
 *      no con el hashId.js reversible que usa el resto del proyecto.
 *   3. ALTER usuarios: agrega empresa_id + índice + FK a empresas. Es lo que
 *      permite acotar por empresa (ver whereConFiltroAsesor en
 *      src/services/afiliado.service.js, que Task 4 extiende).
 *   4. Siembra el rol EMPRESA_RRHH si todavía no existe.
 *
 * ⚠️ ORDEN DE DESPLIEGUE: este script va ANTES de subir el código. server.js
 *    corre sequelize.sync({ alter: false }), que crea tablas faltantes pero NO
 *    altera columnas existentes.
 *
 * Idempotente: se puede correr varias veces. Los CREATE TABLE usan
 * IF NOT EXISTS; el ALTER de usuarios y el rol EMPRESA_RRHH manejan sus
 * códigos de error de "ya existe" como éxito parcial.
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
  // 1. Tabla de nómina
  `CREATE TABLE IF NOT EXISTS convenio_empleados (
     id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     convenioId      INT UNSIGNED NOT NULL,
     tipoDocumento   ENUM('CC','TI','CE','PA','NIT','PPT') NOT NULL,
     numeroDocumento VARCHAR(20) NOT NULL,
     primerNombre    VARCHAR(80) NOT NULL,
     primerApellido  VARCHAR(80) NOT NULL,
     celular         VARCHAR(20) NULL,
     email           VARCHAR(150) NULL,
     cargo           VARCHAR(150) NULL,
     unidadNegocio   VARCHAR(150) NULL,
     activo          TINYINT(1) NOT NULL DEFAULT 1,
     afiliadoId      INT UNSIGNED NULL,
     createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uq_convenio_empleado (convenioId, numeroDocumento),
     KEY idx_convenio_empleados_convenio (convenioId),
     CONSTRAINT fk_convenio_empleados_convenio FOREIGN KEY (convenioId) REFERENCES convenios(id),
     CONSTRAINT fk_convenio_empleados_afiliado FOREIGN KEY (afiliadoId) REFERENCES afiliados(id) ON DELETE SET NULL
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // 2. Tabla de invitaciones
  `CREATE TABLE IF NOT EXISTS convenio_invitaciones (
     id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     convenioId         INT UNSIGNED NOT NULL,
     empleadoId         INT UNSIGNED NOT NULL,
     token              CHAR(43) NOT NULL,
     expiraEn           DATETIME NOT NULL,
     usadoEn            DATETIME NULL,
     afiliadoId         INT UNSIGNED NULL,
     enviadoEn          DATETIME NULL,
     canalEnvio         ENUM('WHATSAPP','EMAIL','MANUAL') NULL,
     creadoPorUsuarioId INT NULL,
     createdAt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_convenio_invitacion_token (token),
     KEY idx_convenio_invitaciones_empleado (empleadoId),
     KEY idx_convenio_invitaciones_convenio (convenioId),
     CONSTRAINT fk_convenio_invitaciones_convenio FOREIGN KEY (convenioId) REFERENCES convenios(id),
     CONSTRAINT fk_convenio_invitaciones_empleado FOREIGN KEY (empleadoId) REFERENCES convenio_empleados(id),
     CONSTRAINT fk_convenio_invitaciones_afiliado FOREIGN KEY (afiliadoId) REFERENCES afiliados(id) ON DELETE SET NULL,
     CONSTRAINT fk_convenio_invitaciones_usuario FOREIGN KEY (creadoPorUsuarioId) REFERENCES usuarios(id) ON DELETE SET NULL
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // 3. usuarios.empresa_id — columna verificada contra src/models/Usuario.js (FK de rol = rol_id)
  `ALTER TABLE usuarios ADD COLUMN empresa_id INT UNSIGNED NULL AFTER rol_id`,

  `ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL`,

  `ALTER TABLE usuarios ADD INDEX idx_usuarios_empresa (empresa_id)`,

  // 4. Rol EMPRESA_RRHH — columna verificada contra src/models/Rol.js (nombre = `nombre`)
  `INSERT INTO roles (nombre, descripcion, permisos, activo, created_at, updated_at)
   SELECT
     'EMPRESA_RRHH',
     'RRHH de empresa convenio — gestiona la nómina de empleados y envía invitaciones de autoafiliación',
     JSON_OBJECT('empresa', JSON_OBJECT(
       'ver', TRUE, 'gestionar_empleados', TRUE, 'invitar', TRUE, 'ver_afiliaciones', TRUE
     )),
     1,
     NOW(), NOW()
   WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre = 'EMPRESA_RRHH')`
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

  let ok = 0, omitidos = 0, fallos = 0;
  for (let i = 0; i < STATEMENTS.length; i++) {
    const stmt = STATEMENTS[i];
    const resumen = stmt.split('\n')[0].slice(0, 80).trim();
    try {
      await conn.query(stmt);
      console.log(`✅ [${i + 1}/${STATEMENTS.length}] ${resumen}...`);
      ok++;
    } catch (e) {
      if (IDEMPOTENT.has(e.code)) {
        console.log(`⚠️  [${i + 1}/${STATEMENTS.length}] ya existía: ${resumen}  (${e.code})`);
        omitidos++;
      } else {
        console.error(`❌ [${i + 1}/${STATEMENTS.length}] FALLÓ: ${resumen}`);
        console.error(`    ${e.code}: ${e.message}`);
        fallos++;
      }
    }
  }

  console.log(`\n📊 ${ok} ejecutados · ${omitidos} ya existían · ${fallos} fallos`);

  // ── Verificación ─────────────────────────────────────────────────────────
  console.log('\n🔍 Verificación:');

  const [tablaEmpleados] = await conn.query("SHOW TABLES LIKE 'convenio_empleados'");
  console.log(`   ${tablaEmpleados.length ? '✅' : '❌'} tabla convenio_empleados`);

  const [tablaInvitaciones] = await conn.query("SHOW TABLES LIKE 'convenio_invitaciones'");
  console.log(`   ${tablaInvitaciones.length ? '✅' : '❌'} tabla convenio_invitaciones`);

  const [col] = await conn.query("SHOW COLUMNS FROM usuarios LIKE 'empresa_id'");
  console.log(`   ${col.length ? '✅' : '❌'} usuarios.empresa_id`);

  const [rol] = await conn.query("SELECT nombre FROM roles WHERE nombre = 'EMPRESA_RRHH'");
  console.log(`   ${rol.length ? '✅' : '❌'} rol EMPRESA_RRHH`);

  if (tablaEmpleados.length) {
    const [[{ n: nEmpleados }]] = await conn.query('SELECT COUNT(*) AS n FROM convenio_empleados');
    console.log(`\n   ℹ️  convenio_empleados: ${nEmpleados} filas (esperado 0 en la primera corrida)`);
  }
  if (tablaInvitaciones.length) {
    const [[{ n: nInvitaciones }]] = await conn.query('SELECT COUNT(*) AS n FROM convenio_invitaciones');
    console.log(`   ℹ️  convenio_invitaciones: ${nInvitaciones} filas (esperado 0 en la primera corrida)`);
  }

  await conn.end();
  process.exit(fallos > 0 ? 1 : 0);
})().catch(e => {
  console.error('💥 Error fatal:', e.message);
  process.exit(1);
});
