-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — La orden de servicio sale al cerrar el F-02, no al asignar
--
-- Antes salía cuando el F-01 quedaba a cargo de un asistente externo. Pero el
-- conductor se puede cambiar después a uno interno, y el proveedor ya tenía en
-- el correo una orden por un traslado que no hizo. Ahora se envía cuando el
-- F-02 lo cierra un externo, que es el momento en que consta que el traslado
-- lo hizo él.
--
-- Estas columnas son el registro de ese envío, y también lo que evita el
-- duplicado: si el F-02 se reabre y se vuelve a cerrar, la orden no sale otra
-- vez. aviso_externo_* se queda con lo suyo, que es el WhatsApp de asignación.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE asistencias
  ADD COLUMN orden_servicio_at        TIMESTAMP    NULL AFTER aviso_externo_resultado,
  ADD COLUMN orden_servicio_correo    VARCHAR(200) NULL AFTER orden_servicio_at,
  ADD COLUMN orden_servicio_resultado JSON         NULL AFTER orden_servicio_correo;
