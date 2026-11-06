-- R-56 Acompañamiento y apoyo al duelo. Diseño en
-- docs/posexequiales/R-56-acompanamiento-duelo-diseno.md
--
-- Prefijo h360_ obligatorio: serfuweb es compartida con el core de Mantix.
-- Nada del ERP se copia acá; el contrato se lee en vivo de Karingsoft.

CREATE TABLE h360_duelo_gestion (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  orden_servicio        VARCHAR(20)  NOT NULL
                          COMMENT 'Contrato en Karingsoft. Es el vínculo entre los dos sistemas',
  asistencia_id         INT UNSIGNED NULL
                          COMMENT 'Caso en H360 cuando existe: nulo en el 46% de las órdenes',
  ubicacion_tipo        ENUM('SALA','RESIDENCIA','OTRA_CIUDAD','EXTERNA','OTRO') NOT NULL,
  ubicacion_detalle     VARCHAR(120) NULL
                          COMMENT 'Sala y sede desde H360; texto libre solo cuando no hay forma',
  es_mascota            TINYINT(1)   NOT NULL DEFAULT 0,
  titular_nombre        VARCHAR(160) NULL COMMENT 'Con quién se habló',
  titular_parentesco    VARCHAR(40)  NULL,
  telefonos             VARCHAR(120) NULL COMMENT 'El o los que realmente sirvieron',
  tipificacion          ENUM('OFRECIDO_EN_HOMENAJE','ATENCION_EN_HOMENAJE',
                             'OFRECIDO_POR_LLAMADA','ATENCION_POR_LLAMADA',
                             'OFRECIDO_POR_MENSAJE','COORDINA_ASISTENCIA',
                             'NO_CONTESTO','REPETIDO') NULL
                          COMMENT 'Vocabulario del R-56, para el informe',
  estado                ENUM('PENDIENTE','EN_GESTION','GESTIONADA','NO_LOGRADA',
                             'NO_APLICA','REPETIDA') NOT NULL DEFAULT 'PENDIENTE'
                          COMMENT 'Lo que mueve la bandeja. No es la tipificación',
  observaciones         TEXT         NULL,
  psicologa             VARCHAR(50)  NOT NULL COMMENT 'sAMAccountName, sale del login',
  psicologa_acompanante VARCHAR(50)  NULL COMMENT 'Cuando atienden las dos',
  cerrada_at            DATETIME     NULL,
  created_by            VARCHAR(50)  NOT NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_orden (orden_servicio),
  KEY idx_estado (estado),
  KEY idx_asistencia (asistencia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Los intentos llegan a 17 en el Excel, con mediana 1 y 469 casos por encima
-- de 3. Un contador y un campo de texto no alcanzan.
CREATE TABLE h360_duelo_intentos (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  gestion_id  INT UNSIGNED NOT NULL,
  momento     DATETIME     NOT NULL COMMENT 'Reemplaza la hora escrita dentro de la observación',
  canal       ENUM('VISITA_SALA','VISITA_RESIDENCIA','LLAMADA','MENSAJE','WHATSAPP') NOT NULL,
  resultado   ENUM('CONTACTADO','NO_CONTESTO','NUMERO_ERRADO','NO_DISPONIBLE','RECHAZA') NOT NULL,
  observacion TEXT         NULL,
  usuario     VARCHAR(50)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gestion (gestion_id, momento),
  CONSTRAINT fk_intento_gestion FOREIGN KEY (gestion_id)
    REFERENCES h360_duelo_gestion (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE h360_duelo_servicios (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  gestion_id  INT UNSIGNED NOT NULL,
  servicio    ENUM('CARTILLA_RENACER','CONFERENCIA_RENACER','MISA_DE_MES',
                   'TALLER_NINOS','GRUPO_APOYO_HIJOS','TALLER_JOVENES') NOT NULL,
  estado      ENUM('ACEPTA','NO_DESEA','NO_APLICA',
                   'OFRECIDO_SIN_RESPUESTA','FUERA_DE_CIUDAD','DESISTE') NOT NULL,
  modalidad   ENUM('PRESENCIAL','VIRTUAL','MENSAJE') NULL COMMENT 'El SI / SIV del Excel',
  detalle     VARCHAR(60)  NULL COMMENT 'Religión, solo en misa de mes',
  observacion VARCHAR(255) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_gestion_servicio (gestion_id, servicio),
  CONSTRAINT fk_servicio_gestion FOREIGN KEY (gestion_id)
    REFERENCES h360_duelo_gestion (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dato de salud de un tercero. Tabla aparte para que el permiso sea a nivel de
-- tabla y para poder excluirla de consultas generales sin acordarse de filtrar
-- columnas. Ley 1581 de 2012: dato sensible.
CREATE TABLE h360_duelo_atenciones (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  gestion_id          INT UNSIGNED NOT NULL,
  momento             DATETIME     NOT NULL,
  modalidad           ENUM('PRESENCIAL','TELEFONICA','VIRTUAL') NOT NULL,
  psicologa           VARCHAR(50)  NOT NULL,
  acompanante         VARCHAR(50)  NULL,
  atendido_nombre     VARCHAR(160) NULL,
  atendido_parentesco VARCHAR(40)  NULL,
  motivo              VARCHAR(200) NULL COMMENT 'Una línea',
  notas               TEXT         NULL COMMENT 'CONTENIDO CLINICO. Acceso restringido a rol psicologia',
  created_by          VARCHAR(50)  NOT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gestion (gestion_id, momento),
  CONSTRAINT fk_atencion_gestion FOREIGN KEY (gestion_id)
    REFERENCES h360_duelo_gestion (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
