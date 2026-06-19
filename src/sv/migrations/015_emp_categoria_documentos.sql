-- ============================================================================
-- 015_emp_categoria_documentos.sql
-- Extiende el módulo Empresariales con:
--   1. Categoría de fidelización por empresa (Bronce/Plata/Oro/Platino/Diamante)
--      + presupuesto de fidelización editable por empresa
--   2. Documentos adjuntos (Cámara, RUT, Cédula, otros) con catálogo configurable
--   3. Propuestas adjuntas (archivos subidos, reemplaza generación PDF)
--   4. Libro mayor de movimientos de presupuesto fidelización
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ampliar sv_crm_empresas con categoría y presupuesto
-- ----------------------------------------------------------------------------
ALTER TABLE sv_crm_empresas
  ADD COLUMN empresa_categoria VARCHAR(20) NULL
    COMMENT 'BRONCE / PLATA / ORO / PLATINO / DIAMANTE',
  ADD COLUMN empresa_presupuesto_fideliz DECIMAL(15,2) NOT NULL DEFAULT 0
    COMMENT 'Presupuesto total asignado para fidelización (manual por empresa)',
  ADD COLUMN empresa_presupuesto_gastado DECIMAL(15,2) NOT NULL DEFAULT 0
    COMMENT 'Acumulado de envíos descontados del presupuesto';

CREATE INDEX idx_empresa_categoria ON sv_crm_empresas (empresa_categoria);

-- ----------------------------------------------------------------------------
-- 2. Catálogo de tipos de documento (configurable desde admin)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_cfg_tipos_documento (
  tipo_id          INT AUTO_INCREMENT PRIMARY KEY,
  tipo_codigo      VARCHAR(40) NOT NULL UNIQUE,
  tipo_nombre      VARCHAR(120) NOT NULL,
  tipo_descripcion VARCHAR(250),
  tipo_obligatorio TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = se espera que toda empresa tenga este documento',
  tipo_activo      TINYINT(1) NOT NULL DEFAULT 1,
  tipo_orden       INT DEFAULT 0,
  tipo_created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO sv_cfg_tipos_documento (tipo_codigo, tipo_nombre, tipo_descripcion, tipo_obligatorio, tipo_orden) VALUES
('CAMARA_COMERCIO', 'Cámara de Comercio',         'Certificado de existencia y representación legal',  1, 1),
('RUT',             'RUT',                        'Registro Único Tributario',                          1, 2),
('CEDULA_RL',       'Cédula Representante Legal', 'Copia de la cédula del representante legal',         1, 3),
('OTRO',            'Otro documento',             'Documento adicional requerido posteriormente',       0, 99);

-- ----------------------------------------------------------------------------
-- 3. Documentos adjuntos por empresa
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_empresa_documentos (
  doc_id            INT AUTO_INCREMENT PRIMARY KEY,
  doc_empresa_id    INT NOT NULL,
  doc_tipo_id       INT NOT NULL,
  doc_nombre        VARCHAR(200) NOT NULL
    COMMENT 'Nombre/título del documento (e.g. "Cámara 2025", "RUT actualizado")',
  doc_archivo_url   VARCHAR(255) NOT NULL
    COMMENT 'Ruta relativa en uploads/sv/empresas/...',
  doc_archivo_size  INT
    COMMENT 'Tamaño en bytes',
  doc_archivo_mime  VARCHAR(80),
  doc_observaciones TEXT,
  doc_subido_por    INT NOT NULL,
  doc_subido_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_empresa FOREIGN KEY (doc_empresa_id) REFERENCES sv_crm_empresas(empresa_id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_tipo    FOREIGN KEY (doc_tipo_id)    REFERENCES sv_cfg_tipos_documento(tipo_id),
  CONSTRAINT fk_doc_usuario FOREIGN KEY (doc_subido_por) REFERENCES sv_org_usuarios(usr_id),
  INDEX idx_doc_empresa (doc_empresa_id, doc_subido_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Propuestas adjuntas (reemplaza la generación PDF; ahora solo upload)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_empresa_propuestas (
  prop_id            INT AUTO_INCREMENT PRIMARY KEY,
  prop_empresa_id    INT NOT NULL,
  prop_titulo        VARCHAR(200) NOT NULL,
  prop_descripcion   TEXT,
  prop_tipo          VARCHAR(30) DEFAULT 'vinculacion'
    COMMENT 'vinculacion | renovacion | adendum | otro',
  prop_archivo_url   VARCHAR(255) NOT NULL,
  prop_archivo_size  INT,
  prop_archivo_mime  VARCHAR(80),
  prop_valor         DECIMAL(15,2),
  prop_vigencia_desde DATE,
  prop_vigencia_hasta DATE,
  prop_subido_por    INT NOT NULL,
  prop_subido_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prop_empresa FOREIGN KEY (prop_empresa_id) REFERENCES sv_crm_empresas(empresa_id) ON DELETE CASCADE,
  CONSTRAINT fk_prop_usuario FOREIGN KEY (prop_subido_por) REFERENCES sv_org_usuarios(usr_id),
  INDEX idx_prop_empresa (prop_empresa_id, prop_subido_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Libro mayor de presupuesto de fidelización por empresa
--    Trazabilidad de cada movimiento (asignación inicial, ajuste, consumo).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_fideliz_movimientos (
  mov_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  mov_empresa_id   INT NOT NULL,
  mov_envio_id     BIGINT NULL
    COMMENT 'FK opcional a sv_fideliz_envios cuando el movimiento es por consumo',
  mov_tipo         VARCHAR(20) NOT NULL
    COMMENT 'ASIGNACION (carga inicial) | AJUSTE (manual +/-) | CONSUMO (envío fideliz)',
  mov_monto        DECIMAL(15,2) NOT NULL
    COMMENT 'Positivo: aumenta presupuesto. Negativo: descuenta.',
  mov_descripcion  VARCHAR(250),
  mov_usuario_id   INT NOT NULL,
  mov_fecha        DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mov_empresa FOREIGN KEY (mov_empresa_id) REFERENCES sv_crm_empresas(empresa_id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_usuario FOREIGN KEY (mov_usuario_id) REFERENCES sv_org_usuarios(usr_id),
  INDEX idx_mov_empresa (mov_empresa_id, mov_fecha),
  INDEX idx_mov_envio (mov_envio_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Ampliar sv_fideliz_envios con costo opcional para descontar del presupuesto
-- ----------------------------------------------------------------------------
ALTER TABLE sv_fideliz_envios
  ADD COLUMN env_costo DECIMAL(15,2) NULL
    COMMENT 'Costo estimado del detalle/regalo enviado. Si está presente, se descuenta del presupuesto fidelización de la empresa';
