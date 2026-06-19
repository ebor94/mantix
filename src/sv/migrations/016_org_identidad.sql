-- ============================================================================
-- 016_org_identidad.sql
-- SSO entre Afiliaciones y GenFlow (y futuras apps) vía tabla maestra de
-- identidad. No-destructivo: las tablas existentes mantienen su estructura
-- y conservan su rol como tabla principal de cada sistema. Solo se agrega
-- una FK opcional id_identidad en cada una para enlazar al nuevo maestro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. org_identidad — maestra de identidad para login compartido
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_identidad (
  id_identidad        INT AUTO_INCREMENT PRIMARY KEY,
  email_norm          VARCHAR(150) NOT NULL UNIQUE
    COMMENT 'email en lowercase + trim — clave de fusión',
  nombre              VARCHAR(100),
  apellido            VARCHAR(100),
  telefono            VARCHAR(20),
  password_hash       VARCHAR(255) NOT NULL,
  password_changed_at DATETIME,
  must_reset          TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = fusión detectó passwords distintos; forzar reset al próximo login',
  activo              TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_login        DATETIME,
  twofa_secret        VARCHAR(100),
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_identidad_email (email_norm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. org_sesion — sesiones compartidas (refresh tokens)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_sesion (
  sesion_id            CHAR(36) PRIMARY KEY,
  sesion_identidad_id  INT NOT NULL,
  sesion_refresh_hash  CHAR(64) NOT NULL
    COMMENT 'SHA-256 del refresh token; nunca almacenar el token plano',
  sesion_ua            VARCHAR(250),
  sesion_ip            VARCHAR(45),
  sesion_expires_at    DATETIME,
  sesion_created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sesion_identidad FOREIGN KEY (sesion_identidad_id)
    REFERENCES org_identidad(id_identidad) ON DELETE CASCADE,
  INDEX idx_sesion_identidad (sesion_identidad_id),
  INDEX idx_sesion_expires (sesion_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. org_aplicacion — catálogo extensible de apps en el ecosistema
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_aplicacion (
  app_id          INT AUTO_INCREMENT PRIMARY KEY,
  app_codigo      VARCHAR(40)  NOT NULL UNIQUE
    COMMENT 'afiliaciones | genflow | h360 | r44 | cym | ...',
  app_nombre      VARCHAR(120) NOT NULL,
  app_descripcion VARCHAR(250),
  app_url_base    VARCHAR(250) NOT NULL
    COMMENT 'URL pública sin trailing slash. Ej: https://losolivoscucuta.com/genflow',
  app_icon        VARCHAR(20) DEFAULT '📱',
  app_color_hex   VARCHAR(7)
    COMMENT 'Color de la card en el portal (hex con #)',
  app_orden       INT DEFAULT 0,
  app_activa      TINYINT(1) NOT NULL DEFAULT 1,
  app_tabla_users VARCHAR(60)
    COMMENT 'Tabla donde se valida acceso de la identidad. NULL = acceso libre.',
  app_columna_fk  VARCHAR(40)
    COMMENT 'Columna FK a id_identidad en esa tabla (e.g. id_identidad, usr_id_identidad).',
  app_columna_activo VARCHAR(40) DEFAULT 'activo'
    COMMENT 'Columna que indica si el usuario está activo en esa app (e.g. activo, usr_activo).',
  app_created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed inicial de las apps actuales del ecosistema
INSERT IGNORE INTO org_aplicacion
  (app_codigo, app_nombre, app_descripcion, app_url_base, app_icon, app_color_hex, app_orden, app_tabla_users, app_columna_fk, app_columna_activo) VALUES
  ('afiliaciones', 'Afiliaciones',   'Gestión de afiliados, pagos y recibos',  'https://losolivoscucuta.com/afiliaciones', '📋', '#1d4ed8', 1, 'usuarios',        'id_identidad',     'activo'),
  ('genflow',      'GenFlow CRM',    'CRM comercial multi-área Serfunorte',    'https://losolivoscucuta.com/genflow',      '💼', '#00875c', 2, 'sv_org_usuarios', 'usr_id_identidad', 'usr_activo'),
  ('h360',         'H360',           'RRHH, asistencia y gestión de personal', 'https://losolivoscucuta.com/h360',         '👥', '#7c3aed', 3, NULL,              NULL,                NULL),
  ('cym',          'CYM',            'Cementerio y mantenimiento',             'https://losolivoscucuta.com/cym',          '🏛️', '#9B4F20', 4, 'usuarios',        'id_identidad',     'activo'),
  ('r44',          'R44',            'Gestión de proveedores y documentos',    'https://losolivoscucuta.com/r44',          '📑', '#15803d', 5, 'usuarios',        'id_identidad',     'activo');

-- ----------------------------------------------------------------------------
-- 4. ALTERs no destructivos en las tablas existentes (FK opcional a identidad)
--    NOTA: los ADD COLUMN están separados del CONSTRAINT por compatibilidad
--    con scripts que parten por statement individual (el splitter del setup).
-- ----------------------------------------------------------------------------
ALTER TABLE usuarios          ADD COLUMN id_identidad     INT NULL;
ALTER TABLE sv_org_usuarios   ADD COLUMN usr_id_identidad INT NULL;

ALTER TABLE usuarios          ADD CONSTRAINT fk_usuarios_identidad   FOREIGN KEY (id_identidad)     REFERENCES org_identidad(id_identidad);
ALTER TABLE sv_org_usuarios   ADD CONSTRAINT fk_sv_usuarios_identidad FOREIGN KEY (usr_id_identidad) REFERENCES org_identidad(id_identidad);

CREATE INDEX idx_usuarios_identidad   ON usuarios          (id_identidad);
CREATE INDEX idx_sv_usuarios_identidad ON sv_org_usuarios   (usr_id_identidad);
