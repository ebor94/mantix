-- ============================================================
-- Migración: nómina de empleados e invitaciones de convenio
-- BD: mantix / serfuweb
-- Fecha: 2026-07
-- ============================================================
--
-- FORMA RECOMENDADA DE APLICAR:
--     node src/scripts/apply-convenio-nomina.js
--
-- El runner de Node hace exactamente este DDL, tolera la re-ejecución y
-- verifica el resultado. Este archivo .sql existe para aplicación manual y
-- como documentación del DDL; ojo que el ALTER de usuarios NO es idempotente
-- (MySQL no admite ADD COLUMN IF NOT EXISTS en todas las versiones): si ya se
-- corrió, falla con ER_DUP_FIELDNAME / ER_DUP_KEYNAME / ER_FK_DUP_NAME y hay
-- que saltearlo a mano.
--
-- ⚠️ ORDEN DE DESPLIEGUE: este SQL va ANTES de subir el código. server.js
--    corre sequelize.sync({ alter: false }), que crea tablas faltantes pero NO
--    altera columnas existentes.
--
-- IMPACTO SOBRE LO EXISTENTE: ninguno.
--   · convenio_empleados y convenio_invitaciones son tablas nuevas.
--   · usuarios.empresa_id es nullable y queda NULL en todas las filas
--     existentes (solo lo usan usuarios con rol EMPRESA_RRHH).
--   · El rol EMPRESA_RRHH es un INSERT condicional: no toca roles existentes.
-- ============================================================

-- ── 1. Tabla convenio_empleados (la nómina) ──────────────────
-- Un empleado es una fila de la nómina que la empresa (o el asesor) importa
-- para el convenio. El UNIQUE (convenioId, numeroDocumento) es lo que hace
-- idempotente reimportar la misma nómina — Task 3 la usa con
-- ON DUPLICATE KEY UPDATE.

CREATE TABLE IF NOT EXISTS convenio_empleados (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. Tabla convenio_invitaciones ───────────────────────────
-- El token lo genera Task 3 con crypto.randomBytes(32).toString('base64url')
-- (43 caracteres base64url sin padding, de ahí CHAR(43)), no con el hashId.js
-- reversible que usa el resto del proyecto.

CREATE TABLE IF NOT EXISTS convenio_invitaciones (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. usuarios.empresa_id ────────────────────────────────────
-- Columna verificada contra src/models/Usuario.js: la FK de rol se llama
-- rol_id (no rolId), de ahí el AFTER rol_id. Es lo que hace posible el scope
-- por empresa que Task 4 construye sobre whereConFiltroAsesor
-- (src/services/afiliado.service.js).

ALTER TABLE usuarios ADD COLUMN empresa_id INT UNSIGNED NULL AFTER rol_id;
ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD INDEX idx_usuarios_empresa (empresa_id);

-- ── 4. Rol EMPRESA_RRHH ───────────────────────────────────────
-- Columna verificada contra src/models/Rol.js: el nombre del rol se guarda en
-- `nombre` (no rol_nombre). Sigue el idiom de JSON_MERGE_PATCH de
-- rbac_afiliaciones_migration.sql (no reemplaza el JSON completo), aunque acá
-- es un INSERT condicional porque el rol no existe todavía. Se completan
-- descripcion y activo explícitos, igual que los demás roles sembrados en
-- rbac_afiliaciones_migration.sql y cym_migration.sql.

INSERT INTO roles (nombre, descripcion, permisos, activo, created_at, updated_at)
SELECT
  'EMPRESA_RRHH',
  'RRHH de empresa convenio — gestiona la nómina de empleados y envía invitaciones de autoafiliación',
  JSON_OBJECT('empresa', JSON_OBJECT(
    'ver', TRUE, 'gestionar_empleados', TRUE, 'invitar', TRUE, 'ver_afiliaciones', TRUE
  )),
  1,
  NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre = 'EMPRESA_RRHH');

-- ── 5. Verificación ──────────────────────────────────────────

SHOW COLUMNS FROM usuarios LIKE 'empresa_id';

SELECT COUNT(*) AS convenio_empleados_tabla_existe
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'convenio_empleados';

SELECT COUNT(*) AS convenio_invitaciones_tabla_existe
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'convenio_invitaciones';

SELECT nombre FROM roles WHERE nombre = 'EMPRESA_RRHH';
