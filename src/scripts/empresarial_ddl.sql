-- Canal empresarial — DDL (correr en producción; revisar contra los field: de los modelos)
ALTER TABLE empresas
  ADD COLUMN rango_afiliados ENUM('R7','R15') NULL,
  ADD COLUMN vigencia_inicio DATE NULL,
  ADD COLUMN vigencia_cierre DATE NULL;

CREATE TABLE empresa_planes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT UNSIGNED NOT NULL,
  plan_tipo ENUM('UNIPERSONAL','BASICO','UNIFAMILIAR') NOT NULL,
  valor_mensual DECIMAL(12,2) NOT NULL DEFAULT 0,
  reglas JSON NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_empresa_plan (empresa_id, plan_tipo),
  CONSTRAINT fk_empresa_planes_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE TABLE empresarial_parametros (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  anio SMALLINT NOT NULL,
  valor_adicional_menor50 DECIMAL(12,2) NOT NULL DEFAULT 0,
  valor_adicional_mayor50 DECIMAL(12,2) NOT NULL DEFAULT 0,
  valor_asistencia DECIMAL(12,2) NOT NULL DEFAULT 0,
  precios_estandar JSON NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_anio (anio)
);
