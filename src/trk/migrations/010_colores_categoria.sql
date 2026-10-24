-- ================================================================
-- TRIKIPELUDOS — 010 Colores definitivos de las categorías (leyenda oficial del evento)
-- Naranja: Caninos raza pequeña · Verde: Caninos raza mediana · Amarilla: Caninos raza grande
-- Azul: Felinos · Rojo: Disfraz familiar. Solo cambia el color (dato); nombres, orden e ids iguales.
-- ================================================================
UPDATE trk_categorias SET color = '#FD7218' WHERE codigo = 'PEQUENOS';
UPDATE trk_categorias SET color = '#4C9F43' WHERE codigo = 'MEDIANOS';
UPDATE trk_categorias SET color = '#FED104' WHERE codigo = 'GRANDES';
UPDATE trk_categorias SET color = '#186EDD' WHERE codigo = 'FELINOS';
UPDATE trk_categorias SET color = '#DA1F12' WHERE codigo = 'FAMILIAR';
