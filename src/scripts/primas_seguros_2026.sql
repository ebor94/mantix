-- ================================================================
-- Migración: Primas de Seguros 2026
-- Ejecutar en la BD: serfuweb
-- Fecha: 2026-03-13
-- ================================================================
-- Limpia las primas anteriores e inserta las tarifas vigentes 2026

TRUNCATE TABLE primas_seguros;

INSERT INTO primas_seguros (nombreSeguro, montoAsegurado, prima, activo) VALUES
  -- SOLIENVIDA
  ('SOLIENVIDA',                        1000000.00,  10800.00, 1),

  -- SOLICANASTA
  ('SOLICANASTA',                       1000000.00,   4200.00, 1),
  ('SOLICANASTA',                       2000000.00,   8400.00, 1),
  ('SOLICANASTA',                       3000000.00,  12600.00, 1),
  ('SOLICANASTA',                       5000000.00,  21000.00, 1),
  ('SOLICANASTA',                      10000000.00,  48000.00, 1),

  -- Accidentes Personales
  ('Acc. Personales Opción 1M-100Aux',  1000000.00,   1560.00, 1),
  ('Acc. Personales Opción 2M-100Aux',  2000000.00,   2820.00, 1),
  ('Acc. Personales Opción 3M-100Aux',  3000000.00,   4080.00, 1),
  ('Acc. Personales Opción 5M-300Aux',  5000000.00,   7200.00, 1),

  -- Sinergia
  ('SINERGIA OP 1',                     1000000.00,  18960.00, 1),
  ('SINERGIA OP 2',                     3000000.00,  42000.00, 1),
  ('SINERGIA OP 3',                     5000000.00,  64800.00, 1);

-- Verificar
SELECT nombreSeguro, montoAsegurado, prima FROM primas_seguros ORDER BY nombreSeguro, montoAsegurado;
