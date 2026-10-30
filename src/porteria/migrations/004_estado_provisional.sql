-- Fila provisional de estado: antes del primer evento de una placa se inserta una fila "sin eventos"
-- (ultimo_evento_id NULL) para bloquearla con FOR UPDATE. Un FOR UPDATE sobre una fila inexistente solo
-- toma un gap lock, que no serializa dos primeros registros simultáneos de la misma placa.
ALTER TABLE por_estado_vehiculo
  MODIFY tipo_vehiculo ENUM('PROPIO','PROVEEDOR_ASISTENCIA','PROVEEDOR') NULL,
  MODIFY sede_id INT NULL,
  MODIFY ultimo_evento_id INT NULL;
