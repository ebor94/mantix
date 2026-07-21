-- ─────────────────────────────────────────────────────────────────────────────
-- Migración H360: nueva etapa F-06 + tablas cofres/cofre_usos
--
-- 1. Expande ENUM asistencia_etapas.etapa con F06_ENCOFRADO
-- 2. Crea tabla `cofres` (catálogo de consecutivos)
-- 3. Crea tabla `cofre_usos` (histórico de asignaciones a asistencias)
--
-- Sin migración de datos (tablas nuevas + expansión ENUM que no altera valores existentes).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expandir ENUM asistencia_etapas.etapa ────────────────────────────────
ALTER TABLE asistencia_etapas MODIFY COLUMN etapa
  ENUM('F02_INVENTARIO_CUERPO','F03_INVENTARIO_RETOQUE','F04_TANATOPRAXIA','F05_ENTREGA','F06_ENCOFRADO')
  NOT NULL;

-- ── 2. Tabla cofres (catálogo de consecutivos, acumula usos) ────────────────
CREATE TABLE IF NOT EXISTS cofres (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  consecutivo    VARCHAR(30) NOT NULL UNIQUE,
  ultimo_tipo    ENUM('INHUMACION','CREMACION') NULL,
  veces_usado    INT NOT NULL DEFAULT 0,
  primer_uso_at  TIMESTAMP NULL,
  ultimo_uso_at  TIMESTAMP NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── 3. Tabla cofre_usos (histórico) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cofre_usos (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  cofre_id       INT NOT NULL,
  asistencia_id  INT NOT NULL,
  tipo           ENUM('INHUMACION','CREMACION') NOT NULL,
  observaciones  TEXT NULL,
  usuario_id     VARCHAR(50) NULL,
  fecha_uso      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cofre_id) REFERENCES cofres(id) ON DELETE CASCADE,
  INDEX idx_asistencia (asistencia_id),
  INDEX idx_cofre (cofre_id)
);

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='asistencia_etapas' AND COLUMN_NAME='etapa';

SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cofres','cofre_usos');
