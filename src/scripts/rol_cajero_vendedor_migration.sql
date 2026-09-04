-- ================================================================
-- Migración: Rol cajero_vendedor
-- BD: serfuweb
-- Fecha: 2026-09-04
-- Descripción:
--   Crea el rol `cajero_vendedor`, cuyos permisos son la UNIÓN de los
--   permisos ACTUALES de los roles ASESOR_AFILIACIONES y CAJERO.
--
--   Se fusiona leyendo las filas vivas de esos dos roles (JSON_MERGE_PATCH),
--   no un JSON escrito a mano, para que quede correcto aunque esos roles
--   hayan evolucionado (p.ej. CAJERO pasó de aprobar_recibos a aprobar_efectivo).
--
--   Resultado esperado (según permisos vigentes):
--     afiliaciones: crear, ver_propias, corregir_propias, legalizar   (de ASESOR)
--     caja:         ver_propios, cobrar_posfechado                     (de ASESOR)
--                   + ver_cuadre, aprobar_efectivo                     (de CAJERO)
--
--   Consecuencias (heredadas del RBAC por permisos, sin código):
--     - Landing = registro de afiliaciones (tiene afiliaciones.crear).
--     - En /cuadre-caja queda sede-scoped (aprobar_efectivo sin aprobar_bancarios):
--       ve solo recibos de asesores de SU sede → el usuario debe tener sede_id.
--
--   Re-ejecutable: crea el rol si no existe y refresca sus permisos a la
--   unión actual en cada corrida.
-- ================================================================

-- 1. Capturar los permisos vigentes de ambos roles y fusionarlos.
--    (Vía variables para no referenciar `roles` como target y subquery a la vez.)
SET @asesor := (SELECT permisos FROM roles WHERE nombre = 'ASESOR_AFILIACIONES' LIMIT 1);
SET @cajero := (SELECT permisos FROM roles WHERE nombre = 'CAJERO'              LIMIT 1);
SET @merged := JSON_MERGE_PATCH(COALESCE(@asesor, '{}'), COALESCE(@cajero, '{}'));

-- Salvaguarda: abortar si alguno de los roles base no existe (evita crear un
-- rol con permisos incompletos por un typo o un entorno distinto).
-- (Si @asesor o @cajero es NULL, revisa los nombres antes de continuar.)
SELECT
  (@asesor IS NOT NULL) AS asesor_encontrado,
  (@cajero IS NOT NULL) AS cajero_encontrado;

-- 2. Crear el rol si no existe (idempotente vía INSERT IGNORE; `nombre` es único).
INSERT IGNORE INTO roles (nombre, descripcion, permisos, activo) VALUES
(
  'cajero_vendedor',
  'Cajero vendedor — asesor de afiliaciones que además recibe y cuadra efectivo (unión de ASESOR_AFILIACIONES + CAJERO)',
  @merged,
  1
);

-- 3. Refrescar los permisos a la unión actual (re-ejecutable / sincroniza drift).
UPDATE roles SET permisos = @merged WHERE nombre = 'cajero_vendedor';

-- 4. Verificación.
SELECT id, nombre, descripcion, JSON_PRETTY(permisos) AS permisos, activo
FROM roles
WHERE nombre = 'cajero_vendedor';
