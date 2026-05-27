-- ================================================================
-- Migración: Tarifas Canal Individual – Producto Integral 2026
-- Ejecutar en la BD: serfuweb
-- Fecha: 2026-03-02
-- ================================================================

-- Paso 1: Agregar columnas nuevas a la tabla tarifas (si no existen)
ALTER TABLE tarifas
  ADD COLUMN IF NOT EXISTS valorAdicionalMayor50 DECIMAL(12,2) NOT NULL DEFAULT 0.00
    COMMENT 'Valor por beneficiario adicional entre 50 y 65 años (anual)',
  ADD COLUMN IF NOT EXISTS valorAsistencia DECIMAL(12,2) NOT NULL DEFAULT 0.00
    COMMENT 'Valor anual de asistencia fuera de casa',
  ADD COLUMN IF NOT EXISTS vigencia INT UNSIGNED NULL
    COMMENT 'Año de vigencia de la tarifa (ej: 2026)';

-- Paso 2: Insertar tarifas INDIVIDUAL + INTEGRAL para el año 2026
-- Estructura: 4 planes × 2 variantes (sin asistencia / con asistencia)
--
-- TODOS LOS VALORES SON ANUALES — el frontend los divide por nCuotas para obtener la cuota
--
-- Planes:
--   BASICO      → Integral Grupo Básico       → $313.500/año
--   UNIFAMILIAR → Integral Unifamiliar        → $352.000/año
--   UNIPERSONAL → Unipersonal menores 50 años → $75.900/año
--   INDIVIDUAL  → Unipersonal 50–65 años      → $86.900/año
--
-- Adicionales por edad del beneficiario (valor anual por persona):
--   < 50 años   → $75.900/año  (valorAdicional)
--   50–65 años  → $86.900/año  (valorAdicionalMayor50)
--
-- Asistencia fuera de casa: valor único anual de $12.000
--   asistenciaFueraDeCasa = 0 → valorAsistencia = 0
--   asistenciaFueraDeCasa = 1 → valorAsistencia = 12000

INSERT INTO tarifas
  (canal, producto, grupo, asistenciaFueraDeCasa, valorBase, valorAdicional, valorAdicionalMayor50, valorAsistencia, vigencia, activo)
VALUES
  -- BASICO sin asistencia
  ('INDIVIDUAL', 'INTEGRAL', 'BASICO',      0, 313500.00, 75900.00, 86900.00,     0.00, 2026, 1),
  -- BASICO con asistencia
  ('INDIVIDUAL', 'INTEGRAL', 'BASICO',      1, 313500.00, 75900.00, 86900.00, 12000.00, 2026, 1),
  -- UNIFAMILIAR sin asistencia
  ('INDIVIDUAL', 'INTEGRAL', 'UNIFAMILIAR', 0, 352000.00, 75900.00, 86900.00,     0.00, 2026, 1),
  -- UNIFAMILIAR con asistencia
  ('INDIVIDUAL', 'INTEGRAL', 'UNIFAMILIAR', 1, 352000.00, 75900.00, 86900.00, 12000.00, 2026, 1),
  -- UNIPERSONAL (<50 años) sin asistencia
  ('INDIVIDUAL', 'INTEGRAL', 'UNIPERSONAL', 0,  75900.00, 75900.00, 86900.00,     0.00, 2026, 1),
  -- UNIPERSONAL (<50 años) con asistencia
  ('INDIVIDUAL', 'INTEGRAL', 'UNIPERSONAL', 1,  75900.00, 75900.00, 86900.00, 12000.00, 2026, 1),
  -- INDIVIDUAL (50-65 años) sin asistencia
  ('INDIVIDUAL', 'INTEGRAL', 'INDIVIDUAL',  0,  86900.00, 75900.00, 86900.00,     0.00, 2026, 1),
  -- INDIVIDUAL (50-65 años) con asistencia
  ('INDIVIDUAL', 'INTEGRAL', 'INDIVIDUAL',  1,  86900.00, 75900.00, 86900.00, 12000.00, 2026, 1);

-- Verificar inserción
SELECT canal, producto, grupo, asistenciaFueraDeCasa,
       valorBase, valorAdicional, valorAdicionalMayor50, valorAsistencia, vigencia, activo
FROM tarifas
WHERE canal = 'INDIVIDUAL' AND producto = 'INTEGRAL' AND vigencia = 2026
ORDER BY grupo, asistenciaFueraDeCasa;
