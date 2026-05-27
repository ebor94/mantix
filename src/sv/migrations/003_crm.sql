-- =====================================================================
-- SerVentas CRM — Migración 003: CRM (sv_crm_*)
-- Target: MySQL 8 / serfuweb
-- Fase 1: personas, listas, prospectos, productos asociados, gestiones inmutables
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- sv_crm_personas — personas naturales (compartido entre áreas)
-- persona_telefono_norm = teléfono normalizado (UNIQUE) para anti-duplicados
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_personas (
  persona_id                 INT          AUTO_INCREMENT PRIMARY KEY,
  persona_nombre             VARCHAR(100) NOT NULL,
  persona_apellido           VARCHAR(100) NULL,
  persona_telefono_principal VARCHAR(20)  NOT NULL,
  persona_telefono_norm      VARCHAR(20)  NOT NULL UNIQUE,
  persona_telefono_alterno   VARCHAR(20)  NULL,
  persona_email              VARCHAR(150) NULL,
  persona_documento_tipo     VARCHAR(10)  NULL,
  persona_documento_num      VARCHAR(20)  NULL,
  persona_direccion          VARCHAR(250) NULL,
  persona_barrio             VARCHAR(100) NULL,
  persona_ciudad             VARCHAR(80)  DEFAULT 'Cucuta',
  persona_created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  persona_updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_persona_nombre (persona_nombre, persona_apellido),
  INDEX idx_persona_doc    (persona_documento_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: personas (UNIQUE telefono_norm, anti-duplicados)';

-- ---------------------------------------------------------------------
-- sv_crm_listas — listas masivas cargadas por CSV
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_listas (
  lista_id              INT          AUTO_INCREMENT PRIMARY KEY,
  lista_area_id         INT          NOT NULL,
  lista_grupo_id        INT          NULL,
  lista_fuente_id       INT          NULL,
  lista_cargada_por     INT          NOT NULL,
  lista_nombre          VARCHAR(150) NOT NULL,
  lista_total_registros INT          NOT NULL DEFAULT 0,
  lista_importadas      INT          NOT NULL DEFAULT 0,
  lista_duplicados_omit INT          NOT NULL DEFAULT 0,
  lista_errores         INT          NOT NULL DEFAULT 0,
  lista_estado          VARCHAR(20)  NOT NULL DEFAULT 'pendiente',  -- pendiente, procesando, completada, fallida
  lista_archivo_url     VARCHAR(255) NULL,
  lista_log             JSON         NULL,
  lista_fecha_carga     DATE         NOT NULL DEFAULT (CURRENT_DATE),
  lista_activa          TINYINT(1)   NOT NULL DEFAULT 1,
  lista_created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lista_area   FOREIGN KEY (lista_area_id)     REFERENCES sv_cfg_areas_negocio(area_id),
  CONSTRAINT fk_lista_grupo  FOREIGN KEY (lista_grupo_id)    REFERENCES sv_cfg_grupos_trabajo(grupo_id),
  CONSTRAINT fk_lista_fuente FOREIGN KEY (lista_fuente_id)   REFERENCES sv_cfg_fuentes_prospecto(fuente_id),
  CONSTRAINT fk_lista_user   FOREIGN KEY (lista_cargada_por) REFERENCES sv_org_usuarios(usr_id),
  INDEX idx_lista_area (lista_area_id, lista_fecha_carga)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: listas cargadas masivamente';

-- ---------------------------------------------------------------------
-- sv_crm_prospectos — corazón del CRM (ciclo de venta)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_prospectos (
  prosp_id                  INT          AUTO_INCREMENT PRIMARY KEY,
  prosp_area_id             INT          NOT NULL,
  prosp_grupo_id            INT          NOT NULL,
  prosp_persona_id          INT          NULL,
  prosp_empresa_id          INT          NULL,   -- FK se agrega en Fase 2 cuando exista sv_crm_empresas
  prosp_contacto_empresa_id INT          NULL,
  prosp_asesor_id           INT          NOT NULL,
  prosp_estado_id           INT          NOT NULL,
  prosp_fuente_id           INT          NULL,
  prosp_punto_id            INT          NULL,
  prosp_lista_id            INT          NULL,
  prosp_prox_gestion_fecha  DATE         NULL,
  prosp_prox_gestion_hora   TIME         NULL,
  prosp_prioridad           SMALLINT     NOT NULL DEFAULT 3,
  prosp_zona_pap            VARCHAR(100) NULL,
  prosp_nota_inicial        TEXT         NULL,
  prosp_activo              TINYINT(1)   NOT NULL DEFAULT 1,
  prosp_sap_contrato_id     VARCHAR(50)  NULL,
  prosp_created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prosp_updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prosp_area    FOREIGN KEY (prosp_area_id)    REFERENCES sv_cfg_areas_negocio(area_id),
  CONSTRAINT fk_prosp_grupo   FOREIGN KEY (prosp_grupo_id)   REFERENCES sv_cfg_grupos_trabajo(grupo_id),
  CONSTRAINT fk_prosp_persona FOREIGN KEY (prosp_persona_id) REFERENCES sv_crm_personas(persona_id),
  CONSTRAINT fk_prosp_contacto FOREIGN KEY (prosp_contacto_empresa_id) REFERENCES sv_crm_personas(persona_id),
  CONSTRAINT fk_prosp_asesor  FOREIGN KEY (prosp_asesor_id)  REFERENCES sv_org_usuarios(usr_id),
  CONSTRAINT fk_prosp_estado  FOREIGN KEY (prosp_estado_id)  REFERENCES sv_cfg_estados_gestion(estado_id),
  CONSTRAINT fk_prosp_fuente  FOREIGN KEY (prosp_fuente_id)  REFERENCES sv_cfg_fuentes_prospecto(fuente_id),
  CONSTRAINT fk_prosp_punto   FOREIGN KEY (prosp_punto_id)   REFERENCES sv_cfg_puntos_atencion(punto_id),
  CONSTRAINT fk_prosp_lista   FOREIGN KEY (prosp_lista_id)   REFERENCES sv_crm_listas(lista_id),
  CONSTRAINT chk_prosp_scope CHECK (
    (prosp_persona_id IS NOT NULL AND prosp_empresa_id IS NULL) OR
    (prosp_empresa_id IS NOT NULL)
  ),
  CONSTRAINT chk_prosp_prioridad CHECK (prosp_prioridad BETWEEN 1 AND 5),
  INDEX idx_prosp_asesor_fecha (prosp_asesor_id, prosp_prox_gestion_fecha),
  INDEX idx_prosp_area_estado  (prosp_area_id, prosp_estado_id, prosp_activo),
  INDEX idx_prosp_grupo_estado (prosp_grupo_id, prosp_estado_id, prosp_activo),
  INDEX idx_prosp_empresa      (prosp_empresa_id),
  INDEX idx_prosp_lista        (prosp_lista_id),
  INDEX idx_prosp_zona_pap     (prosp_zona_pap)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: prospectos (ciclo de venta) - corazón del CRM';

-- ---------------------------------------------------------------------
-- sv_crm_prospectos_productos — N:M prospectos↔productos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_prospectos_productos (
  pp_id           INT         AUTO_INCREMENT PRIMARY KEY,
  pp_prosp_id     INT         NOT NULL,
  pp_prod_id      INT         NOT NULL,
  pp_es_principal TINYINT(1)  NOT NULL DEFAULT 0,
  pp_nota         VARCHAR(200) NULL,
  pp_created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pp_prosp FOREIGN KEY (pp_prosp_id) REFERENCES sv_crm_prospectos(prosp_id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_prod  FOREIGN KEY (pp_prod_id)  REFERENCES sv_cfg_productos(prod_id),
  UNIQUE KEY uq_pp_prosp_prod (pp_prosp_id, pp_prod_id),
  INDEX idx_pp_prod (pp_prod_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: productos de interés por prospecto';

-- ---------------------------------------------------------------------
-- sv_crm_gestiones — registro INMUTABLE de cada contacto
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_gestiones (
  gest_id               BIGINT       AUTO_INCREMENT PRIMARY KEY,
  gest_prosp_id         INT          NOT NULL,
  gest_asesor_id        INT          NOT NULL,
  gest_resultado_id     INT          NULL,
  gest_estado_nuevo_id  INT          NULL,
  gest_canal            VARCHAR(20)  NOT NULL DEFAULT 'llamada',  -- llamada, presencial, correo
  gest_comentario       TEXT         NULL,
  gest_fecha_hora       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  gest_duracion_seg     INT          NULL,
  gest_prox_fecha       DATE         NULL,
  gest_prox_hora        TIME         NULL,
  gest_recordatorio_env TINYINT(1)   NOT NULL DEFAULT 0,
  gest_ubicacion_lat    DECIMAL(10,8) NULL,
  gest_ubicacion_lng    DECIMAL(11,8) NULL,
  gest_created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gest_prosp    FOREIGN KEY (gest_prosp_id)        REFERENCES sv_crm_prospectos(prosp_id),
  CONSTRAINT fk_gest_asesor   FOREIGN KEY (gest_asesor_id)       REFERENCES sv_org_usuarios(usr_id),
  CONSTRAINT fk_gest_resultado FOREIGN KEY (gest_resultado_id)   REFERENCES sv_cfg_resultados_gestion(resultado_id),
  CONSTRAINT fk_gest_estado_nuevo FOREIGN KEY (gest_estado_nuevo_id) REFERENCES sv_cfg_estados_gestion(estado_id),
  INDEX idx_gest_prosp_fecha  (gest_prosp_id, gest_fecha_hora),
  INDEX idx_gest_asesor_fecha (gest_asesor_id, gest_fecha_hora),
  INDEX idx_gest_resultado    (gest_resultado_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: gestiones INMUTABLES (nunca UPDATE/DELETE)';

-- ---------------------------------------------------------------------
-- sv_rpt_snapshot_diario — captura diaria de KPIs por asesor
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_rpt_snapshot_diario (
  snap_id                   BIGINT       AUTO_INCREMENT PRIMARY KEY,
  snap_usuario_id           INT          NOT NULL,
  snap_area_id              INT          NOT NULL,
  snap_grupo_id             INT          NOT NULL,
  snap_fecha                DATE         NOT NULL,
  snap_gestiones_realizadas INT          NOT NULL DEFAULT 0,
  snap_interesados_nuevos   INT          NOT NULL DEFAULT 0,
  snap_contratos_cerrados   INT          NOT NULL DEFAULT 0,
  snap_vencidas_acumuladas  INT          NOT NULL DEFAULT 0,
  snap_valor_vendido_cop    DECIMAL(14,2) NOT NULL DEFAULT 0,
  snap_created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  snap_updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_snap_usuario FOREIGN KEY (snap_usuario_id) REFERENCES sv_org_usuarios(usr_id),
  CONSTRAINT fk_snap_area    FOREIGN KEY (snap_area_id)    REFERENCES sv_cfg_areas_negocio(area_id),
  CONSTRAINT fk_snap_grupo   FOREIGN KEY (snap_grupo_id)   REFERENCES sv_cfg_grupos_trabajo(grupo_id),
  UNIQUE KEY uq_snap_usuario_fecha (snap_usuario_id, snap_fecha),
  INDEX idx_snap_area_fecha (snap_area_id, snap_grupo_id, snap_fecha),
  INDEX idx_snap_fecha      (snap_fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: snapshot diario de KPIs (cron 23:55 + logout)';

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- Verificación
SELECT 'Personas'   AS tabla, COUNT(*) AS registros FROM sv_crm_personas
UNION ALL SELECT 'Listas',     COUNT(*) FROM sv_crm_listas
UNION ALL SELECT 'Prospectos', COUNT(*) FROM sv_crm_prospectos
UNION ALL SELECT 'ProspProd',  COUNT(*) FROM sv_crm_prospectos_productos
UNION ALL SELECT 'Gestiones',  COUNT(*) FROM sv_crm_gestiones
UNION ALL SELECT 'SnapshotDiario', COUNT(*) FROM sv_rpt_snapshot_diario;
