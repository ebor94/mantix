-- ================================================================
-- Migración: RBAC – Roles y permisos para módulo Afiliaciones
-- BD: serfuweb
-- Fecha: 2026-03-05
-- ================================================================

-- 1. Agregar columna asesorId a la tabla afiliados
ALTER TABLE afiliados
  ADD COLUMN IF NOT EXISTS asesorId INT UNSIGNED NULL
    COMMENT 'FK al usuario (asesor de ventas) que registró la afiliación'
    AFTER observaciones;

-- Índice para filtrar afiliaciones por asesor eficientemente
CREATE INDEX IF NOT EXISTS idx_afiliados_asesorId ON afiliados (asesorId);

-- 2. Insertar nuevos roles para el módulo de afiliaciones
-- El campo "permisos" (JSON) ya existe en la tabla roles
INSERT INTO roles (nombre, descripcion, permisos, activo) VALUES
(
  'ASESOR_AFILIACIONES',
  'Asesor de ventas — puede registrar afiliaciones y consultar únicamente las propias',
  '{"afiliaciones":{"crear":true,"ver_propias":true,"corregir_propias":true}}',
  1
),
(
  'APROBADOR_AFILIACIONES',
  'Aprobador — puede ver todas las afiliaciones pendientes y aprobar o rechazar',
  '{"afiliaciones":{"ver_todas":true,"aprobar":true,"rechazar":true}}',
  1
);

-- 3. Verificar resultados
SELECT id, nombre, descripcion, permisos, activo
FROM roles
WHERE nombre IN ('ASESOR_AFILIACIONES', 'APROBADOR_AFILIACIONES');

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'serfuweb'
  AND TABLE_NAME   = 'afiliados'
  AND COLUMN_NAME  = 'asesorId';
