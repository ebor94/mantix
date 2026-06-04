-- ============================================================
-- Elimina la restricción UNIQUE sobre afiliados.numeroDocumento
-- porque una misma persona puede tener varios contratos (segundo
-- contrato, planes adicionales, etc).
--
-- La búsqueda por documento sigue rápida con un índice no-único.
-- ============================================================

-- 1) Soltar el índice único (el nombre real puede variar según cuándo
--    fue creado por Sequelize: 'uq_documento', 'numeroDocumento', o
--    'afiliados_numeroDocumento'). Si el nombre no coincide, consultar:
--      SHOW INDEX FROM afiliados WHERE Non_unique = 0 AND Column_name = 'numeroDocumento';
-- ============================================================
ALTER TABLE afiliados DROP INDEX uq_documento;

-- 2) Crear índice no único para mantener búsquedas rápidas (si no existe)
-- ============================================================
ALTER TABLE afiliados ADD INDEX idx_numero_documento (numeroDocumento);
