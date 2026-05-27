-- =====================================================================
-- SerVentas CRM — Migración 013: Rol JEFE_PAP
-- Target: MySQL 8 / serfuweb
-- Rol nivel 2 (como ADMIN_AREA) pero restringido al grupo PAP (grupo_id=3)
-- en área Previsión PAP (area_id=3).
-- Permisos efectivos: lectura completa de PAP + reasignación de zonas/asesores.
-- NO puede: CRUD usuarios, editar catálogos.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. Insertar rol JEFE_PAP
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_org_roles (rol_codigo, rol_nombre, rol_nivel, rol_permisos) VALUES
('JEFE_PAP', 'Jefe PAP', 2,
 '{"crm":["read","reasignar"],"reportes":["read","export"],"tracking":["read"],"area_restringida":"PREV-PAP","grupo_restringido":"PAP"}');

-- ---------------------------------------------------------------------
-- 2. Insertar usuario jefe.pap@serfunorte.com (password lo rellena setup.js)
--    Apunta a área PREV-PAP (3), grupo PAP (3), punto Cúcuta-Norte (3)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_org_usuarios (
  usr_area_id, usr_grupo_id, usr_rol_id, usr_punto_id,
  usr_email, usr_nombre, usr_apellido, usr_password_hash, usr_telefono
) VALUES (
  3, 3,
  (SELECT rol_id FROM sv_org_roles WHERE rol_codigo = 'JEFE_PAP'),
  3,
  'jefe.pap@serfunorte.com', 'Roberto', 'Salazar', 'PENDING', '315 666 7788'
);

-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'JEFE_PAP rol' AS objeto, COUNT(*) AS encontrados
  FROM sv_org_roles WHERE rol_codigo = 'JEFE_PAP'
UNION ALL
SELECT 'jefe.pap user', COUNT(*)
  FROM sv_org_usuarios WHERE usr_email = 'jefe.pap@serfunorte.com';
