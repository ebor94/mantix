-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — Seguimiento de exequias y confirmación de pago
--
-- Recepción hace un seguimiento antes de que el homenaje salga hacia las
-- exequias; el tramitador va a pagar y confirma el pago con la foto del
-- comprobante. El seguimiento no se cierra sin pago confirmado.
--
-- Las tablas nuevas llevan prefijo h360_ porque la base es compartida con el
-- core de Mantix.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. La exequia dice si requiere confirmación de pago ─────────────────────
-- Se marca al crear o al confirmar la exequia, que es cuando recepción sabe si
-- la parroquia o el cementerio exige el pago por adelantado. Con esto el
-- tramitador sabe qué le toca pagar sin esperar el seguimiento.
ALTER TABLE exequias
  ADD COLUMN requiere_confirmacion_pago TINYINT(1) NOT NULL DEFAULT 0
  AFTER lugar_destino_final;

-- ── 2. Seguimiento — una fila por exequia ──────────────────────────────────
-- Editable mientras esté ABIERTO. No es un log de llamadas: es la constancia
-- de la gestión, y la fecha/hora son las del último contacto registrado.
CREATE TABLE IF NOT EXISTS h360_exequia_seguimiento (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  exequia_id         INT UNSIGNED NOT NULL,
  usuario_id         VARCHAR(50)  NOT NULL,
  usuario_nombre     VARCHAR(150) NULL,
  fecha              DATE         NOT NULL,
  hora               TIME         NOT NULL,
  con_quien          VARCHAR(150) NOT NULL,
  gestion_realizada  TEXT         NOT NULL,
  gestiono_cita      TINYINT(1)   NOT NULL DEFAULT 0,
  gestiono_obituario TINYINT(1)   NOT NULL DEFAULT 0,
  estado             ENUM('ABIERTO','CERRADO') NOT NULL DEFAULT 'ABIERTO',
  cerrado_por        VARCHAR(50)  NULL,
  cerrado_nombre     VARCHAR(150) NULL,
  cerrado_at         TIMESTAMP    NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_seguimiento_exequia (exequia_id),
  KEY idx_seguimiento_estado (estado),
  CONSTRAINT fk_seguimiento_exequia FOREIGN KEY (exequia_id)
    REFERENCES exequias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 3. Pago — una fila por exequia; que exista significa confirmado ─────────
-- Tabla aparte del seguimiento porque la llena el tramitador y puede llegar
-- antes de que recepción abra el seguimiento. Así "pago confirmado" tiene un
-- solo origen y no hay dos verdades que sincronizar.
--
-- La foto va en MEDIUMTEXT como data URL, igual que la del F-08: el navegador
-- la reduce a 1024 px antes de enviarla. Si no hay foto, la nota es obligatoria
-- (lo valida el backend), para que nunca quede un pago confirmado sin respaldo.
CREATE TABLE IF NOT EXISTS h360_exequia_pago (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  exequia_id        INT UNSIGNED NOT NULL,
  foto              MEDIUMTEXT   NULL,
  nota              VARCHAR(300) NULL,
  confirmado_por    VARCHAR(50)  NOT NULL,
  confirmado_nombre VARCHAR(150) NULL,
  confirmado_rol    VARCHAR(30)  NULL,
  confirmado_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pago_exequia (exequia_id),
  CONSTRAINT fk_pago_exequia FOREIGN KEY (exequia_id)
    REFERENCES exequias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
