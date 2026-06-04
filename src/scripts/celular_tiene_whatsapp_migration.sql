-- ============================================================
-- Indicador informativo: ¿el celular principal del afiliado tiene
-- WhatsApp activo? El asesor lo marca al registrar/actualizar.
-- ============================================================

ALTER TABLE afiliados
  ADD COLUMN celularTieneWhatsapp TINYINT(1) UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Indicador informativo: el celular principal tiene WhatsApp activo';
