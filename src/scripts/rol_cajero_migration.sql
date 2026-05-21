-- ================================================================
-- Migración: Rol CAJERO + permisos de módulo caja
-- BD: serfuweb
-- Fecha: 2026-05-21
-- Descripción:
--   - Inserta rol CAJERO con permisos para cuadre de caja.
--   - Extiende permisos del rol ASESOR_AFILIACIONES con ver_propios y cobrar_posfechado.
--   - Extiende permisos de roles administradores con todos los permisos del módulo caja.
-- ================================================================

-- 1. Insertar rol CAJERO (idempotente vía INSERT IGNORE)
INSERT IGNORE INTO roles (nombre, descripcion, permisos, activo) VALUES
(
  'CAJERO',
  'Cajero / Auditoría — gestiona el cuadre de caja diario con los asesores y aprueba recibos',
  '{"caja":{"ver_cuadre":true,"aprobar_recibos":true},"afiliaciones":{}}',
  1
);

-- 2. Extender permisos del rol ASESOR_AFILIACIONES con el módulo caja
UPDATE roles
SET permisos = JSON_MERGE_PATCH(
  COALESCE(permisos, '{}'),
  '{"caja":{"ver_propios":true,"cobrar_posfechado":true}}'
)
WHERE nombre = 'ASESOR_AFILIACIONES';

-- 3. Dar permisos de caja al rol APROBADOR_AFILIACIONES (puede ver el cuadre como auditor)
UPDATE roles
SET permisos = JSON_MERGE_PATCH(
  COALESCE(permisos, '{}'),
  '{"caja":{"ver_cuadre":true}}'
)
WHERE nombre = 'APROBADOR_AFILIACIONES';

-- 4. Dar todos los permisos del módulo caja al rol administrador
UPDATE roles
SET permisos = JSON_MERGE_PATCH(
  COALESCE(permisos, '{}'),
  '{"caja":{"ver_cuadre":true,"aprobar_recibos":true,"ver_propios":true,"cobrar_posfechado":true}}'
)
WHERE LOWER(nombre) LIKE '%admin%';

-- Verificación
SELECT id, nombre, permisos, activo
FROM roles
WHERE nombre IN ('CAJERO', 'ASESOR_AFILIACIONES', 'APROBADOR_AFILIACIONES')
   OR LOWER(nombre) LIKE '%admin%';
