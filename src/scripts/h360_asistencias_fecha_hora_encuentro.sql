-- Fecha y hora del encuentro con la familia.
--
-- Se captura al registrar el homenaje (sala o residencia) pero vive en la
-- asistencia, porque el encuentro es un solo momento del servicio: ENCUENTRO
-- ya es un estado único del caso (ENCOFRADO → ENCUENTRO → SALA). Guardarla en
-- cada tabla de homenaje la habría escondido de asesor y recepción, que no
-- cargan los datos de homenaje, y habría dejado dos fechas para un mismo
-- momento en los casos que velan primero en sala y después en residencia.
--
-- Un solo DATETIME y no fecha + hora por separado, igual que fecha_contacto:
-- es un momento agendado y la hora sin la fecha no dice nada. Fallecimiento sí
-- está partido, porque una fecha de defunción significa algo por sí sola.
--
-- NULL a propósito: al aplicarse ya había ~360 asistencias y 296 homenajes sin
-- este dato. Un NOT NULL obligaría a inventar una fecha para cada caso
-- histórico. Es obligatorio en los formularios de registro, no en la tabla.

ALTER TABLE asistencias
  ADD COLUMN fecha_hora_encuentro DATETIME NULL
    COMMENT 'Fecha y hora del encuentro con la familia, capturada al registrar el homenaje'
    AFTER fecha_contacto;
