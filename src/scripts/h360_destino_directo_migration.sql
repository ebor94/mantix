-- "Destino final directo": no hay velación, ni en sala ni en residencia.
--
-- Es un caso distinto del traslado a otra ciudad —acá el servicio sí es
-- nuestro, solo que la familia no vela— pero el recorrido es el mismo: del
-- encuentro pasa derecho a aprobación.
ALTER TABLE asistencias
  ADD COLUMN destino_final_directo TINYINT(1) NOT NULL DEFAULT 0 AFTER traslado_otra_ciudad;
