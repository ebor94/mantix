-- ================================================================
-- TRIKIPELUDOS — 009 Categorías v3 (definitivas para el evento)
--   1 Caninos raza mediana (MEDIANOS) #92D050 · 2 Caninos raza pequeña (PEQUENOS) #FF9900
--   3 Felinos (FELINOS) #00B0F0 · 4 Caninos raza grande (GRANDES) #FFFF00 · 5 Disfraz familiar (FAMILIAR) #FF0000
-- Los códigos no cambian (conservan ids, participantes y calificaciones); solo nombre, orden y color.
-- El color es dato (trk_categorias.color), nunca constante en código. Reaplicable.
-- ================================================================

-- 1. Columna color (#RRGGBB). MySQL 8.0 no tiene ADD COLUMN IF NOT EXISTS: guarda con information_schema.
SET @trk_sql_color = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'trk_categorias' AND column_name = 'color') = 0,
  'ALTER TABLE trk_categorias ADD COLUMN color CHAR(7) NULL AFTER nombre',
  'SELECT 1'
);
PREPARE trk_stmt_color FROM @trk_sql_color;
EXECUTE trk_stmt_color;
DEALLOCATE PREPARE trk_stmt_color;

-- 2. Nombres, orden y colores definitivos por código.
UPDATE trk_categorias c
JOIN (
            SELECT 'MEDIANOS' AS codigo, 'Caninos raza mediana' AS nombre, 1 AS orden, '#92D050' AS color
  UNION ALL SELECT 'PEQUENOS', 'Caninos raza pequeña', 2, '#FF9900'
  UNION ALL SELECT 'FELINOS',  'Felinos',              3, '#00B0F0'
  UNION ALL SELECT 'GRANDES',  'Caninos raza grande',  4, '#FFFF00'
  UNION ALL SELECT 'FAMILIAR', 'Disfraz familiar',     5, '#FF0000'
) v ON v.codigo = c.codigo
SET c.nombre = v.nombre, c.orden = v.orden, c.color = v.color;
