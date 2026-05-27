-- =====================================================================
-- SerVentas CRM — Migración 004: Empresas B2B (sv_crm_empresas)
-- Target: MySQL 8 / serfuweb
-- Fase 2: previsión empresariales
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- sv_crm_empresas — personas jurídicas (B2B)
-- UNIQUE en empresa_nit (normalizado sin DV) para anti-duplicados
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_empresas (
  empresa_id                INT          AUTO_INCREMENT PRIMARY KEY,
  empresa_nit               VARCHAR(20)  NOT NULL,
  empresa_nit_norm          VARCHAR(20)  NOT NULL UNIQUE,        -- normalizado: solo dígitos sin DV
  empresa_dv                VARCHAR(2)   NULL,                   -- dígito de verificación opcional
  empresa_razon_social      VARCHAR(200) NOT NULL,
  empresa_nombre_comercial  VARCHAR(200) NULL,
  empresa_sector            VARCHAR(80)  NULL,
  empresa_num_empleados     INT          NULL,
  empresa_telefono          VARCHAR(20)  NULL,
  empresa_email_corporativo VARCHAR(150) NULL,
  empresa_sitio_web         VARCHAR(200) NULL,
  empresa_direccion         VARCHAR(250) NULL,
  empresa_ciudad            VARCHAR(80)  DEFAULT 'Cucuta',
  empresa_nota              TEXT         NULL,
  empresa_activa            TINYINT(1)   NOT NULL DEFAULT 1,
  empresa_created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  empresa_updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_empresa_razon (empresa_razon_social),
  INDEX idx_empresa_sector (empresa_sector)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: empresas B2B (UNIQUE nit_norm, anti-duplicados)';

-- ---------------------------------------------------------------------
-- Asociar prosp_empresa_id como FK ahora que existe la tabla
-- (en 003_crm.sql se creó sin FK porque la tabla no existía)
-- ---------------------------------------------------------------------
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'sv_crm_prospectos'
                    AND CONSTRAINT_NAME = 'fk_prosp_empresa');

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE sv_crm_prospectos ADD CONSTRAINT fk_prosp_empresa FOREIGN KEY (prosp_empresa_id) REFERENCES sv_crm_empresas(empresa_id)',
  'SELECT "FK fk_prosp_empresa ya existe" AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- Empresas de prueba (re-uso del SEED original)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_crm_empresas
  (empresa_nit, empresa_nit_norm, empresa_dv, empresa_razon_social,
   empresa_sector, empresa_num_empleados, empresa_telefono, empresa_email_corporativo, empresa_direccion)
VALUES
  ('900234567-1', '900234567', '1', 'Industrias Cúcuta S.A.S.',     'Manufactura', 320, '310 888 9900', 'rrhh@industcuc.com',         'Zona Industrial, Cúcuta'),
  ('800123456-2', '800123456', '2', 'Clínica del Norte Ltda.',       'Salud',       180, '310 777 8800', 'admin@clinicadelnorte.com',  'Av. Libertadores 12-5, Cúcuta'),
  ('901111222-3', '901111222', '3', 'Almacenes Textiles del Norte',  'Comercio',     95, '310 666 7700', 'gerencia@textilesnorte.com', 'Centro Comercial Ventura, Cúcuta');

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- Verificación
SELECT 'Empresas' AS tabla, COUNT(*) AS registros FROM sv_crm_empresas;
