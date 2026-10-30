-- Puesta en marcha: un propio sembrado figura dentro de su sede sin haber registrado eventos.
ALTER TABLE por_estado_vehiculo ADD COLUMN sembrado_at DATETIME NULL AFTER salida_abierta_id;
-- Salida registrada en una sede distinta de donde figuraba el vehículo.
ALTER TABLE por_eventos MODIFY inconsistencia_tipo
  ENUM('INGRESO_ESTANDO_DENTRO','SALIDA_ESTANDO_FUERA','SALIDA_OTRA_SEDE') NULL;
ALTER TABLE por_auditoria MODIFY accion ENUM('CREAR','CORREGIR','ANULAR','FORZAR','SEMBRAR') NOT NULL;
