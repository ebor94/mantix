-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — Licencia de inhumación DANE (forma D631)
--
-- Se arma con los datos del ERP buscando por número de contrato, se revisa y
-- se corrige en pantalla, y lo que queda impreso se guarda aquí.
--
-- Se guarda el documento, no una referencia al ERP: la licencia se entrega al
-- cementerio y la ley obliga a conservarla, así que lo que importa es qué
-- decía el papel que se firmó, no qué dice el ERP hoy.
--
-- El número de la licencia (campo "No." del encabezado) no se guarda: va en
-- blanco y lo llenan a mano, que es como se usa el formato.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS h360_licencia_inhumacion (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contrato            VARCHAR(20)  NOT NULL,

  -- Encabezado
  exp_anio            CHAR(4)      NULL,
  exp_mes             CHAR(2)      NULL,
  exp_dia             CHAR(2)      NULL,
  departamento        VARCHAR(80)  NULL,
  municipio           VARCHAR(80)  NULL,
  inspeccion          VARCHAR(120) NULL,
  solicitante         VARCHAR(150) NULL,
  solicitante_nit     VARCHAR(40)  NULL,

  -- Fallecido
  primer_apellido     VARCHAR(80)  NULL,
  segundo_apellido    VARCHAR(80)  NULL,
  nombres             VARCHAR(120) NULL,
  -- 1 masculino · 2 femenino · 3 ignorado
  sexo_casilla        TINYINT      NULL,

  fall_anio           CHAR(4)      NULL,
  fall_mes            CHAR(2)      NULL,
  fall_dia            CHAR(2)      NULL,

  -- 1 natural · 2 violenta · 3 en estudio
  manera_muerte_casilla TINYINT    NULL,
  certificado_defuncion VARCHAR(30) NULL,

  -- 1 T.I. · 2 C.C. · 3 C.E. · 4 pasaporte · 5 N.I.P. · 9 sin información
  documento_casilla   TINYINT      NULL,
  documento_no        VARCHAR(30)  NULL,

  -- 1 horas · 2 días · 3 meses · 4 años cumplidos
  edad_casilla        TINYINT      NULL,
  edad_valor          VARCHAR(4)   NULL,

  permiso_inhumar_en  VARCHAR(200) NULL,

  generada_por        VARCHAR(50)  NOT NULL,
  generada_nombre     VARCHAR(150) NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Se consulta por contrato al abrir la pantalla. No es único: reimprimir una
  -- licencia corregida es legítimo y cada emisión queda registrada.
  KEY idx_licencia_contrato (contrato, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
