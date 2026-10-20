-- Marca "esta asistencia no requiere exequias".
--
-- Sin esto, una asistencia que nunca va a tener exequia se queda para siempre
-- en el panel "Sin exequia programada", que es una lista de trabajo pendiente.
-- Misma forma que el desistimiento: motivo, quién y cuándo, para poder auditar
-- la excepción y revertirla.
ALTER TABLE asistencias
  ADD COLUMN sin_exequias_motivo     TEXT         NULL AFTER orden_servicio_resultado,
  ADD COLUMN sin_exequias_por        VARCHAR(100) NULL AFTER sin_exequias_motivo,
  ADD COLUMN sin_exequias_por_nombre VARCHAR(200) NULL AFTER sin_exequias_por,
  ADD COLUMN sin_exequias_at         TIMESTAMP    NULL AFTER sin_exequias_por_nombre;

-- El panel filtra por esta columna en cada carga.
CREATE INDEX idx_asistencias_sin_exequias ON asistencias (sin_exequias_at);
