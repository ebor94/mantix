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

-- 2. Actualizar roles existentes tipo "administrador" con todos los permisos de afiliaciones
--    Usa JSON_MERGE_PATCH para no destruir otros permisos que ya pudieran existir
UPDATE roles
SET permisos = JSON_MERGE_PATCH(
  COALESCE(permisos, '{}'),
  '{"afiliaciones":{"crear":true,"ver_propias":true,"ver_todas":true,"aprobar":true,"rechazar":true,"corregir_propias":true}}'
)
WHERE LOWER(nombre) LIKE '%admin%';

-- 3. Insertar nuevos roles para el módulo de afiliaciones
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
