-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — Recuperar en el historial las reaperturas que nunca se escribieron
--
-- Entre el 16 de septiembre y el 30 de octubre de 2026 se reabrieron 220
-- secciones con token y ninguna quedó en asistencia_historial: el INSERT le
-- mandaba NULL a estado_hasta, que es NOT NULL, y el error moría en un catch
-- que solo escribía un warn. La reapertura se completaba, el coordinador no
-- veía nada, y el aviso quedaba en un log que nadie lee.
--
-- Se recupera entero porque reapertura_tokens guarda todo lo que hacía falta:
-- la asistencia, la etapa, el motivo, quién lo pidió, quién usó el código y a
-- qué hora. 220 reaperturas, 136 asistencias, 23 personas.
--
-- created_at toma usado_at y no la fecha de hoy: la entrada tiene que quedar
-- en el punto del historial donde ocurrió, no al final, o el relato de la
-- asistencia queda contado al revés.
--
-- nombre_usuario solo se llena cuando quien usó el código es el mismo que lo
-- pidió, que es el caso corriente. Si no, queda en NULL: del otro solo se
-- tiene el usuario, y poner un nombre que no se sabe sería inventarlo.
--
-- Se puede correr dos veces sin duplicar: el NOT EXISTS descarta lo que ya
-- esté escrito para esa asistencia con esa misma hora.
--
-- El JOIN con asistencias no es decorativo: hay un token del 28 de septiembre
-- cuya asistencia se borró después, y sin el JOIN la llave foránea tumba el
-- INSERT entero y no se recupera ninguna. Son 219 de las 220; esa una no tiene
-- a qué historial volver.
--
-- Requiere el arreglo 19af8aa desplegado. Si no, las reaperturas nuevas
-- seguirán perdiéndose y habrá que volver a correr esto.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO asistencia_historial
  (asistencia_id, estado_desde, estado_hasta, usuario_id, nombre_usuario, comentario, created_at)
SELECT t.asistencia_id,
       NULL,
       'REAPERTURA',
       COALESCE(t.usado_por, t.solicitado_por),
       CASE WHEN t.usado_por = t.solicitado_por THEN t.solicitado_por_nombre END,
       CONCAT('REAPERTURA ', t.etapa, ': ', t.motivo,
              ' (autorizado por token, solicitado por ',
              COALESCE(t.solicitado_por_nombre, t.solicitado_por), ')'),
       t.usado_at
  FROM reapertura_tokens t
  JOIN asistencias a ON a.id = t.asistencia_id
 WHERE t.estado = 'USADO'
   AND t.usado_at IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM asistencia_historial h
          WHERE h.asistencia_id = t.asistencia_id
            AND h.estado_hasta  = 'REAPERTURA'
            AND h.created_at    = t.usado_at);

-- Para comprobar después: tienen que dar el mismo número.
--   SELECT COUNT(*) FROM reapertura_tokens t JOIN asistencias a ON a.id = t.asistencia_id
--    WHERE t.estado='USADO' AND t.usado_at IS NOT NULL;
--   SELECT COUNT(*) FROM asistencia_historial WHERE estado_hasta='REAPERTURA';
