-- Idempotencia del registro: el front manda una clave por registro y un reintento devuelve el evento ya creado.
ALTER TABLE por_eventos
  ADD COLUMN clave_cliente VARCHAR(64) NULL AFTER registrado_por,
  ADD UNIQUE KEY uq_por_eventos_clave (registrado_por, clave_cliente);
-- Borrado de motivos sin uso desde la administración.
ALTER TABLE por_auditoria MODIFY accion ENUM('CREAR','CORREGIR','ANULAR','FORZAR','SEMBRAR','ELIMINAR') NOT NULL;
