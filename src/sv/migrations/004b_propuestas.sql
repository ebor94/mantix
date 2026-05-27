-- =====================================================================
-- SerVentas CRM — Migración 004b: Propuestas B2B (sv_sales_propuestas)
-- Target: MySQL 8 / serfuweb
-- Fase 2: editor de propuestas con PDF y envío email
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- sv_sales_propuestas — cabecera de propuesta enviada
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_sales_propuestas (
  prop_id               INT           AUTO_INCREMENT PRIMARY KEY,
  prop_numero           VARCHAR(30)   NOT NULL UNIQUE,            -- ej PROP-2026-0001
  prop_prospecto_id     INT           NOT NULL,
  prop_empresa_id       INT           NULL,
  prop_contacto_id      INT           NULL,                       -- persona contacto
  prop_creado_por       INT           NOT NULL,
  prop_valor_total      DECIMAL(14,2) NOT NULL DEFAULT 0,
  prop_descuento_pct    DECIMAL(5,2)  NOT NULL DEFAULT 0,
  prop_vigencia_dias    SMALLINT      NOT NULL DEFAULT 30,
  prop_fecha_envio      DATETIME      NULL,
  prop_canal_envio      VARCHAR(20)   NULL,                       -- 'correo','presencial'
  prop_destinatario     VARCHAR(200)  NULL,                       -- email o nombre
  prop_estado           VARCHAR(20)   NOT NULL DEFAULT 'borrador',-- borrador, enviada, aceptada, rechazada
  prop_archivo_url      VARCHAR(255)  NULL,                       -- ruta al PDF generado
  prop_notas            TEXT          NULL,
  prop_created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prop_updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prop_prospecto FOREIGN KEY (prop_prospecto_id) REFERENCES sv_crm_prospectos(prosp_id),
  CONSTRAINT fk_prop_empresa   FOREIGN KEY (prop_empresa_id)   REFERENCES sv_crm_empresas(empresa_id),
  CONSTRAINT fk_prop_contacto  FOREIGN KEY (prop_contacto_id)  REFERENCES sv_crm_personas(persona_id),
  CONSTRAINT fk_prop_creador   FOREIGN KEY (prop_creado_por)   REFERENCES sv_org_usuarios(usr_id),
  INDEX idx_prop_prospecto (prop_prospecto_id),
  INDEX idx_prop_empresa   (prop_empresa_id),
  INDEX idx_prop_estado    (prop_estado, prop_created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: propuestas comerciales B2B';

-- ---------------------------------------------------------------------
-- sv_sales_propuesta_items — productos/servicios de la propuesta
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_sales_propuesta_items (
  pi_id              INT           AUTO_INCREMENT PRIMARY KEY,
  pi_prop_id         INT           NOT NULL,
  pi_prod_id         INT           NULL,
  pi_descripcion     VARCHAR(200)  NOT NULL,
  pi_cantidad        INT           NOT NULL DEFAULT 1,
  pi_precio_unitario DECIMAL(12,2) NOT NULL,
  pi_descuento_pct   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  pi_subtotal        DECIMAL(14,2) NOT NULL,
  pi_orden           SMALLINT      NOT NULL DEFAULT 0,
  CONSTRAINT fk_pi_prop FOREIGN KEY (pi_prop_id) REFERENCES sv_sales_propuestas(prop_id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_prod FOREIGN KEY (pi_prod_id) REFERENCES sv_cfg_productos(prod_id),
  INDEX idx_pi_prop (pi_prop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: items (productos) de cada propuesta';

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

SELECT 'Propuestas' AS tabla, COUNT(*) AS registros FROM sv_sales_propuestas
UNION ALL SELECT 'PropuestaItems', COUNT(*) FROM sv_sales_propuesta_items;
