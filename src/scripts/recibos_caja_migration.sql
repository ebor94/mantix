-- ================================================================
-- Migración: Recibos de caja y consecutivos
-- BD: serfuweb
-- Fecha: 2026-05-21
-- Descripción:
--   1) Tabla consecutivos_recibo: mantiene el último número por prefijo,
--      bloqueable con SELECT ... FOR UPDATE para evitar race conditions.
--   2) Tabla recibos_caja: un recibo por afiliación con pago no posfechado;
--      o un recibo cuando el asesor marca posfechado como cobrado.
--   3) Extiende enum trazabilidad.tipo con APROBACION_RECIBO y COBRO_POSFECHADO.
-- ================================================================

-- 1. Tabla de contadores (un row por prefijo)
CREATE TABLE IF NOT EXISTS consecutivos_recibo (
  prefijo         VARCHAR(10) NOT NULL,
  ultimo_numero   INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (prefijo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de recibos de caja
CREATE TABLE IF NOT EXISTS recibos_caja (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  afiliado_id          INT UNSIGNED NOT NULL,
  asesor_id            INT NOT NULL COMMENT 'Snapshot del asesor que emitió el recibo',
  prefijo              VARCHAR(10) NOT NULL COMMENT 'Snapshot del prefijo del asesor al momento de emitir',
  consecutivo          INT UNSIGNED NOT NULL,
  numero_recibo        VARCHAR(20) NOT NULL COMMENT 'Formato: prefijo + - + consecutivo padStart(6, 0)',
  forma_pago           ENUM('EFECTIVO','TRANSFERENCIA','CORRESPONSAL','POSFECHADO_COBRADO') NOT NULL,
  valor                DECIMAL(12,2) NOT NULL,
  banco                VARCHAR(200) NULL,
  referencia           VARCHAR(200) NULL,
  soporte_url          VARCHAR(500) NULL COMMENT 'Path al archivo soporte (igual a Afiliado.soportePago si proviene de la afiliación inicial)',
  estado_cuadre        ENUM('PENDIENTE','APROBADO') NOT NULL DEFAULT 'PENDIENTE',
  aprobado_por         INT NULL COMMENT 'FK a usuarios — cajero que aprobó',
  aprobado_at          DATETIME NULL,
  observacion_cajero   TEXT NULL,
  pdf_url              VARCHAR(500) NULL COMMENT 'Path al PDF generado del recibo',
  whatsapp_enviado     TINYINT(1) NOT NULL DEFAULT 0,
  whatsapp_enviado_at  DATETIME NULL,
  fecha_emision        DATETIME NOT NULL COMMENT 'Fecha contable: now al emitir; now al cobrar posfechado',
  createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_recibos_numero_recibo (numero_recibo),
  UNIQUE KEY uk_recibos_prefijo_consecutivo (prefijo, consecutivo),
  UNIQUE KEY uk_recibos_afiliado (afiliado_id) COMMENT 'Garantiza 1:1 con afiliación (1 recibo por afiliación)',
  KEY idx_recibos_asesor_fecha (asesor_id, fecha_emision),
  KEY idx_recibos_estado_fecha (estado_cuadre, fecha_emision),
  CONSTRAINT fk_recibos_afiliado    FOREIGN KEY (afiliado_id)  REFERENCES afiliados (id) ON DELETE CASCADE,
  CONSTRAINT fk_recibos_asesor      FOREIGN KEY (asesor_id)    REFERENCES usuarios  (id) ON DELETE RESTRICT,
  CONSTRAINT fk_recibos_aprobador   FOREIGN KEY (aprobado_por) REFERENCES usuarios  (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Extender enum trazabilidad.tipo con nuevos tipos para recibos
ALTER TABLE trazabilidad
  MODIFY COLUMN tipo ENUM(
    'CONSULTA',
    'ACTUALIZACION_BENEFICIARIOS',
    'ACTUALIZACION_DATOS',
    'RECHAZO_PARCIAL',
    'APROBACION',
    'RECHAZO_TOTAL',
    'APROBACION_RECIBO',
    'COBRO_POSFECHADO'
  ) NOT NULL;

-- Verificación
SHOW CREATE TABLE recibos_caja;
SHOW CREATE TABLE consecutivos_recibo;
SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trazabilidad' AND COLUMN_NAME = 'tipo';
