-- Índices para acelerar búsquedas por nombre y cédula en predios CYM
-- Con 5000 registros mejora búsquedas LIKE 'texto%' y ordenamientos compuestos
CREATE INDEX idx_cym_predios_sq_nombre   ON cym_predios (sq_nombre(50));
CREATE INDEX idx_cym_predios_sq_cedula   ON cym_predios (sq_cedula);
CREATE INDEX idx_cym_predios_sq2_nombre  ON cym_predios (sq2_nombre(50));
CREATE INDEX idx_cym_predios_sq2_cedula  ON cym_predios (sq2_cedula);
CREATE INDEX idx_cym_predios_sq3_nombre  ON cym_predios (sq3_nombre(50));
CREATE INDEX idx_cym_predios_sq3_cedula  ON cym_predios (sq3_cedula);
CREATE INDEX idx_cym_predios_sector_lote ON cym_predios (sector, numero_lote);
