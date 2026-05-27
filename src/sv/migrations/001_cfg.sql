-- =====================================================================
-- SerVentas CRM — Migración 001: Catálogos parametrizables (sv_cfg_*)
-- Target: MySQL 8 / serfuweb
-- Idempotente: usa CREATE TABLE IF NOT EXISTS
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- sv_cfg_areas_negocio
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_cfg_areas_negocio (
  area_id            INT          AUTO_INCREMENT PRIMARY KEY,
  area_codigo        VARCHAR(20)  NOT NULL UNIQUE,
  area_nombre        VARCHAR(100) NOT NULL,
  area_descripcion   TEXT         NULL,
  area_color_hex     CHAR(7)      NULL,
  area_icono         VARCHAR(50)  NULL,
  area_tipo_cliente  VARCHAR(20)  NOT NULL DEFAULT 'individual',
  area_activa        TINYINT(1)   NOT NULL DEFAULT 1,
  area_created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  area_updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: unidades de negocio (parametrizable sin codigo)';

-- ---------------------------------------------------------------------
-- sv_cfg_puntos_atencion
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_cfg_puntos_atencion (
  punto_id        INT          AUTO_INCREMENT PRIMARY KEY,
  punto_codigo    VARCHAR(20)  NOT NULL UNIQUE,
  punto_nombre    VARCHAR(100) NOT NULL,
  punto_direccion VARCHAR(200) NULL,
  punto_ciudad    VARCHAR(80)  NOT NULL DEFAULT 'Cucuta',
  punto_telefono  VARCHAR(20)  NULL,
  punto_activo    TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: sedes Gran Colombia, Los Olivos, San Jose, Torcoroma';

-- ---------------------------------------------------------------------
-- sv_cfg_grupos_trabajo
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_cfg_grupos_trabajo (
  grupo_id           INT          AUTO_INCREMENT PRIMARY KEY,
  grupo_area_id      INT          NOT NULL,
  grupo_codigo       VARCHAR(30)  NOT NULL UNIQUE,
  grupo_nombre       VARCHAR(100) NOT NULL,
  grupo_tipo_venta   VARCHAR(20)  NOT NULL DEFAULT 'individual',
  grupo_meta_default INT          NOT NULL DEFAULT 0,
  grupo_activo       TINYINT(1)   NOT NULL DEFAULT 1,
  grupo_created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_grupo_area FOREIGN KEY (grupo_area_id) REFERENCES sv_cfg_areas_negocio(area_id),
  INDEX idx_grupo_area (grupo_area_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: grupos de trabajo por area';

-- ---------------------------------------------------------------------
-- sv_cfg_productos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_cfg_productos (
  prod_id               INT           AUTO_INCREMENT PRIMARY KEY,
  prod_area_id          INT           NOT NULL,
  prod_codigo           VARCHAR(30)   NOT NULL UNIQUE,
  prod_nombre           VARCHAR(120)  NOT NULL,
  prod_descripcion      TEXT          NULL,
  prod_categoria        VARCHAR(50)   NULL,
  prod_precio_base      DECIMAL(12,2) NULL,
  prod_requiere_empresa TINYINT(1)    NOT NULL DEFAULT 0,
  prod_activo           TINYINT(1)    NOT NULL DEFAULT 1,
  prod_orden_display    SMALLINT      NOT NULL DEFAULT 0,
  prod_created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_area FOREIGN KEY (prod_area_id) REFERENCES sv_cfg_areas_negocio(area_id),
  INDEX idx_prod_area (prod_area_id, prod_activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: catalogo de productos por area';

-- ---------------------------------------------------------------------
-- sv_cfg_estados_gestion
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_cfg_estados_gestion (
  estado_id             INT          AUTO_INCREMENT PRIMARY KEY,
  estado_grupo_id       INT          NOT NULL,
  estado_codigo         VARCHAR(30)  NOT NULL,
  estado_nombre         VARCHAR(80)  NOT NULL,
  estado_color_hex      CHAR(7)      NULL,
  estado_es_final       TINYINT(1)   NOT NULL DEFAULT 0,
  estado_es_ganado      TINYINT(1)   NOT NULL DEFAULT 0,
  estado_requiere_fecha TINYINT(1)   NOT NULL DEFAULT 0,
  estado_orden          SMALLINT     NOT NULL DEFAULT 0,
  estado_activo         TINYINT(1)   NOT NULL DEFAULT 1,
  CONSTRAINT fk_estado_grupo FOREIGN KEY (estado_grupo_id) REFERENCES sv_cfg_grupos_trabajo(grupo_id),
  UNIQUE KEY uq_estado_grupo_codigo (estado_grupo_id, estado_codigo),
  INDEX idx_estado_grupo_orden (estado_grupo_id, estado_orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: estados del pipeline por grupo';

-- ---------------------------------------------------------------------
-- sv_cfg_resultados_gestion
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_cfg_resultados_gestion (
  resultado_id             INT          AUTO_INCREMENT PRIMARY KEY,
  resultado_grupo_id       INT          NOT NULL,
  resultado_codigo         VARCHAR(30)  NOT NULL,
  resultado_nombre         VARCHAR(80)  NOT NULL,
  resultado_icono          VARCHAR(10)  NULL,
  resultado_es_positivo    TINYINT(1)   NOT NULL DEFAULT 1,
  resultado_requiere_fecha TINYINT(1)   NOT NULL DEFAULT 0,
  resultado_orden          SMALLINT     NOT NULL DEFAULT 0,
  resultado_activo         TINYINT(1)   NOT NULL DEFAULT 1,
  CONSTRAINT fk_resultado_grupo FOREIGN KEY (resultado_grupo_id) REFERENCES sv_cfg_grupos_trabajo(grupo_id),
  UNIQUE KEY uq_resultado_grupo_codigo (resultado_grupo_id, resultado_codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: opciones de resultado en formulario de gestion';

-- ---------------------------------------------------------------------
-- sv_cfg_fuentes_prospecto
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_cfg_fuentes_prospecto (
  fuente_id        INT         AUTO_INCREMENT PRIMARY KEY,
  fuente_area_id   INT         NOT NULL,
  fuente_codigo    VARCHAR(30) NOT NULL,
  fuente_nombre    VARCHAR(80) NOT NULL,
  fuente_es_masiva TINYINT(1)  NOT NULL DEFAULT 0,
  fuente_activa    TINYINT(1)  NOT NULL DEFAULT 1,
  fuente_orden     SMALLINT    NOT NULL DEFAULT 0,
  CONSTRAINT fk_fuente_area FOREIGN KEY (fuente_area_id) REFERENCES sv_cfg_areas_negocio(area_id),
  UNIQUE KEY uq_fuente_area_codigo (fuente_area_id, fuente_codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: origenes de prospectos por area';

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;
