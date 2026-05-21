-- ================================================================
-- Migración: Rol CARTERA + separación de permisos de aprobación
--             por forma de pago (efectivo vs bancarios)
-- BD: serfuweb
-- Fecha: 2026-05-21
-- Descripción:
--   - Inserta rol CARTERA (revisa banco y aprueba transferencias,
--     consignaciones y posfechados cobrados).
--   - CAJERO queda solo con permiso de aprobar EFECTIVO.
--   - Se reemplaza el permiso genérico `aprobar_recibos` por dos
--     específicos: `aprobar_efectivo` y `aprobar_bancarios`.
--   - Admin y super admin reciben ambos.
-- ================================================================

-- 1. Insertar rol CARTERA (idempotente)
INSERT IGNORE INTO roles (nombre, descripcion, permisos, activo) VALUES
(
  'CARTERA',
  'Cartera — verifica en banco y aprueba recibos de transferencias, consignaciones y posfechados cobrados',
  '{"caja":{"ver_cuadre":true,"aprobar_bancarios":true},"afiliaciones":{}}',
  1
);

-- 2. Actualizar rol CAJERO:
--    - Quitar aprobar_recibos genérico
--    - Agregar aprobar_efectivo
UPDATE roles
SET permisos = JSON_SET(
  JSON_REMOVE(
    COALESCE(permisos, '{}'),
    '$.caja.aprobar_recibos'
  ),
  '$.caja.aprobar_efectivo', true
)
WHERE nombre = 'CAJERO';

-- 3. Actualizar admin (y similares):
--    - Quitar aprobar_recibos genérico
--    - Agregar aprobar_efectivo + aprobar_bancarios
UPDATE roles
SET permisos = JSON_SET(
  JSON_SET(
    JSON_REMOVE(
      COALESCE(permisos, '{}'),
      '$.caja.aprobar_recibos'
    ),
    '$.caja.aprobar_efectivo', true
  ),
  '$.caja.aprobar_bancarios', true
)
WHERE LOWER(nombre) LIKE '%admin%';

-- 4. Verificación
SELECT id, nombre, permisos, activo
FROM roles
WHERE nombre IN ('CAJERO', 'CARTERA', 'ASESOR_AFILIACIONES', 'APROBADOR_AFILIACIONES')
   OR LOWER(nombre) LIKE '%admin%';
