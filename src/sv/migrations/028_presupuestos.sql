-- =====================================================================
-- SerVentas CRM — Migración 028: presupuesto mensual por asesor y categoría
-- Solo crea la tabla. Idempotente. Debe correr ANTES de desplegar el backend que la usa.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sv_org_presupuestos (
  pre_id         INT           AUTO_INCREMENT PRIMARY KEY,
  pre_usr_id     INT           NOT NULL,
  pre_area_id    INT           NOT NULL,
  pre_anio       SMALLINT      NOT NULL,
  pre_mes        TINYINT       NOT NULL,
  pre_categoria  VARCHAR(50)   NOT NULL,
  pre_valor      DECIMAL(14,2) NOT NULL DEFAULT 0,
  pre_created_by INT           NOT NULL,
  pre_updated_by INT           NOT NULL,
  pre_created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pre_updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_presupuesto (pre_usr_id, pre_area_id, pre_anio, pre_mes, pre_categoria),
  INDEX idx_pre_area_periodo (pre_area_id, pre_anio, pre_mes),
  CONSTRAINT fk_pre_usr     FOREIGN KEY (pre_usr_id)     REFERENCES sv_org_usuarios(usr_id),
  CONSTRAINT fk_pre_area    FOREIGN KEY (pre_area_id)    REFERENCES sv_cfg_areas_negocio(area_id),
  CONSTRAINT fk_pre_creador FOREIGN KEY (pre_created_by) REFERENCES sv_org_usuarios(usr_id),
  CONSTRAINT fk_pre_editor  FOREIGN KEY (pre_updated_by) REFERENCES sv_org_usuarios(usr_id),
  CONSTRAINT chk_pre_mes    CHECK (pre_mes BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: presupuesto mensual por asesor y categoría de producto';
