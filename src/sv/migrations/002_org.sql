-- =====================================================================
-- SerVentas CRM — Migración 002: Organización (sv_org_*)
-- Target: MySQL 8 / serfuweb
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- sv_org_roles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_roles (
  rol_id       INT          AUTO_INCREMENT PRIMARY KEY,
  rol_codigo   VARCHAR(30)  NOT NULL UNIQUE,
  rol_nombre   VARCHAR(80)  NOT NULL,
  rol_nivel    SMALLINT     NOT NULL,
  rol_permisos JSON         NOT NULL,
  rol_activo   TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: roles jerarquicos (nivel 1=super admin)';

-- ---------------------------------------------------------------------
-- sv_org_usuarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_usuarios (
  usr_id            INT           AUTO_INCREMENT PRIMARY KEY,
  usr_area_id       INT           NULL,
  usr_grupo_id      INT           NULL,
  usr_rol_id        INT           NOT NULL,
  usr_punto_id      INT           NULL,
  usr_email         VARCHAR(150)  NOT NULL UNIQUE,
  usr_nombre        VARCHAR(100)  NOT NULL,
  usr_apellido      VARCHAR(100)  NOT NULL,
  usr_telefono      VARCHAR(20)   NULL,
  usr_password_hash VARCHAR(255)  NOT NULL,
  usr_2fa_secret    VARCHAR(100)  NULL,
  usr_preferencias  JSON          NULL,
  usr_activo        TINYINT(1)    NOT NULL DEFAULT 1,
  usr_ultimo_login  DATETIME      NULL,
  usr_created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usr_updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usr_area  FOREIGN KEY (usr_area_id)  REFERENCES sv_cfg_areas_negocio(area_id),
  CONSTRAINT fk_usr_grupo FOREIGN KEY (usr_grupo_id) REFERENCES sv_cfg_grupos_trabajo(grupo_id),
  CONSTRAINT fk_usr_rol   FOREIGN KEY (usr_rol_id)   REFERENCES sv_org_roles(rol_id),
  CONSTRAINT fk_usr_punto FOREIGN KEY (usr_punto_id) REFERENCES sv_cfg_puntos_atencion(punto_id),
  INDEX idx_usr_area_grupo (usr_area_id, usr_grupo_id),
  INDEX idx_usr_rol        (usr_rol_id),
  INDEX idx_usr_activo     (usr_activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: usuarios del modulo (independientes de mantix.usuarios)';

-- ---------------------------------------------------------------------
-- sv_org_metas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_metas (
  meta_id         INT           AUTO_INCREMENT PRIMARY KEY,
  meta_usuario_id INT           NULL,
  meta_grupo_id   INT           NULL,
  meta_anio       SMALLINT      NOT NULL,
  meta_mes        SMALLINT      NOT NULL,
  meta_contratos  INT           NOT NULL DEFAULT 0,
  meta_gestiones  INT           NOT NULL DEFAULT 0,
  meta_valor_cop  DECIMAL(14,2) NOT NULL DEFAULT 0,
  meta_created_by INT           NULL,
  meta_created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_meta_usuario FOREIGN KEY (meta_usuario_id) REFERENCES sv_org_usuarios(usr_id),
  CONSTRAINT fk_meta_grupo   FOREIGN KEY (meta_grupo_id)   REFERENCES sv_cfg_grupos_trabajo(grupo_id),
  CONSTRAINT fk_meta_creador FOREIGN KEY (meta_created_by) REFERENCES sv_org_usuarios(usr_id),
  CONSTRAINT chk_meta_mes    CHECK (meta_mes BETWEEN 1 AND 12),
  CONSTRAINT chk_meta_scope  CHECK (
    (meta_usuario_id IS NOT NULL AND meta_grupo_id IS NULL) OR
    (meta_usuario_id IS NULL     AND meta_grupo_id IS NOT NULL)
  ),
  INDEX idx_meta_usuario_periodo (meta_usuario_id, meta_anio, meta_mes),
  INDEX idx_meta_grupo_periodo   (meta_grupo_id, meta_anio, meta_mes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: metas mensuales por usuario o grupo';

-- ---------------------------------------------------------------------
-- sv_org_sesiones
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_sesiones (
  sesion_id          CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  sesion_usuario_id  INT          NOT NULL,
  sesion_token_hash  VARCHAR(255) NOT NULL,
  sesion_dispositivo VARCHAR(200) NULL,
  sesion_ip          VARCHAR(45)  NULL,
  sesion_expires_at  DATETIME     NOT NULL,
  sesion_created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sesion_usuario FOREIGN KEY (sesion_usuario_id) REFERENCES sv_org_usuarios(usr_id) ON DELETE CASCADE,
  INDEX idx_sesion_usuario  (sesion_usuario_id),
  INDEX idx_sesion_hash     (sesion_token_hash),
  INDEX idx_sesion_expires  (sesion_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: sesiones (refresh tokens hasheados)';

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;
