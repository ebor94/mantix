-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — El obituario pasa a ser un dato de la exequia
--
-- "¿Gestionó el obituario?" se preguntaba en la confirmación de exequia, que
-- ocurre cuando el homenaje ya está programado. Pero el obituario se gestiona
-- antes, al coordinar la exequia, así que la pregunta se mueve al formulario
-- de edición de la exequia.
--
-- Queda NULL mientras nadie responda: "sin responder" no es lo mismo que "no",
-- y con DEFAULT 0 las 200 exequias existentes dirían que no se gestionó.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE exequias
  ADD COLUMN gestiono_obituario TINYINT(1) NULL AFTER requiere_confirmacion_pago;

-- Lo ya respondido no se pierde. La columna de h360_exequia_seguimiento se
-- deja como está: es el registro de lo que se contestó ese día.
UPDATE exequias e
  JOIN h360_exequia_seguimiento s ON s.exequia_id = e.id
   SET e.gestiono_obituario = s.gestiono_obituario
 WHERE s.gestiono_obituario IS NOT NULL;
