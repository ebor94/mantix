-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — Seguimiento y control del aseo y la desinfección del laboratorio
--
-- Hermano del módulo de vehículos (`h360_desinfecciones_migration.sql`), pero
-- con tablas propias. No se reusan las de allá por dos razones concretas, no de
-- estilo:
--
-- 1. `h360_desinf_registro.vehiculo_id` es NOT NULL con ON DELETE RESTRICT, y
--    ese RESTRICT se puso a propósito: es la única copia de la historia
--    sanitaria de la flota. Meter el laboratorio ahí obliga a volver esa
--    columna anulable, que es exactamente debilitar la garantía.
-- 2. `h360_desinf_regla` tiene UNIQUE (actividad_id, tipo_vehiculo) con
--    `tipo_vehiculo` NOT NULL. No admite un laboratorio sin inventarle un tipo
--    de vehículo falso.
--
-- A eso se suma que la periodicidad es de otra naturaleza: allá es «cada N días
-- con fecha planeada a mano»; acá es «todos los días», «los sábados» o «cada
-- vez que pase un evento».
--
-- Lo que sí se reusa tal cual es el servicio de evidencia fotográfica, que está
-- acoplado al `id` de un registro y a una ruta en disco, no a la tabla de
-- vehículos. Por eso `h360_lab_evidencia` es espejo de `h360_desinf_evidencia`.
--
-- ── Idempotencia ───────────────────────────────────────────────────────────
-- `deploy-mantix` no corre migraciones: este archivo se corre A MANO y se va a
-- correr más de una vez. Todo acá tiene que aguantar tres pasadas seguidas sin
-- fallar y sin duplicar:
--   · las tablas van con CREATE TABLE IF NOT EXISTS;
--   · la semilla va con INSERT IGNORE contra uk_lab_nombre,
--     uk_lab_actividad_nombre y uk_lab_regla.
-- No hay ningún ALTER pelado, que es lo que en el módulo de vehículos obligó a
-- la guarda de information_schema (MySQL 8 no tiene ADD COLUMN IF NOT EXISTS):
-- las seis tablas son nuevas, así que no hace falta acá.
--
-- OJO con el orden de creación: `h360_lab_registro` apunta a `h360_lab_tarea`,
-- así que la tarea va antes. Y `h360_lab_tarea.registro_id` NO lleva FK a
-- propósito: la referencia es circular y una FK ahí haría imposible crear las
-- tablas en cualquier orden.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Los laboratorios ───────────────────────────────────────────────────────
--
-- Multi-laboratorio desde el día uno, no como refactor futuro: con un solo
-- laboratorio el selector simplemente no se muestra en la UI, pero el modelo ya
-- lo admite y agregar una sede es insertar una fila.
CREATE TABLE IF NOT EXISTS h360_lab (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(80) NOT NULL,
  sede       VARCHAR(80) NULL,
  activo     TINYINT(1)  NOT NULL DEFAULT 1,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lab_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Catálogo de actividades ────────────────────────────────────────────────
--
-- `bloque` es el agrupador con el que se levantó el cuadro en la reunión y con
-- el que la gente lee la pantalla: limpieza de laboratorio, trampa de grasa y
-- actividades operativas.
CREATE TABLE IF NOT EXISTS h360_lab_actividad (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  bloque      ENUM('LABORATORIO','TRAMPA_GRASA','OPERATIVA') NOT NULL,
  descripcion VARCHAR(300) NULL,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lab_actividad_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── La matriz: qué actividad le toca a qué laboratorio y con qué ritmo ─────
--
-- `laboratorio_id` acá es lo que hace que el multi-laboratorio sea una fila
-- nueva y no un refactor.
--
-- `momento` es ETIQUETA, no restricción: no hay turnos fijos, así que no se
-- puede rechazar un registro por la hora. «Preferible de noche» se muestra y
-- nada más.
--
-- Los CHECK son lo que impide que una regla SEMANAL quede sin día o una
-- CADA_N_DIAS sin período. Ese es el estado en que el generador no sabe qué
-- hacer y la actividad desaparece del tablero sin que nadie lo note — el peor
-- error posible en un módulo de auditoría sanitaria, porque el informe lo lee
-- como cumplimiento.
--
-- OJO con el `IS NOT NULL` explícito en los dos CHECK: no es redundante con el
-- BETWEEN ni con el `>= 2`. MySQL (como el estándar) acepta la fila cuando el
-- CHECK evalúa a NULL, no solo a TRUE. Una regla SEMANAL con `dia_semana` NULL
-- da (TRUE AND NULL) OR (FALSE AND TRUE) = NULL, y entraba igual. Verificado en
-- MySQL 8.4 contra una réplica: sin el IS NOT NULL, la fila mala pasa.
CREATE TABLE IF NOT EXISTS h360_lab_regla (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actividad_id   INT UNSIGNED NOT NULL,
  laboratorio_id INT UNSIGNED NOT NULL,
  frecuencia     ENUM('DIARIA','SEMANAL','CADA_N_DIAS','POR_EVENTO') NOT NULL,
  cada_dias      SMALLINT UNSIGNED NULL COMMENT 'Solo CADA_N_DIAS',
  dia_semana     TINYINT  UNSIGNED NULL COMMENT 'Solo SEMANAL. ISO: 1=lunes .. 7=domingo',
  momento        ENUM('CUALQUIERA','NOCHE')          NOT NULL DEFAULT 'CUALQUIERA',
  tipo_registro  ENUM('CONFIRMACION','EVIDENCIA')    NOT NULL DEFAULT 'CONFIRMACION',
  activo         TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lab_regla (actividad_id, laboratorio_id),
  KEY idx_lab_regla_gen (laboratorio_id, activo, frecuencia),
  CONSTRAINT fk_lab_regla_actividad FOREIGN KEY (actividad_id)
    REFERENCES h360_lab_actividad(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_regla_lab FOREIGN KEY (laboratorio_id)
    REFERENCES h360_lab(id) ON DELETE CASCADE,
  CONSTRAINT ck_lab_regla_cada_dias CHECK (
    (frecuencia  = 'CADA_N_DIAS' AND cada_dias IS NOT NULL AND cada_dias >= 2) OR
    (frecuencia <> 'CADA_N_DIAS' AND cada_dias IS NULL)),
  CONSTRAINT ck_lab_regla_dia_semana CHECK (
    (frecuencia  = 'SEMANAL' AND dia_semana IS NOT NULL AND dia_semana BETWEEN 1 AND 7) OR
    (frecuencia <> 'SEMANAL' AND dia_semana IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── La lista del día, materializada ────────────────────────────────────────
--
-- La lista de un día se MATERIALIZA, no se calcula al vuelo: es lo que permite
-- que el informe de cumplimiento de marzo no cambie porque en abril alguien
-- editó una frecuencia.
--
-- `uk_lab_tarea` es lo que hace idempotente la generación del día. La
-- generación se dispara dos veces —el cron de las 00:05 y la primera consulta
-- del tablero— y sin esa clave la segunda duplica la lista.
--
-- `idx_lab_tarea_abierta` es el que usa el guardia de «no crear otra mientras
-- haya una abierta» para la misma regla. Sin ese guardia, una quincenal
-- atrasada dos semanas produce 14 incumplimientos en vez de uno, y el informe
-- diría que el laboratorio falló 14 veces cuando falló una.
--
-- POR_EVENTO no genera filas acá: no tiene día. Va directo a h360_lab_registro
-- con tarea_id NULL.
CREATE TABLE IF NOT EXISTS h360_lab_tarea (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  laboratorio_id INT UNSIGNED NOT NULL,
  regla_id       INT UNSIGNED NOT NULL,
  fecha          DATE NOT NULL COMMENT 'El día en que se esperaba',
  estado         ENUM('PENDIENTE','HECHA','OMITIDA','NO_HECHA') NOT NULL DEFAULT 'PENDIENTE',
  registro_id    INT UNSIGNED NULL,
  motivo_omision VARCHAR(200) NULL,
  cerrada_por    VARCHAR(50)  NULL,
  cerrada_at     TIMESTAMP    NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lab_tarea (laboratorio_id, regla_id, fecha),
  KEY idx_lab_tarea_dia (laboratorio_id, fecha, estado),
  KEY idx_lab_tarea_abierta (regla_id, estado),
  CONSTRAINT fk_lab_tarea_lab FOREIGN KEY (laboratorio_id)
    REFERENCES h360_lab(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_tarea_regla FOREIGN KEY (regla_id)
    REFERENCES h360_lab_regla(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── El registro de ejecución: historia, no estado ──────────────────────────
--
-- COPIA `actividad_nombre`, `bloque`, `frecuencia`, `cada_dias` y
-- `tipo_registro` en vez de apuntar a la regla: cambiar una frecuencia en abril
-- no puede reescribir lo que se cumplió en marzo. Es la misma razón que en
-- `h360_desinf_registro`.
--
-- `fk_lab_reg_lab` va ON DELETE RESTRICT — es la única copia de la historia
-- sanitaria del laboratorio. Las de regla y tarea van SET NULL: el registro
-- sobrevive a que se borre su regla.
CREATE TABLE IF NOT EXISTS h360_lab_registro (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  laboratorio_id    INT UNSIGNED NOT NULL,
  regla_id          INT UNSIGNED NULL COMMENT 'NULL si la regla se borró',
  tarea_id          INT UNSIGNED NULL COMMENT 'NULL en POR_EVENTO: no tiene día',
  actividad_nombre  VARCHAR(120) NOT NULL COMMENT 'Copia: la actividad puede renombrarse',
  bloque            ENUM('LABORATORIO','TRAMPA_GRASA','OPERATIVA') NOT NULL,
  frecuencia        ENUM('DIARIA','SEMANAL','CADA_N_DIAS','POR_EVENTO') NOT NULL,
  cada_dias         SMALLINT UNSIGNED NULL COMMENT 'La que regía al ejecutar',
  tipo_registro     ENUM('CONFIRMACION','EVIDENCIA') NOT NULL,
  fecha_ejecucion   DATE NOT NULL,
  fecha_esperada    DATE NULL COMMENT 'La fecha de la tarea; NULL en POR_EVENTO',
  dias_atraso       SMALLINT NULL COMMENT 'Negativo = se hizo antes',
  observaciones     TEXT NULL,
  registrado_por    VARCHAR(50)  NOT NULL,
  registrado_nombre VARCHAR(150) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lab_reg_fecha   (laboratorio_id, fecha_ejecucion),
  KEY idx_lab_reg_persona (registrado_por, fecha_ejecucion),
  CONSTRAINT fk_lab_reg_lab   FOREIGN KEY (laboratorio_id)
    REFERENCES h360_lab(id)       ON DELETE RESTRICT,
  CONSTRAINT fk_lab_reg_regla FOREIGN KEY (regla_id)
    REFERENCES h360_lab_regla(id) ON DELETE SET NULL,
  CONSTRAINT fk_lab_reg_tarea FOREIGN KEY (tarea_id)
    REFERENCES h360_lab_tarea(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Evidencia fotográfica ──────────────────────────────────────────────────
--
-- Espejo exacto de `h360_desinf_evidencia`, porque la va a leer el mismo
-- servicio (`desinfeccionEvidencia.service.js`) sin duplicarlo. Solo cambian el
-- nombre de la tabla, el de la FK y a qué tabla apunta.
--
-- Varias por registro: una desinfección se fotografía por partes.
--
-- En la base va la ruta relativa, nunca la absoluta ni el archivo: el binario
-- vive en disco (DESINF_UPLOAD_PATH, FUERA del árbol que express.static sirve
-- en /uploads) y se sirve por endpoint con token. `drive_file_id` se llena
-- cuando el flujo de n8n confirma que la copia quedó en Drive; mientras esté
-- NULL, la única copia es la del servidor.
CREATE TABLE IF NOT EXISTS h360_lab_evidencia (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  registro_id     INT UNSIGNED NOT NULL,
  ruta            VARCHAR(400) NOT NULL COMMENT 'Relativa a DESINF_UPLOAD_PATH',
  nombre_original VARCHAR(255) NULL,
  mime            VARCHAR(100) NULL,
  bytes           INT UNSIGNED NULL,
  drive_file_id   VARCHAR(100) NULL COMMENT 'Lo confirma el callback de n8n',
  drive_at        TIMESTAMP    NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lab_evi_registro (registro_id),
  -- Para reintentar lo que no llegó a Drive sin recorrer toda la tabla.
  KEY idx_lab_evi_pendiente_drive (drive_file_id, created_at),
  CONSTRAINT fk_lab_evi_registro
    FOREIGN KEY (registro_id) REFERENCES h360_lab_registro(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEMILLA
--
-- Todo con INSERT IGNORE contra las claves únicas: tres pasadas seguidas no
-- duplican nada. Se usa IGNORE y no ON DUPLICATE KEY UPDATE a propósito — la
-- pantalla de configuración permite cambiar frecuencia, momento y tipo de
-- registro sin tocar código, y un UPDATE acá pisaría esos cambios en la
-- siguiente pasada del script.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── El laboratorio ─────────────────────────────────────────────────────────
--
-- PENDIENTE L2 de la especificación: el nombre y la sede son provisionales. Se
-- corrigen con un UPDATE cuando el usuario dé el nombre real; no hay que volver
-- a correr el script.
INSERT IGNORE INTO h360_lab (nombre, sede) VALUES
  ('Laboratorio Los Olivos', 'Cúcuta');

-- ── Las 23 actividades ─────────────────────────────────────────────────────
--
-- Tal como está el cuadro levantado en la reunión del 2026-11-25. La hoja trae
-- 25 filas; acá van 23. NO se cargan «lavar carrozas» ni «tanquear carrozas»:
-- el lavado ya existe en el módulo de vehículos como «lavado y polichado» (30
-- días) y cargarlo acá haría que los informes lo contaran dos veces; el tanqueo
-- no es desinfección.
INSERT IGNORE INTO h360_lab_actividad (nombre, bloque) VALUES
  -- Bloque 1 — Limpieza de laboratorio (8)
  ('Instrumental',                                                              'LABORATORIO'),
  ('Lavado de tubería',                                                         'LABORATORIO'),
  ('Desinfección recipiente de residuos anatomopatológicos + lavado de troques','LABORATORIO'),
  ('Mangueras',                                                                 'LABORATORIO'),
  ('Camillas',                                                                  'LABORATORIO'),
  ('Cobertores',                                                                'LABORATORIO'),
  ('Recipiente de residuos anatomopatológicos',                                 'LABORATORIO'),
  ('Desinfección de EPP (delantal, gafas, máscara full face, botas)',           'LABORATORIO'),
  -- Bloque 2 — Trampa de grasa (4)
  ('Limpieza y recolección de residuos sólidos, trampas 1 y 2',                 'TRAMPA_GRASA'),
  ('Desinfección de trampa 3 y 4',                                              'TRAMPA_GRASA'),
  ('Lavado de tanque del sistema de vacío',                                     'TRAMPA_GRASA'),
  ('Revisión de contenedor de sulfato de aluminio y aireador',                  'TRAMPA_GRASA'),
  -- Bloque 3 — Actividades operativas (11; la hoja trae 13, menos las dos de carrozas)
  ('Recolección de bolsas de residuos peligrosos',                              'OPERATIVA'),
  ('Lavado de alfombras',                                                       'OPERATIVA'),
  ('Mantenimiento y lavado de equipos de desinfección',                         'OPERATIVA'),
  ('Mantenimiento y lavado de cureñas',                                         'OPERATIVA'),
  ('Limpieza de bodegas de cofres',                                             'OPERATIVA'),
  ('Lavado del baño del área operativa',                                        'OPERATIVA'),
  ('Recolección de equipos de velación en residencia',                          'OPERATIVA'),
  ('Recolección de cofres de cremación, limpieza y almacenamiento',             'OPERATIVA'),
  ('Orden y aseo del parqueadero interno',                                      'OPERATIVA'),
  ('Limpieza del comedor',                                                      'OPERATIVA'),
  ('Limpieza y organización del patio de basuras y bodega de equipos',          'OPERATIVA');

-- ── Las 23 reglas del laboratorio sembrado ─────────────────────────────────
--
-- Resumen de control, para que un conteo delate cualquier edición descuidada:
--   14 DIARIA · 2 CADA_N_DIAS(15) · 2 SEMANAL(dia_semana = 6, sábado) ·
--   5 POR_EVENTO
--   momento = 'NOCHE' en 4 (las marcadas 🌙 en la especificación)
--   tipo_registro = 'EVIDENCIA' en 3
--
-- Sobre las 3 de EVIDENCIA: exigir foto en las 14 diarias serían ~5.000 fotos
-- al año y `uploads` ya pesa 8,4 GB en un disco con 34 GB libres. Las tres que
-- la exigen son las de residuos anatomopatológicos y peligrosos, que son las
-- que una visita de control sanitario va a pedir. Es una decisión del plan, no
-- del usuario (PENDIENTE L1): la pantalla de configuración la cambia sin tocar
-- código.
--
-- Las 7 filas amarillas de la hoja («cualquier turno») son DIARIA: lo amarillo
-- solo significaba que no importa a qué hora se cierren, y no hay turnos fijos.
--
-- Se resuelve por nombre y no por id: los AUTO_INCREMENT no son estables entre
-- bases, y en producción las tablas pueden existir ya con otros ids.
INSERT IGNORE INTO h360_lab_regla
  (actividad_id, laboratorio_id, frecuencia, cada_dias, dia_semana, momento, tipo_registro)
SELECT a.id, l.id, s.frecuencia, s.cada_dias, s.dia_semana, s.momento, s.tipo_registro
  FROM h360_lab_actividad a
  JOIN h360_lab l ON l.nombre = 'Laboratorio Los Olivos'
  JOIN (
    -- Bloque 1 — Limpieza de laboratorio
    SELECT 'Instrumental' AS act,
           'DIARIA' AS frecuencia, NULL AS cada_dias, NULL AS dia_semana,
           'CUALQUIERA' AS momento, 'CONFIRMACION' AS tipo_registro            UNION ALL
    SELECT 'Lavado de tubería',
           'POR_EVENTO',  NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    -- EVID: la pide una visita de control sanitario
    SELECT 'Desinfección recipiente de residuos anatomopatológicos + lavado de troques',
           'CADA_N_DIAS',   15, NULL, 'CUALQUIERA', 'EVIDENCIA'                UNION ALL
    SELECT 'Mangueras',
           'CADA_N_DIAS',   15, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    SELECT 'Camillas',
           'POR_EVENTO',  NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    SELECT 'Cobertores',
           'POR_EVENTO',  NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    -- EVID
    SELECT 'Recipiente de residuos anatomopatológicos',
           'DIARIA',      NULL, NULL, 'CUALQUIERA', 'EVIDENCIA'                UNION ALL
    SELECT 'Desinfección de EPP (delantal, gafas, máscara full face, botas)',
           'DIARIA',      NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL

    -- Bloque 2 — Trampa de grasa
    SELECT 'Limpieza y recolección de residuos sólidos, trampas 1 y 2',
           'DIARIA',      NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    SELECT 'Desinfección de trampa 3 y 4',
           'SEMANAL',     NULL,    6, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    SELECT 'Lavado de tanque del sistema de vacío',
           'SEMANAL',     NULL,    6, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    -- 🌙
    SELECT 'Revisión de contenedor de sulfato de aluminio y aireador',
           'DIARIA',      NULL, NULL, 'NOCHE',      'CONFIRMACION'             UNION ALL

    -- Bloque 3 — Actividades operativas
    -- 🌙 + EVID
    SELECT 'Recolección de bolsas de residuos peligrosos',
           'DIARIA',      NULL, NULL, 'NOCHE',      'EVIDENCIA'                UNION ALL
    SELECT 'Lavado de alfombras',
           'DIARIA',      NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    SELECT 'Mantenimiento y lavado de equipos de desinfección',
           'DIARIA',      NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    SELECT 'Mantenimiento y lavado de cureñas',
           'DIARIA',      NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    SELECT 'Limpieza de bodegas de cofres',
           'DIARIA',      NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    -- 🌙
    SELECT 'Lavado del baño del área operativa',
           'DIARIA',      NULL, NULL, 'NOCHE',      'CONFIRMACION'             UNION ALL
    SELECT 'Recolección de equipos de velación en residencia',
           'POR_EVENTO',  NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    SELECT 'Recolección de cofres de cremación, limpieza y almacenamiento',
           'POR_EVENTO',  NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    SELECT 'Orden y aseo del parqueadero interno',
           'DIARIA',      NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'             UNION ALL
    -- 🌙
    SELECT 'Limpieza del comedor',
           'DIARIA',      NULL, NULL, 'NOCHE',      'CONFIRMACION'             UNION ALL
    SELECT 'Limpieza y organización del patio de basuras y bodega de equipos',
           'DIARIA',      NULL, NULL, 'CUALQUIERA', 'CONFIRMACION'
  ) s ON s.act = a.nombre;
