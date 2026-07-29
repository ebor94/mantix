-- ============================================================
-- Migración: convenios empresariales parametrizables
-- BD: mantix / serfuweb
-- Fecha: 2026-07
-- ============================================================
--
-- FORMA RECOMENDADA DE APLICAR:
--     node src/scripts/apply-convenios.js
--
-- El runner de Node hace exactamente esto MÁS la siembra de los convenios
-- (src/seeds/convenios/*.json), tolera la re-ejecución y verifica el resultado.
-- Este archivo .sql existe para aplicación manual y como documentación del DDL;
-- ojo que los ALTER de abajo NO son idempotentes (MySQL no admite
-- ADD COLUMN IF NOT EXISTS en todas las versiones): si ya se corrieron, fallan
-- con ER_DUP_FIELDNAME / ER_DUP_KEYNAME y hay que saltearlos a mano.
--
-- ⚠️ ORDEN DE DESPLIEGUE: este SQL va ANTES de subir el código.
--    server.js corre sequelize.sync({ alter: false }), que crea tablas
--    faltantes pero NO altera columnas existentes. Si el modelo ya declara
--    origen con 'CONVENIO' y la columna sigue siendo el ENUM viejo, los INSERT
--    fallan por truncamiento de datos.
--
-- IMPACTO SOBRE LO EXISTENTE: ninguno.
--   · La tabla convenios es nueva.
--   · afiliados.convenioId es nullable y queda NULL en todas las filas.
--   · Agregar un valor AL FINAL de un ENUM no reescribe ni reinterpreta los
--     valores existentes ('ASESOR' y 'VEOLIA' conservan su significado).
--   · El ALTER de afiliados bloquea la tabla mientras corre → ventana de
--     mantenimiento.
-- ============================================================

-- ── 1. Tabla de convenios ────────────────────────────────────
-- Un convenio es un formulario público parametrizado por datos: reglas de
-- beneficiarios, defaults comerciales, marca y contacto viven en la fila.
-- Dar de alta otra empresa es un INSERT, no un despliegue.
--
-- Las cuatro columnas JSON están separadas porque cambian a ritmos distintos:
-- `reglas` es contrato de negocio que el servidor hace cumplir; `branding` y
-- `formulario` son presentación; `contacto` es integración.

CREATE TABLE IF NOT EXISTS convenios (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(60)  NOT NULL COMMENT 'Identificador de la URL pública /afiliados/convenio/:slug',
  nombre      VARCHAR(200) NOT NULL,
  nit         VARCHAR(20)  NULL DEFAULT NULL,
  empresaId   INT UNSIGNED NULL DEFAULT NULL,
  canal       ENUM('EMPRESARIAL','INDIVIDUAL','CENS') NULL DEFAULT NULL,
  producto    ENUM('VERDE','INTEGRAL','CENS')         NULL DEFAULT NULL,
  grupo       ENUM('UNIPERSONAL','UNIFAMILIAR','BASICO','CENS_II','INDIVIDUAL','TRADICIONAL') NULL DEFAULT NULL,
  planNombre  VARCHAR(120) NULL DEFAULT NULL,
  reglas      JSON         NOT NULL COMMENT 'Reglas de beneficiarios evaluadas por src/rules/convenioRules.js',
  branding    JSON         NULL DEFAULT NULL,
  formulario  JSON         NULL DEFAULT NULL,
  contacto    JSON         NULL DEFAULT NULL COMMENT 'No exponer completo en el endpoint público',
  activo      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0 = el endpoint público responde 404',
  createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_convenios_slug (slug),
  KEY idx_convenios_activo (activo),
  KEY idx_convenios_empresa (empresaId),
  CONSTRAINT fk_convenios_empresa FOREIGN KEY (empresaId)
    REFERENCES empresas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. Nuevo valor del ENUM origen ───────────────────────────
-- Un ÚNICO valor 'CONVENIO' para todos los convenios. El convenio concreto se
-- identifica con afiliados.convenioId, para no tener que hacer un ALTER de este
-- ENUM cada vez que se da de alta una empresa — que es justamente lo que el
-- requisito de parametrización busca evitar.

ALTER TABLE afiliados
  MODIFY COLUMN origen ENUM('ASESOR','VEOLIA','CONVENIO') NOT NULL DEFAULT 'ASESOR'
  COMMENT 'ASESOR = registrado por asesor; VEOLIA y CONVENIO = registro público sin sesión';

-- ── 3. FK del convenio en afiliados ──────────────────────────

ALTER TABLE afiliados
  ADD COLUMN convenioId INT UNSIGNED NULL DEFAULT NULL AFTER nombreEmpresa;

CREATE INDEX idx_afiliados_convenio ON afiliados (convenioId);

ALTER TABLE afiliados
  ADD CONSTRAINT fk_afiliados_convenio FOREIGN KEY (convenioId)
  REFERENCES convenios(id) ON DELETE SET NULL;

-- ── 4. Siembra de convenios ──────────────────────────────────
-- El contenido de las columnas JSON vive en src/seeds/convenios/*.json y lo
-- inserta el runner de Node. No se replica aquí a propósito: mantener a mano
-- un JSON de ~150 líneas dentro de un INSERT es una fuente garantizada de
-- divergencia con el archivo que además usan los tests.
--
--     node src/scripts/apply-convenios.js
--
-- Los convenios se siembran con activo = 0 y se publican después:
--     UPDATE convenios SET activo = 1 WHERE slug = 'conyca';

-- ── 5. Verificación ──────────────────────────────────────────

SHOW COLUMNS FROM afiliados LIKE 'convenioId';

SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'afiliados'
   AND COLUMN_NAME  = 'origen';

SELECT slug, nombre, nit, activo, JSON_VALID(reglas) AS reglas_ok
  FROM convenios
 ORDER BY slug;

-- Ninguna afiliación existente debe haber quedado tocada (esperado 0):
SELECT COUNT(*) AS afiliados_de_convenio
  FROM afiliados
 WHERE origen = 'CONVENIO' OR convenioId IS NOT NULL;
