-- Esquema del módulo Agenda de Masajes (spec §7). Prefijo msj_, sin dependencias con tablas de otros módulos.
-- DATETIME en hora Colombia: el pool fija time_zone '-05:00' en cada conexión (spec §6.5).
-- Los índices UNIQUE tienen nombre explícito: el servicio de citas mapea el ER_DUP_ENTRY por ese nombre.
-- Los CHECK son una red de seguridad (MySQL >= 8.0.16; antes se aceptan y se ignoran): las reglas también
-- las aplica el código. Ver docs/masajes/verificarProduccion.sql.

CREATE TABLE IF NOT EXISTS msj_beneficiarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  cargo VARCHAR(150) NULL,
  celular VARCHAR(15) NULL COMMENT 'normalizado 573XXXXXXXXX',
  correo VARCHAR(150) NULL COMMENT 'NO único: hay buzones compartidos',
  ad_usuario VARCHAR(80) NULL COMMENT 'sAMAccountName en minúsculas; NULL hasta vincular',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(80) NULL,
  UNIQUE KEY uq_msj_beneficiarios_ad_usuario (ad_usuario),
  KEY idx_msj_beneficiarios_correo (correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS msj_semanas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha_inicio DATE NOT NULL COMMENT 'siempre lunes',
  estado ENUM('borrador','publicada','cerrada') NOT NULL DEFAULT 'borrador',
  capacidad_franja TINYINT UNSIGNED NOT NULL DEFAULT 1,
  notas VARCHAR(255) NULL,
  creado_por VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_msj_semanas_fecha_inicio (fecha_inicio),
  CONSTRAINT ck_msj_semanas_lunes CHECK (DAYOFWEEK(fecha_inicio) = 2),
  CONSTRAINT ck_msj_semanas_capacidad CHECK (capacidad_franja BETWEEN 1 AND 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS msj_bloqueos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  semana_id INT NOT NULL,
  inicio DATETIME NOT NULL,
  fin DATETIME NOT NULL,
  motivo ENUM('festivo','spa','otro') NOT NULL,
  detalle VARCHAR(255) NULL,
  creado_por VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_msj_bloqueos_semana_inicio (semana_id, inicio),
  CONSTRAINT fk_msj_bloqueos_semana FOREIGN KEY (semana_id) REFERENCES msj_semanas (id) ON DELETE RESTRICT,
  CONSTRAINT ck_msj_bloqueos_fin CHECK (fin > inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS msj_citas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  beneficiario_id INT NOT NULL,
  semana_id INT NOT NULL,
  inicio DATETIME NOT NULL,
  fin DATETIME NOT NULL,
  periodo CHAR(7) NOT NULL COMMENT 'YYYY-MM en hora Colombia',
  estado ENUM('agendada','cancelada','asistio','no_asistio') NOT NULL DEFAULT 'agendada',
  slot_key VARCHAR(40) NULL COMMENT '2026-11-12T09:00#1 mientras ocupa la franja; NULL al cancelar',
  cupo_key VARCHAR(40) NULL COMMENT '{beneficiarioId}:{periodo} mientras consume cupo; NULL al cancelar',
  google_event_id VARCHAR(255) NULL,
  motivo_cancelacion VARCHAR(255) NULL,
  creado_por VARCHAR(80) NOT NULL,
  actualizado_por VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_msj_citas_slot_key (slot_key),
  UNIQUE KEY uq_msj_citas_cupo_key (cupo_key),
  KEY idx_msj_citas_inicio_estado (inicio, estado),
  KEY idx_msj_citas_beneficiario (beneficiario_id, periodo),
  CONSTRAINT fk_msj_citas_beneficiario FOREIGN KEY (beneficiario_id) REFERENCES msj_beneficiarios (id) ON DELETE RESTRICT,
  CONSTRAINT fk_msj_citas_semana FOREIGN KEY (semana_id) REFERENCES msj_semanas (id) ON DELETE RESTRICT,
  -- Cancelada ⇔ no retiene franja ni cupo. Las demás (agendada, asistio, no_asistio) consumen ambos.
  CONSTRAINT ck_msj_citas_claves CHECK (
    (estado = 'cancelada' AND slot_key IS NULL AND cupo_key IS NULL)
    OR (estado <> 'cancelada' AND slot_key IS NOT NULL AND cupo_key IS NOT NULL)
  ),
  CONSTRAINT ck_msj_citas_fin CHECK (fin > inicio),
  CONSTRAINT ck_msj_citas_periodo CHECK (periodo REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Solo inserción: la aplicación nunca hace UPDATE ni DELETE aquí (permisos en docs/masajes/permisos-bd.sql).
CREATE TABLE IF NOT EXISTS msj_cita_historial (
  id INT AUTO_INCREMENT PRIMARY KEY,
  beneficiario_id INT NOT NULL,
  cita_id INT NULL COMMENT 'NULL solo en autovinculacion',
  accion ENUM('creada','reprogramada','cancelada','asistencia','autovinculacion') NOT NULL,
  inicio_anterior DATETIME NULL,
  inicio_nuevo DATETIME NULL,
  motivo VARCHAR(255) NULL,
  usuario VARCHAR(80) NOT NULL,
  es_admin TINYINT(1) NOT NULL DEFAULT 0,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_msj_historial_cita (cita_id),
  KEY idx_msj_historial_beneficiario (beneficiario_id, created_at),
  CONSTRAINT fk_msj_historial_beneficiario FOREIGN KEY (beneficiario_id) REFERENCES msj_beneficiarios (id) ON DELETE RESTRICT,
  CONSTRAINT fk_msj_historial_cita FOREIGN KEY (cita_id) REFERENCES msj_citas (id) ON DELETE RESTRICT,
  CONSTRAINT ck_msj_historial_cita CHECK (accion = 'autovinculacion' OR cita_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Outbox (spec §6.2): efectos externos con reintentos. La clave incluye el inicio, así una
-- reprogramación genera claves nuevas y la vieja se descarta.
CREATE TABLE IF NOT EXISTS msj_notificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cita_id INT NOT NULL,
  tipo ENUM('calendar_upsert','calendar_delete','spa_nueva','spa_reprogramada','spa_cancelada',
            'empleado_confirmacion','empleado_cancelacion','recordatorio_2d','es_hoy') NOT NULL,
  canal ENUM('google','email','sms') NOT NULL,
  clave VARCHAR(120) NOT NULL COMMENT '{citaId}:{tipo}:{canal}:{inicioISO}',
  estado ENUM('pendiente','enviado','fallido','descartado') NOT NULL DEFAULT 'pendiente',
  intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  proximo_intento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_error VARCHAR(1000) NULL COMMENT 'siempre pasado por redactar(): sin claves, tokens ni celulares',
  enviado_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_msj_notificaciones_clave (clave),
  KEY idx_msj_notificaciones_pendientes (estado, proximo_intento),
  KEY idx_msj_notificaciones_cita (cita_id),
  CONSTRAINT fk_msj_notificaciones_cita FOREIGN KEY (cita_id) REFERENCES msj_citas (id) ON DELETE RESTRICT,
  CONSTRAINT ck_msj_notificaciones_intentos CHECK (intentos <= 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
