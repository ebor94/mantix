-- ============================================================
-- Canal Empresarial — Subsistema C (registro público)
-- DDL: empresas.slug/asesor_id/publico_activo + afiliados.origen
-- ============================================================

ALTER TABLE empresas
  ADD COLUMN slug VARCHAR(80) NULL UNIQUE,
  ADD COLUMN asesor_id INT UNSIGNED NULL,
  ADD COLUMN publico_activo TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE afiliados
  MODIFY COLUMN origen ENUM('ASESOR','VEOLIA','CONVENIO','CONVENIO_PUBLICO') NOT NULL DEFAULT 'ASESOR';
