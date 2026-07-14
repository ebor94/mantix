-- ─────────────────────────────────────────────────────────────────────────────
-- Migración de estados H360
--   TRASLADO    → ASISTENCIA
--   PREPARACION → PRESERVACION
--   ENTREGA     → ENCOFRADO
--
-- Requisito: haber desplegado el backend y frontend con los nuevos nombres
--            ANTES de correr este script (o inmediatamente después, con la
--            app fuera de servicio durante la migración).
--
-- Tablas afectadas:
--   • asistencias.estado
--   • asistencia_historial.estado_desde
--   • asistencia_historial.estado_hasta
--
-- Notas:
--   • asistencia_etapas.etapa NO se toca — los nombres de etapa (F02_INVENTARIO_CUERPO,
--     F03_INVENTARIO_RETOQUE, F04_TANATOPRAXIA, F05_ENTREGA) permanecen iguales.
--   • Todo va dentro de una transacción; si algo falla, ROLLBACK.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Snapshot ANTES ────────────────────────────────────────────────────────
SELECT 'ANTES — asistencias.estado' AS info, estado, COUNT(*) AS n
FROM asistencias GROUP BY estado ORDER BY estado;

SELECT 'ANTES — asistencia_historial.estado_desde' AS info, estado_desde AS estado, COUNT(*) AS n
FROM asistencia_historial GROUP BY estado_desde ORDER BY estado_desde;

SELECT 'ANTES — asistencia_historial.estado_hasta' AS info, estado_hasta AS estado, COUNT(*) AS n
FROM asistencia_historial GROUP BY estado_hasta ORDER BY estado_hasta;

-- ── 2. Expandir ENUM para admitir los nuevos valores (asistencias.estado es ENUM)
--      asistencia_historial.estado_desde/estado_hasta son VARCHAR(30), no requieren ALTER.
ALTER TABLE asistencias MODIFY COLUMN estado
  ENUM('NUEVO','TRASLADO','PREPARACION','ENTREGA','APROBACION','CERRADO','RECHAZADO',
       'ASISTENCIA','PRESERVACION','ENCOFRADO')
  NOT NULL DEFAULT 'NUEVO';

-- ── 3. Migración de datos ────────────────────────────────────────────────────
START TRANSACTION;

UPDATE asistencias SET estado = 'ASISTENCIA'   WHERE estado = 'TRASLADO';
UPDATE asistencias SET estado = 'PRESERVACION' WHERE estado = 'PREPARACION';
UPDATE asistencias SET estado = 'ENCOFRADO'    WHERE estado = 'ENTREGA';

UPDATE asistencia_historial SET estado_desde = 'ASISTENCIA'   WHERE estado_desde = 'TRASLADO';
UPDATE asistencia_historial SET estado_desde = 'PRESERVACION' WHERE estado_desde = 'PREPARACION';
UPDATE asistencia_historial SET estado_desde = 'ENCOFRADO'    WHERE estado_desde = 'ENTREGA';

UPDATE asistencia_historial SET estado_hasta = 'ASISTENCIA'   WHERE estado_hasta = 'TRASLADO';
UPDATE asistencia_historial SET estado_hasta = 'PRESERVACION' WHERE estado_hasta = 'PREPARACION';
UPDATE asistencia_historial SET estado_hasta = 'ENCOFRADO'    WHERE estado_hasta = 'ENTREGA';

-- ── 3. Verificación (esperado: ningún registro con nombres viejos) ───────────
SELECT 'DESPUES — restos en asistencias' AS info, estado, COUNT(*) AS n
FROM asistencias
WHERE estado IN ('TRASLADO','PREPARACION','ENTREGA')
GROUP BY estado;

SELECT 'DESPUES — restos en historial (desde)' AS info, estado_desde AS estado, COUNT(*) AS n
FROM asistencia_historial
WHERE estado_desde IN ('TRASLADO','PREPARACION','ENTREGA')
GROUP BY estado_desde;

SELECT 'DESPUES — restos en historial (hasta)' AS info, estado_hasta AS estado, COUNT(*) AS n
FROM asistencia_historial
WHERE estado_hasta IN ('TRASLADO','PREPARACION','ENTREGA')
GROUP BY estado_hasta;

-- Si los 3 SELECT anteriores devuelven 0 filas: COMMIT.
-- Si algo salió mal: ROLLBACK;

COMMIT;

-- ── 4. Contraer ENUM: eliminar los valores viejos ────────────────────────────
ALTER TABLE asistencias MODIFY COLUMN estado
  ENUM('NUEVO','ASISTENCIA','PRESERVACION','ENCOFRADO','APROBACION','CERRADO','RECHAZADO')
  NOT NULL DEFAULT 'NUEVO';

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK MANUAL (si ya se hizo COMMIT y hay que volver atrás)
-- ─────────────────────────────────────────────────────────────────────────────
-- START TRANSACTION;
-- UPDATE asistencias SET estado = 'TRASLADO'    WHERE estado = 'ASISTENCIA';
-- UPDATE asistencias SET estado = 'PREPARACION' WHERE estado = 'PRESERVACION';
-- UPDATE asistencias SET estado = 'ENTREGA'     WHERE estado = 'ENCOFRADO';
-- UPDATE asistencia_historial SET estado_desde = 'TRASLADO'    WHERE estado_desde = 'ASISTENCIA';
-- UPDATE asistencia_historial SET estado_desde = 'PREPARACION' WHERE estado_desde = 'PRESERVACION';
-- UPDATE asistencia_historial SET estado_desde = 'ENTREGA'     WHERE estado_desde = 'ENCOFRADO';
-- UPDATE asistencia_historial SET estado_hasta = 'TRASLADO'    WHERE estado_hasta = 'ASISTENCIA';
-- UPDATE asistencia_historial SET estado_hasta = 'PREPARACION' WHERE estado_hasta = 'PRESERVACION';
-- UPDATE asistencia_historial SET estado_hasta = 'ENTREGA'     WHERE estado_hasta = 'ENCOFRADO';
-- COMMIT;
