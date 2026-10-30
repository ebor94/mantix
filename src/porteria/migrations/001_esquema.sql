-- Esquema del módulo Portería. sede_id, vehiculo_id, asistencia_id y exequia_id son FK lógicas
-- a tablas de H360 (sin restricción: Portería no depende de su esquema ni lo modifica).

CREATE TABLE IF NOT EXISTS por_motivos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  aplica_propio TINYINT(1) NOT NULL DEFAULT 0,
  aplica_proveedor_asistencia TINYINT(1) NOT NULL DEFAULT 0,
  aplica_proveedor TINYINT(1) NOT NULL DEFAULT 0,
  aplica_ingreso TINYINT(1) NOT NULL DEFAULT 1,
  aplica_salida TINYINT(1) NOT NULL DEFAULT 1,
  tipo_referencia ENUM('NINGUNA','ASISTENCIA','EXEQUIA','TEXTO') NOT NULL DEFAULT 'NINGUNA',
  referencia_obligatoria TINYINT(1) NOT NULL DEFAULT 0,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(100) NULL,
  UNIQUE KEY uq_por_motivos_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS por_vehiculos_externos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  placa VARCHAR(20) NOT NULL,
  tipo ENUM('PROVEEDOR_ASISTENCIA','PROVEEDOR') NOT NULL,
  empresa VARCHAR(150) NOT NULL,
  descripcion VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NOT NULL,
  updated_at DATETIME NULL,
  updated_by VARCHAR(100) NULL,
  UNIQUE KEY uq_por_vext_placa (placa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS por_eventos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sede_id INT NOT NULL,
  sentido ENUM('INGRESO','SALIDA') NOT NULL,
  tipo_vehiculo ENUM('PROPIO','PROVEEDOR_ASISTENCIA','PROVEEDOR') NOT NULL,
  placa VARCHAR(20) NOT NULL,
  vehiculo_id INT NULL,
  vehiculo_externo_id INT NULL,
  conductor_usuario VARCHAR(100) NULL,
  conductor_nombre VARCHAR(150) NOT NULL,
  conductor_documento VARCHAR(30) NULL,
  conductor_otro TINYINT(1) NOT NULL DEFAULT 0,
  empresa VARCHAR(150) NULL,
  motivo_id INT NOT NULL,
  asistencia_id INT NULL,
  exequia_id INT NULL,
  referencia_texto VARCHAR(255) NULL,
  referencia_snapshot JSON NULL,
  evento_par_id INT NULL,
  kilometraje INT NULL,
  observaciones VARCHAR(500) NULL,
  inconsistente TINYINT(1) NOT NULL DEFAULT 0,
  inconsistencia_tipo ENUM('INGRESO_ESTANDO_DENTRO','SALIDA_ESTANDO_FUERA') NULL,
  registrado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  registrado_por VARCHAR(100) NOT NULL,
  corregido_at DATETIME NULL,
  corregido_por VARCHAR(100) NULL,
  anulado TINYINT(1) NOT NULL DEFAULT 0,
  anulado_por VARCHAR(100) NULL,
  anulado_at DATETIME NULL,
  anulado_motivo VARCHAR(255) NULL,
  KEY ix_por_eventos_sede_fecha (sede_id, registrado_at),
  KEY ix_por_eventos_placa_fecha (placa, registrado_at),
  KEY ix_por_eventos_motivo (motivo_id),
  KEY ix_por_eventos_inconsistente (inconsistente),
  KEY ix_por_eventos_par (evento_par_id),
  CONSTRAINT fk_por_eventos_motivo FOREIGN KEY (motivo_id) REFERENCES por_motivos (id),
  CONSTRAINT fk_por_eventos_vext FOREIGN KEY (vehiculo_externo_id) REFERENCES por_vehiculos_externos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Estado actual: una fila por placa (no por sede). Tabla derivada de por_eventos; se actualiza en la
-- misma transacción que cada evento y se recalcula al anular.
CREATE TABLE IF NOT EXISTS por_estado_vehiculo (
  placa VARCHAR(20) NOT NULL PRIMARY KEY,
  tipo_vehiculo ENUM('PROPIO','PROVEEDOR_ASISTENCIA','PROVEEDOR') NOT NULL,
  sede_id INT NOT NULL,
  dentro TINYINT(1) NOT NULL,
  ultimo_evento_id INT NOT NULL,
  salida_abierta_id INT NULL,
  actualizado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_por_estado_sede_dentro (sede_id, dentro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS por_auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(100) NOT NULL,
  api_codigo VARCHAR(20) NULL,
  entidad VARCHAR(40) NOT NULL,
  entidad_id INT NOT NULL,
  accion ENUM('CREAR','CORREGIR','ANULAR','FORZAR') NOT NULL,
  antes JSON NULL,
  despues JSON NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_por_auditoria_entidad (entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
