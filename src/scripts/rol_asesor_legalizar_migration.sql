-- ============================================================
-- rol_asesor_legalizar_migration.sql
-- Agrega el permiso afiliaciones.legalizar al rol ASESOR_AFILIACIONES.
-- ============================================================

UPDATE roles
SET permisos = JSON_SET(permisos, '$.afiliaciones.legalizar', CAST('true' AS JSON))
WHERE nombre = 'ASESOR_AFILIACIONES';

-- Verificar
SELECT nombre, JSON_EXTRACT(permisos, '$.afiliaciones.legalizar') AS puede_legalizar
FROM roles
WHERE nombre = 'ASESOR_AFILIACIONES';
