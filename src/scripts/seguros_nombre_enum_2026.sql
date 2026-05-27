-- ================================================================
-- Migración: Actualizar ENUM columna `nombre` en tabla `seguros`
-- Ejecutar en la BD: serfuweb
-- Fecha: 2026-04-07
-- ================================================================
-- Reemplaza los valores genéricos (ACCIDENTES, SINERGIA) por los
-- nombres exactos de las opciones 2026.

ALTER TABLE seguros
  MODIFY COLUMN nombre ENUM(
    'SOLICANASTA',
    'Acc. Personales Opción 1M-100Aux',
    'Acc. Personales Opción 2M-100Aux',
    'Acc. Personales Opción 3M-100Aux',
    'Acc. Personales Opción 5M-300Aux',
    'SINERGIA OP 1',
    'SINERGIA OP 2',
    'SINERGIA OP 3',
    'SOLIENVIDA'
  ) NOT NULL;
