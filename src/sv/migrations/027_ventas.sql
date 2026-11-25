-- =====================================================================
-- SerVentas CRM — Migración 027: ventas al cerrar el contrato
--
-- 1) sv_crm_ventas: una fila por contrato cerrado, unida a la gestión que lo cerró.
--    Suma a venta_asesor_id, el dueño del cliente, en venta_fecha (día en Colombia).
-- 2) sv_crm_ventas_items: productos vendidos, con cantidad y precio por unidad.
-- 3) sv_crm_ventas_cambios: correcciones y anulaciones del supervisor. Nada se borra.
-- Solo crea tablas. Idempotente. Inofensiva para el código anterior.
-- Debe correr ANTES de desplegar el backend que la usa.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sv_crm_ventas (
  venta_id         INT           AUTO_INCREMENT PRIMARY KEY,
  venta_prosp_id   INT           NOT NULL,
  venta_gest_id    BIGINT        NOT NULL,
  venta_asesor_id  INT           NOT NULL,
  venta_area_id    INT           NOT NULL,
  venta_fecha      DATE          NOT NULL,
  venta_total      DECIMAL(14,2) NOT NULL,
  venta_anulada    TINYINT(1)    NOT NULL DEFAULT 0,
  venta_created_by INT           NOT NULL,
  venta_created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  venta_updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_venta_gestion (venta_gest_id),
  INDEX idx_venta_prosp (venta_prosp_id),
  INDEX idx_venta_asesor_fecha (venta_asesor_id, venta_fecha),
  INDEX idx_venta_area_fecha (venta_area_id, venta_fecha),
  CONSTRAINT fk_venta_prosp   FOREIGN KEY (venta_prosp_id)   REFERENCES sv_crm_prospectos(prosp_id),
  CONSTRAINT fk_venta_gestion FOREIGN KEY (venta_gest_id)    REFERENCES sv_crm_gestiones(gest_id),
  CONSTRAINT fk_venta_asesor  FOREIGN KEY (venta_asesor_id)  REFERENCES sv_org_usuarios(usr_id),
  CONSTRAINT fk_venta_area    FOREIGN KEY (venta_area_id)    REFERENCES sv_cfg_areas_negocio(area_id),
  CONSTRAINT fk_venta_creador FOREIGN KEY (venta_created_by) REFERENCES sv_org_usuarios(usr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: ventas registradas al cerrar el contrato';

CREATE TABLE IF NOT EXISTS sv_crm_ventas_items (
  vi_id              INT           AUTO_INCREMENT PRIMARY KEY,
  vi_venta_id        INT           NOT NULL,
  vi_prod_id         INT           NOT NULL,
  vi_cantidad        SMALLINT      NOT NULL,
  vi_precio_ofrecido DECIMAL(12,2) NULL,
  vi_precio_unitario DECIMAL(12,2) NOT NULL,
  UNIQUE KEY uq_vi_venta_producto (vi_venta_id, vi_prod_id),
  INDEX idx_vi_producto (vi_prod_id),
  CONSTRAINT fk_vi_venta    FOREIGN KEY (vi_venta_id) REFERENCES sv_crm_ventas(venta_id),
  CONSTRAINT fk_vi_producto FOREIGN KEY (vi_prod_id)  REFERENCES sv_cfg_productos(prod_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: productos de cada venta';

CREATE TABLE IF NOT EXISTS sv_crm_ventas_cambios (
  vc_id            INT           AUTO_INCREMENT PRIMARY KEY,
  vc_venta_id      INT           NOT NULL,
  vc_usr_id        INT           NOT NULL,
  vc_accion        VARCHAR(10)   NOT NULL,   -- corregir, anular
  vc_motivo        VARCHAR(250)  NOT NULL,
  vc_total_antes   DECIMAL(14,2) NOT NULL,
  vc_total_despues DECIMAL(14,2) NOT NULL,
  vc_detalle       JSON          NULL,       -- { antes: [...], despues: [...] }
  vc_created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vc_venta (vc_venta_id),
  CONSTRAINT fk_vc_venta   FOREIGN KEY (vc_venta_id) REFERENCES sv_crm_ventas(venta_id),
  CONSTRAINT fk_vc_usuario FOREIGN KEY (vc_usr_id)   REFERENCES sv_org_usuarios(usr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: correcciones y anulaciones de ventas';
