-- =====================================================================
-- SerVentas CRM — Migración 006: Multi-área (visibilidad cross-área)
-- Permite que un usuario tenga acceso a N áreas adicionales además de la principal.
-- Perfiles seed:
--   - Supervisor Previsión:   PREV-EMP (principal) + PREV-PAP (extra)
--   - Admin Comercial:        PRENEC (principal) + PREV-EMP + PREV-PAP
--   - Gerente General:        SVC (principal) + las otras 3 (rol nuevo GERENTE_GENERAL)
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- sv_org_usuario_areas — pivote N:M (un usuario puede acceder a varias áreas)
-- El área principal sigue siendo usr_area_id; estas son áreas adicionales.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_usuario_areas (
  usr_id        INT      NOT NULL,
  area_id       INT      NOT NULL,
  ua_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usr_id, area_id),
  CONSTRAINT fk_ua_usr  FOREIGN KEY (usr_id)  REFERENCES sv_org_usuarios(usr_id)     ON DELETE CASCADE,
  CONSTRAINT fk_ua_area FOREIGN KEY (area_id) REFERENCES sv_cfg_areas_negocio(area_id) ON DELETE CASCADE,
  INDEX idx_ua_area (area_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: áreas adicionales accesibles por un usuario (multi-área)';

-- ---------------------------------------------------------------------
-- Nuevo rol GERENTE_GENERAL: read-only cross-área (nivel 2)
-- Útil para gerencia que ve KPIs de todas las áreas sin editar configuración.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_org_roles (rol_codigo, rol_nombre, rol_nivel, rol_permisos) VALUES
  ('GERENTE_GENERAL', 'Gerente General', 2,
   '{"crm":["read"],"admin":["read"],"reportes":["read","export"],"auditoria":["read"]}');

-- ---------------------------------------------------------------------
-- Seed 1: Ampliar Pedro Supervisor Previsión a multi-área (EMP + PAP)
-- ---------------------------------------------------------------------
SET @uid_pedro = (SELECT usr_id FROM sv_org_usuarios WHERE usr_email = 'supervisor.prevision@serfunorte.com');
INSERT IGNORE INTO sv_org_usuario_areas (usr_id, area_id) VALUES
  (@uid_pedro, 2),  -- PREV-EMP (también su principal, redundante pero idempotente)
  (@uid_pedro, 3);  -- PREV-PAP

-- ---------------------------------------------------------------------
-- Seed 2: Admin Comercial — ADMIN_AREA con visibilidad Prenec + EMP + PAP
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_org_usuarios
  (usr_area_id, usr_grupo_id, usr_rol_id, usr_punto_id,
   usr_email, usr_nombre, usr_apellido, usr_password_hash, usr_telefono)
VALUES
  (1, NULL, 2, 1,
   'admin.comercial@serfunorte.com', 'Maria', 'Admin Comercial',
   'PENDING', '301 333 0001');

SET @uid_admincom = (SELECT usr_id FROM sv_org_usuarios WHERE usr_email = 'admin.comercial@serfunorte.com');
INSERT IGNORE INTO sv_org_usuario_areas (usr_id, area_id) VALUES
  (@uid_admincom, 1),  -- PRENEC
  (@uid_admincom, 2),  -- PREV-EMP
  (@uid_admincom, 3);  -- PREV-PAP

-- ---------------------------------------------------------------------
-- Seed 3: Gerente General — rol GERENTE_GENERAL, ve TODAS las áreas (read-only)
-- ---------------------------------------------------------------------
SET @rol_gerente = (SELECT rol_id FROM sv_org_roles WHERE rol_codigo = 'GERENTE_GENERAL');

INSERT IGNORE INTO sv_org_usuarios
  (usr_area_id, usr_grupo_id, usr_rol_id, usr_punto_id,
   usr_email, usr_nombre, usr_apellido, usr_password_hash, usr_telefono)
VALUES
  (1, NULL, @rol_gerente, 1,
   'gerente@serfunorte.com', 'Eduardo', 'Gerente General',
   'PENDING', '301 444 0001');

SET @uid_gerente = (SELECT usr_id FROM sv_org_usuarios WHERE usr_email = 'gerente@serfunorte.com');
INSERT IGNORE INTO sv_org_usuario_areas (usr_id, area_id) VALUES
  (@uid_gerente, 1),  -- PRENEC
  (@uid_gerente, 2),  -- PREV-EMP
  (@uid_gerente, 3),  -- PREV-PAP
  (@uid_gerente, 4);  -- SVC

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- Verificación
SELECT u.usr_email,
       r.rol_codigo,
       a.area_codigo AS area_principal,
       GROUP_CONCAT(DISTINCT ax.area_id ORDER BY ax.area_id) AS areas_extra
  FROM sv_org_usuarios u
  JOIN sv_org_roles r           ON r.rol_id  = u.usr_rol_id
  LEFT JOIN sv_cfg_areas_negocio a ON a.area_id = u.usr_area_id
  LEFT JOIN sv_org_usuario_areas ax ON ax.usr_id = u.usr_id
 WHERE u.usr_email IN (
   'supervisor.prevision@serfunorte.com',
   'admin.comercial@serfunorte.com',
   'gerente@serfunorte.com'
 )
 GROUP BY u.usr_id;
