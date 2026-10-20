-- TRIKIPELUDOS — 004 Roles operativos y permisos trk sobre roles de Mantix (patrón rol_cajero_migration.sql).
INSERT IGNORE INTO roles (nombre, descripcion, permisos, activo) VALUES
  ('TRK_CABINA',       'TRIKIPELUDOS — Cabina de recepción (PIN compartido)',  '{"trk":{"cabina":true}}',    1),
  ('TRK_COMENTARISTA', 'TRIKIPELUDOS — Comentarista de tarima (PIN compartido)', '{"trk":{"pasarela":true}}',  1),
  ('TRK_JURADO',       'TRIKIPELUDOS — Jurado calificador (PIN individual)',   '{"trk":{"calificar":true}}', 1);

-- Roles administradores existentes: todos los permisos TRK excepto calificar.
UPDATE roles
SET permisos = JSON_MERGE_PATCH(
  COALESCE(permisos, '{}'),
  '{"trk":{"administrar":true,"importar":true,"editar":true,"calificaciones_desbloquear":true,"publicar":true,"exportar":true,"pasarela":true,"cabina":true}}'
)
WHERE LOWER(nombre) LIKE '%admin%';
