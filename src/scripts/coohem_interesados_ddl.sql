-- Flags por empresa para la alianza COOHEM.
-- emite_certificado_firma: sus afiliados reciben certificado + firma del clausulado (como el asesor).
-- interesados_activo: habilita el link público de autoregistro de interesados hacia empresa_nomina.
ALTER TABLE empresas
  ADD COLUMN emite_certificado_firma TINYINT(1) NOT NULL DEFAULT 0 AFTER publico_activo,
  ADD COLUMN interesados_activo      TINYINT(1) NOT NULL DEFAULT 0 AFTER emite_certificado_firma;

-- Activar para COOHEM (ajustar si el NIT en la tabla difiere):
UPDATE empresas SET emite_certificado_firma = 1, interesados_activo = 1 WHERE nit = '800126897';
