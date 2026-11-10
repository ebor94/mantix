-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — Seguimiento y control de desinfecciones del parque automotor
--
-- Reemplaza la hoja de cálculo «desinfecciones» (pestaña VEHICULOS), donde se
-- llevaba a mano qué le toca a cada vehículo y cuándo. Es un módulo aparte del
-- flujo de asistencias: acá no se registra la desinfección del traslado de un
-- caso puntual (eso es el F-08), sino el mantenimiento sanitario periódico de
-- los vehículos como activos de la empresa.
--
-- Tres decisiones del modelo que vale la pena dejar escritas, porque las tres
-- salieron de mirar los datos reales de la hoja y no son obvias:
--
-- 1. La periodicidad va en el par actividad × tipo de vehículo, no en la
--    actividad. Hoy cada actividad aplica a un solo tipo o con la misma
--    periodicidad en los dos, pero la hoja se lleva a mano y eso cambia; con
--    la periodicidad dentro de la actividad, el día que una pida ritmos
--    distintos por tipo habría que duplicar la actividad y el catálogo
--    empezaría a mentir. Por eso existe h360_desinf_regla.
--
--    OJO con el choque: «choque» (15 días, traslado) y «choque-choque»
--    (30 días, carroza) son DOS actividades distintas, no una con dos ritmos.
--    La primera versión de este archivo lo modeló como una sola y estaba mal;
--    lo corrige h360_desinfecciones_carga_hoja.sql para las bases que ya
--    corrieron esa versión.
--
-- 2. La fecha próxima se PROGRAMA, no se calcula. En la hoja, las próximas
--    limpiezas caen 12, 13, 14, 15, 16 y 21 de noviembre: un vehículo por día,
--    repartidos a propósito para no lavar seis carrozas el mismo día. Una de
--    ellas queda a 31 días de la anterior para una actividad de 15. No es un
--    error: es cómo trabajan. La periodicidad es el techo con el que se avisa,
--    y la fecha programada es un dato editable.
--
-- 3. El registro es historia y no se sobreescribe. Esto reemplaza un talonario
--    físico que es evidencia sanitaria; si mañana auditan, lo que se muestra es
--    el registro. La programación es el estado de hoy y cambia todo el tiempo;
--    el registro, nunca.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Catálogo de actividades ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS h360_desinf_actividad (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(80)  NOT NULL,
  descripcion VARCHAR(300) NULL COMMENT 'Qué hay que hacer, para que quien reciba el aviso no tenga que preguntar',
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_desinf_actividad_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── La matriz: qué actividad le aplica a qué tipo, cada cuánto y cómo se
--    registra ─────────────────────────────────────────────────────────────
--
-- tipo_vehiculo reusa los valores del enum de `vehiculos`: la hoja dice
-- «NECRO(traslado)» y «CARROZAS», que son TRASLADO y CARROZA acá.
--
-- tipo_registro es la diferencia operativa que pidió el negocio:
--   EVIDENCIA       → la ejecuta el operario y exige foto y observaciones.
--   ORDEN_SERVICIO  → se confirma con el número del talonario físico, porque
--                     la hace un tercero (el lavadero) y lo que queda como
--                     prueba es su orden de servicio.
CREATE TABLE IF NOT EXISTS h360_desinf_regla (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actividad_id      INT UNSIGNED NOT NULL,
  tipo_vehiculo     ENUM('CARROZA','TRASLADO','OTRO') NOT NULL,
  periodicidad_dias SMALLINT UNSIGNED NOT NULL COMMENT 'Techo, no cálculo: ver nota 2 de la cabecera',
  tipo_registro     ENUM('EVIDENCIA','ORDEN_SERVICIO') NOT NULL,
  activo            TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Una sola regla por actividad y tipo. Es lo que impide que «choque» quede
  -- con dos periodicidades distintas para carroza y nadie sepa cuál rige.
  UNIQUE KEY uk_desinf_regla (actividad_id, tipo_vehiculo),
  CONSTRAINT fk_desinf_regla_actividad
    FOREIGN KEY (actividad_id) REFERENCES h360_desinf_actividad(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── El tablero: una fila por vehículo y regla ──────────────────────────────
--
-- estado existe porque en la hoja las celdas de fecha traen estados y no
-- fechas: «N/A», «PEND», «ESTABA NO OPERATIVA», «REALIZA OLIVOS». Una fecha
-- anulable no distingue «todavía no se programó» de «a este vehículo no le
-- aplica», y son dos cosas distintas para el aviso diario.
--
-- fecha_ult y ultimo_registro_id son copia de lo último ejecutado, que se
-- puede derivar de h360_desinf_registro. Se guardan de todas formas para que
-- el tablero sea una consulta plana: es la pantalla que más se va a abrir.
CREATE TABLE IF NOT EXISTS h360_desinf_programacion (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vehiculo_id       INT UNSIGNED NOT NULL,
  regla_id          INT UNSIGNED NOT NULL,
  estado            ENUM('PENDIENTE','PROGRAMADA','VENCIDA','NO_APLICA') NOT NULL DEFAULT 'PENDIENTE',
  fecha_prox        DATE         NULL COMMENT 'La fecha planeada, editable. NULL mientras esté PENDIENTE',
  fecha_ult         DATE         NULL COMMENT 'Copia de la última ejecución, para el tablero',
  ultimo_registro_id INT UNSIGNED NULL,
  -- Por qué no aplica, o por qué está donde está. En la hoja esto vivía dentro
  -- de la celda de la fecha («REALIZA OLIVOS»), que es justo lo que se quiere
  -- dejar de hacer.
  observaciones     VARCHAR(300) NULL,
  programada_por    VARCHAR(50)  NULL,
  programada_at     TIMESTAMP    NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_desinf_prog (vehiculo_id, regla_id),
  -- El job diario barre por fecha y estado; el tablero, por vehículo.
  KEY idx_desinf_prog_vence (estado, fecha_prox),
  CONSTRAINT fk_desinf_prog_vehiculo
    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE CASCADE,
  CONSTRAINT fk_desinf_prog_regla
    FOREIGN KEY (regla_id) REFERENCES h360_desinf_regla(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── El registro de ejecución: historia, no estado ──────────────────────────
--
-- Guarda el tipo de registro y la periodicidad que regían en el momento, no un
-- apuntador a la regla vigente. Si mañana cambian «choque» de 15 a 20 días, lo
-- que se ejecutó hace tres meses se cumplió contra 15 y así tiene que leerse
-- en una auditoría. Es la misma razón por la que el R-34 guarda el documento y
-- no una referencia al ERP.
CREATE TABLE IF NOT EXISTS h360_desinf_registro (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vehiculo_id       INT UNSIGNED NOT NULL,
  regla_id          INT UNSIGNED NULL COMMENT 'NULL si la regla se borró: el registro sobrevive',
  actividad_nombre  VARCHAR(80)  NOT NULL COMMENT 'Copia: la actividad puede renombrarse',
  tipo_registro     ENUM('EVIDENCIA','ORDEN_SERVICIO') NOT NULL,
  periodicidad_dias SMALLINT UNSIGNED NULL COMMENT 'La que regía al ejecutar',
  fecha_ejecucion   DATE         NOT NULL,
  -- El código del talonario físico. Obligatorio por aplicación cuando
  -- tipo_registro = ORDEN_SERVICIO, no por la base: el talonario tiene
  -- formatos viejos y no se puede encerrar en un patrón.
  orden_servicio    VARCHAR(40)  NULL,
  observaciones     TEXT         NULL,
  -- Cuándo tocaba, para poder medir cumplimiento sin recalcular el pasado.
  fecha_programada  DATE         NULL,
  dias_atraso       SMALLINT     NULL COMMENT 'Negativo = se hizo antes de la fecha',
  registrado_por    VARCHAR(50)  NOT NULL,
  registrado_nombre VARCHAR(150) NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_desinf_reg_vehiculo (vehiculo_id, fecha_ejecucion),
  KEY idx_desinf_reg_fecha (fecha_ejecucion),
  -- RESTRICT y no CASCADE: es el único sitio donde queda la historia sanitaria
  -- del vehículo, y borrarla con el vehículo deja a la empresa sin la evidencia
  -- que reemplazó al talonario. Un vehículo que se va de la flota se inactiva,
  -- que es lo que el controlador ya exige cuando tiene exequias asociadas.
  CONSTRAINT fk_desinf_reg_vehiculo
    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_desinf_reg_regla
    FOREIGN KEY (regla_id) REFERENCES h360_desinf_regla(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Evidencia fotográfica ──────────────────────────────────────────────────
--
-- Varias por registro: una desinfección se fotografía por partes.
--
-- En la base va la ruta relativa, nunca la absoluta ni el archivo: el binario
-- vive en disco (DESINF_UPLOAD_PATH, FUERA del arbol que express.static sirve
-- en /uploads) y se sirve por endpoint con token, como el PDF
-- del R-34. drive_file_id se llena cuando el flujo de n8n confirma que la copia
-- quedó en Drive; mientras esté NULL, la única copia es la del servidor.
CREATE TABLE IF NOT EXISTS h360_desinf_evidencia (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  registro_id     INT UNSIGNED NOT NULL,
  ruta            VARCHAR(400) NOT NULL COMMENT 'Relativa a DESINF_UPLOAD_PATH',
  nombre_original VARCHAR(255) NULL,
  mime            VARCHAR(100) NULL,
  bytes           INT UNSIGNED NULL,
  drive_file_id   VARCHAR(100) NULL COMMENT 'Lo confirma el callback de n8n',
  drive_at        TIMESTAMP    NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_desinf_evi_registro (registro_id),
  -- Para reintentar lo que no llegó a Drive sin recorrer toda la tabla.
  KEY idx_desinf_evi_pendiente_drive (drive_file_id, created_at),
  CONSTRAINT fk_desinf_evi_registro
    FOREIGN KEY (registro_id) REFERENCES h360_desinf_registro(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Código de autorización para activar un vehículo sin registrar ──────────
--
-- Misma forma que reapertura_tokens, que es el mecanismo que ya usa el sistema
-- para autorizar una excepción: código de 6 dígitos al espacio de Chat, con
-- vencimiento, motivo y nombre de quien lo pide. Se copia la forma y no la
-- tabla porque lo que se autoriza es distinto y mezclarlos haría que un código
-- pedido para una cosa sirviera para la otra.
CREATE TABLE IF NOT EXISTS h360_desinf_autorizacion (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vehiculo_id            INT UNSIGNED NOT NULL,
  codigo                 CHAR(6)      NOT NULL,
  motivo                 VARCHAR(300) NOT NULL,
  estado                 ENUM('ENVIADO','USADO','EXPIRADO','CANCELADO') NOT NULL DEFAULT 'ENVIADO',
  solicitado_por         VARCHAR(50)  NOT NULL,
  solicitado_por_nombre  VARCHAR(150) NULL,
  expira_at              TIMESTAMP    NOT NULL,
  usado_por              VARCHAR(50)  NULL,
  usado_at               TIMESTAMP    NULL,
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_desinf_aut_busqueda (vehiculo_id, estado, codigo),
  CONSTRAINT fk_desinf_aut_vehiculo
    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Por qué está abajo un vehículo ─────────────────────────────────────────
--
-- `vehiculos.activo` ya existe y ya bloquea la asignación a exequias, así que
-- el módulo no necesita nada nuevo para inhabilitar: baja esa bandera. Lo que
-- falta es el motivo, y no es cosmético.
--
-- inactivo_origen es lo que hace segura la reactivación automática. Si un
-- vehículo está abajo por un choque o por mantenimiento y alguien registra una
-- desinfección, el módulo NO debe levantarlo. Sin esta columna habría que
-- adivinar comparando textos de motivo, y el día que alguien escriba el motivo
-- distinto, el módulo pone en servicio un carro accidentado.
-- El ALTER va detrás de una guarda porque este archivo se corre a mano. Un
-- CREATE TABLE IF NOT EXISTS se puede repetir sin consecuencias, pero un
-- ADD COLUMN repetido aborta con «Duplicate column name» — y como el catálogo
-- se siembra más abajo, un segundo intento dejaba las tablas creadas y vacías.
-- MySQL 8 no tiene ADD COLUMN IF NOT EXISTS, así que se consulta el catálogo.
SET @faltan_columnas = (
  SELECT COUNT(*) = 0 FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name   = 'vehiculos'
     AND column_name  = 'inactivo_origen');

SET @ddl = IF(@faltan_columnas,
  'ALTER TABLE vehiculos
     ADD COLUMN inactivo_origen ENUM(''MANUAL'',''DESINFECCION'') NULL
       COMMENT ''Quién lo bajó: solo el módulo puede volver a subir lo que él bajó'' AFTER activo,
     ADD COLUMN inactivo_motivo VARCHAR(200) NULL AFTER inactivo_origen,
     ADD COLUMN inactivo_at     TIMESTAMP    NULL AFTER inactivo_motivo,
     ADD COLUMN inactivo_por    VARCHAR(50)  NULL AFTER inactivo_at',
  'DO 0');
PREPARE aplicar FROM @ddl;
EXECUTE aplicar;
DEALLOCATE PREPARE aplicar;

-- ── Catálogo inicial, tal como está en la hoja ─────────────────────────────
INSERT INTO h360_desinf_actividad (nombre, descripcion) VALUES
  ('Lavado y polichado',  'Lavado exterior y polichado de la carrocería. La hace el lavadero.'),
  ('Limpieza y lavado',   'Limpieza interior y lavado general. La hace el lavadero.'),
  ('Desinfección choque', 'Desinfección por choque del compartimiento. La ejecuta el operario y exige evidencia fotográfica.'),
  ('Desinfección choque-choque', 'Desinfección por doble choque del compartimiento. La ejecuta el operario y exige evidencia fotográfica.')
ON DUPLICATE KEY UPDATE nombre = nombre;

-- La matriz de la hoja, sin interpretar nada: «CARROZAS - NECRO(traslado)»
-- significa que aplica a los dos tipos, y por eso son dos reglas.
INSERT INTO h360_desinf_regla (actividad_id, tipo_vehiculo, periodicidad_dias, tipo_registro)
SELECT a.id, t.tipo, t.dias, t.registro FROM h360_desinf_actividad a
  JOIN (
    SELECT 'Lavado y polichado'  AS act, 'CARROZA'  AS tipo, 30 AS dias, 'ORDEN_SERVICIO' AS registro UNION ALL
    SELECT 'Lavado y polichado',        'TRASLADO',       30,       'ORDEN_SERVICIO' UNION ALL
    SELECT 'Limpieza y lavado',         'CARROZA',        15,       'ORDEN_SERVICIO' UNION ALL
    SELECT 'Limpieza y lavado',         'TRASLADO',       15,       'ORDEN_SERVICIO' UNION ALL
    SELECT 'Desinfección choque',       'TRASLADO',       15,       'EVIDENCIA'      UNION ALL
    SELECT 'Desinfección choque-choque','CARROZA',        30,       'EVIDENCIA'
  ) t ON t.act = a.nombre
ON DUPLICATE KEY UPDATE
  periodicidad_dias = VALUES(periodicidad_dias),
  tipo_registro     = VALUES(tipo_registro);
