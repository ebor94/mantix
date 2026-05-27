-- Agrega columnas para el 2do y 3er ser querido en predios dobles/triples
ALTER TABLE cym_predios
  ADD COLUMN sq2_cedula      VARCHAR(20)  NULL AFTER sq_fecha_inhum,
  ADD COLUMN sq2_nombre      VARCHAR(200) NULL AFTER sq2_cedula,
  ADD COLUMN sq2_fecha_nac   DATE         NULL AFTER sq2_nombre,
  ADD COLUMN sq2_fecha_fall  DATE         NULL AFTER sq2_fecha_nac,
  ADD COLUMN sq2_fecha_inhum DATE         NULL AFTER sq2_fecha_fall,
  ADD COLUMN sq3_cedula      VARCHAR(20)  NULL AFTER sq2_fecha_inhum,
  ADD COLUMN sq3_nombre      VARCHAR(200) NULL AFTER sq3_cedula,
  ADD COLUMN sq3_fecha_nac   DATE         NULL AFTER sq3_nombre,
  ADD COLUMN sq3_fecha_fall  DATE         NULL AFTER sq3_fecha_nac,
  ADD COLUMN sq3_fecha_inhum DATE         NULL AFTER sq3_fecha_fall;
