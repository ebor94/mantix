-- ================================================================
-- Migración: Módulo CYM — Mantenimiento de Predios Cementerio Los Olivos
-- Base de datos: serfuweb
-- Fecha: 2026-05-06
-- ================================================================

-- ----------------------------------------------------------------
-- 1. ROLES DEL MÓDULO CYM
-- ----------------------------------------------------------------
INSERT INTO roles (nombre, descripcion, permisos, activo) VALUES
  ('coordinador_cym',      'Coordinador de Mantenimiento CYM',  '{"cym":{"predios":true,"contratos":true,"asignaciones":true,"reportes":true}}', 1),
  ('supervisor_cym',       'Supervisor de Mantenimiento CYM',   '{"cym":{"mantenimientos":true,"reportes":true}}', 1),
  ('auxiliar_cartera_cym', 'Auxiliar de Cartera CYM',           '{"cym":{"cartera":true}}', 1),
  ('operario_cym',         'Operario de Mantenimiento CYM',     '{}', 1);

-- ----------------------------------------------------------------
-- 2. PREDIOS DEL CEMENTERIO
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cym_predios (
  id            INT          NOT NULL AUTO_INCREMENT,
  sector        VARCHAR(100) NOT NULL                   COMMENT 'Sector del cementerio',
  numero_lote   VARCHAR(50)  NOT NULL                   COMMENT 'Número de lote dentro del sector',
  acomodacion   ENUM('sencilla','doble','triple') NOT NULL COMMENT 'Tipo de acomodación del predio',
  sq_cedula     VARCHAR(20)  NULL                       COMMENT 'Cédula del ser querido',
  sq_nombre     VARCHAR(200) NULL                       COMMENT 'Nombre completo del ser querido',
  sq_fecha_nac  DATE         NULL                       COMMENT 'Fecha de nacimiento del ser querido',
  sq_fecha_fall DATE         NULL                       COMMENT 'Fecha de fallecimiento',
  sq_fecha_inhum DATE        NULL                       COMMENT 'Fecha de inhumación',
  activo_mant   TINYINT(1)   NOT NULL DEFAULT 1         COMMENT '1=activo para mantenimiento, 0=inactivo',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sector_lote (sector, numero_lote)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Predios del cementerio Los Olivos';

-- ----------------------------------------------------------------
-- 3. CONTRATOS DE MANTENIMIENTO
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cym_contratos (
  id                   INT          NOT NULL AUTO_INCREMENT,
  predio_id            INT          NOT NULL,
  contratante_cedula   VARCHAR(20)  NOT NULL             COMMENT 'Cédula del contratante',
  contratante_nombre   VARCHAR(200) NOT NULL             COMMENT 'Nombre completo del contratante',
  contratante_telefono VARCHAR(20)  NULL,
  contratante_correo   VARCHAR(150) NULL,
  contratante_dir      VARCHAR(300) NULL                 COMMENT 'Dirección del contratante',
  vigencia             ENUM('trimestral','semestral','anual','bianual') NOT NULL COMMENT 'Duración del contrato',
  fecha_contratacion   DATE         NOT NULL             COMMENT 'Fecha de inicio del contrato',
  fecha_vencimiento    DATE         NOT NULL             COMMENT 'Calculada: contratacion + meses según vigencia',
  estado               ENUM('activo','vencido','cerrado') NOT NULL DEFAULT 'activo',
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_predio (predio_id),
  KEY idx_estado (estado),
  KEY idx_vencimiento (fecha_vencimiento),
  CONSTRAINT fk_cont_predio FOREIGN KEY (predio_id) REFERENCES cym_predios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Contratos de mantenimiento por predio';

-- ----------------------------------------------------------------
-- 4. ASIGNACIONES DE PERSONAL
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cym_asignaciones (
  id             INT      NOT NULL AUTO_INCREMENT,
  predio_id      INT      NOT NULL,
  coordinador_id INT      NULL     COMMENT 'Usuario con rol coordinador_cym',
  supervisor_id  INT      NULL     COMMENT 'Usuario con rol supervisor_cym',
  operario_id    INT      NULL     COMMENT 'Usuario con rol operario_cym',
  aux_cartera_id INT      NULL     COMMENT 'Usuario con rol auxiliar_cartera_cym',
  activo         TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_predio_activo (predio_id, activo),
  CONSTRAINT fk_asig_predio     FOREIGN KEY (predio_id)      REFERENCES cym_predios  (id),
  CONSTRAINT fk_asig_coord      FOREIGN KEY (coordinador_id) REFERENCES usuarios      (id),
  CONSTRAINT fk_asig_supervisor FOREIGN KEY (supervisor_id)  REFERENCES usuarios      (id),
  CONSTRAINT fk_asig_operario   FOREIGN KEY (operario_id)    REFERENCES usuarios      (id),
  CONSTRAINT fk_asig_cartera    FOREIGN KEY (aux_cartera_id) REFERENCES usuarios      (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Asignación de personal a cada predio';

-- ----------------------------------------------------------------
-- 5. ACTIVIDADES DEL CHECKLIST (fijas)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cym_actividades (
  id          INT          NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(200) NOT NULL,
  descripcion VARCHAR(500) NULL,
  orden       INT          NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Actividades fijas del checklist de mantenimiento';

-- Actividades iniciales del checklist
INSERT INTO cym_actividades (nombre, descripcion, orden, activo) VALUES
  ('Limpieza de lápida',         'Limpiar y pulir la lápida del predio',                    1, 1),
  ('Retiro de maleza',           'Retirar maleza y plantas no deseadas del entorno del lote', 2, 1),
  ('Limpieza general del lote',  'Barrido y aseo general del área del predio',               3, 1),
  ('Revisión de estructuras',    'Verificar el estado de bordes, cruces y elementos físicos', 4, 1),
  ('Colocación de flores',       'Renovación de arreglo floral si aplica',                  5, 1),
  ('Aplicación de productos',    'Aplicar productos de limpieza o conservación especiales',  6, 1),
  ('Registro fotográfico',       'Tomar fotografías del estado final del predio',            7, 1);

-- ----------------------------------------------------------------
-- 6. REGISTROS DE MANTENIMIENTO
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cym_mantenimientos (
  id            INT      NOT NULL AUTO_INCREMENT,
  predio_id     INT      NOT NULL,
  contrato_id   INT      NOT NULL,
  supervisor_id INT      NOT NULL,
  operario_id   INT      NULL,
  fecha_mant    DATE     NOT NULL             COMMENT 'Fecha en que se realizó el mantenimiento',
  observaciones TEXT     NULL,
  estado        ENUM('borrador','completado') NOT NULL DEFAULT 'borrador',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mant_predio   (predio_id),
  KEY idx_mant_contrato (contrato_id),
  KEY idx_mant_supervisor (supervisor_id),
  CONSTRAINT fk_mant_predio     FOREIGN KEY (predio_id)     REFERENCES cym_predios     (id),
  CONSTRAINT fk_mant_contrato   FOREIGN KEY (contrato_id)   REFERENCES cym_contratos   (id),
  CONSTRAINT fk_mant_supervisor FOREIGN KEY (supervisor_id) REFERENCES usuarios         (id),
  CONSTRAINT fk_mant_operario   FOREIGN KEY (operario_id)   REFERENCES usuarios         (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Registros de mantenimiento realizados por predio';

-- ----------------------------------------------------------------
-- 7. CHECKLIST POR MANTENIMIENTO
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cym_checklist (
  id               INT          NOT NULL AUTO_INCREMENT,
  mantenimiento_id INT          NOT NULL,
  actividad_id     INT          NOT NULL,
  realizado        TINYINT(1)   NOT NULL DEFAULT 0,
  observacion      VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_chk_mant (mantenimiento_id),
  CONSTRAINT fk_chk_mant     FOREIGN KEY (mantenimiento_id) REFERENCES cym_mantenimientos (id),
  CONSTRAINT fk_chk_actividad FOREIGN KEY (actividad_id)    REFERENCES cym_actividades    (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Checklist de actividades por registro de mantenimiento';

-- ----------------------------------------------------------------
-- 8. EVIDENCIAS FOTOGRÁFICAS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cym_evidencias (
  id               INT          NOT NULL AUTO_INCREMENT,
  mantenimiento_id INT          NOT NULL,
  archivo_url      VARCHAR(500) NOT NULL  COMMENT 'Ruta relativa del archivo en uploads/cym/',
  descripcion      VARCHAR(300) NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ev_mant (mantenimiento_id),
  CONSTRAINT fk_ev_mant FOREIGN KEY (mantenimiento_id) REFERENCES cym_mantenimientos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Evidencias fotográficas de mantenimientos';

-- ----------------------------------------------------------------
-- 9. GESTIONES DE CARTERA
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cym_cartera (
  id            INT      NOT NULL AUTO_INCREMENT,
  contrato_id   INT      NOT NULL,
  usuario_id    INT      NOT NULL,
  tipo_gestion  ENUM('llamada','visita','email','whatsapp') NOT NULL,
  resultado     ENUM('contactado','no_contesto','promesa_pago','pago_realizado') NOT NULL,
  observacion   TEXT     NULL,
  fecha_gestion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cart_contrato (contrato_id),
  CONSTRAINT fk_cart_contrato FOREIGN KEY (contrato_id) REFERENCES cym_contratos (id),
  CONSTRAINT fk_cart_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios       (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Gestiones de cartera sobre contratos vencidos';

-- ----------------------------------------------------------------
-- Verificación
-- ----------------------------------------------------------------
SELECT TABLE_NAME, TABLE_COMMENT
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'serfuweb'
  AND TABLE_NAME LIKE 'cym_%'
ORDER BY TABLE_NAME;
