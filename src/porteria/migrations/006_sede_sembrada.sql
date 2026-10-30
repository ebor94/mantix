-- Sede en la que se sembró un propio: al anular su último evento vuelve a esa siembra.
ALTER TABLE por_estado_vehiculo ADD COLUMN sembrado_sede_id INT NULL AFTER sembrado_at;
UPDATE por_estado_vehiculo SET sembrado_sede_id = sede_id WHERE sembrado_at IS NOT NULL AND ultimo_evento_id IS NULL;
