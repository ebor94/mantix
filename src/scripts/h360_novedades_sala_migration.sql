-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — Novedades con el ser querido también en salas de velación
--
-- Las novedades existían solo para homenajes en residencia, en una tabla
-- amarrada a ese origen. El asistente tanatólogo las resuelve todas desde la
-- misma bandeja (/novedades-externas), así que partirlas en dos tablas
-- obligaría a unir consultas y a inventar identificadores compuestos para
-- distinguir "la novedad 7 de sala" de "la novedad 7 de residencia".
--
-- Queda una sola tabla con el origen como columna. Sin llave foránea sobre
-- homenaje_id: apunta a dos tablas distintas según el origen, y es el precio
-- de tener una sola bandeja. La integridad la cuida el controlador, que
-- verifica que el homenaje exista antes de insertar.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS h360_homenaje_novedades (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  origen              ENUM('RESIDENCIA','SALA') NOT NULL,
  homenaje_id         INT          NOT NULL,   -- homenajes_residencia.id | homenajes_sala.id
  fecha_reporte       DATE         NOT NULL,
  hora_reporte        TIME         NULL,
  descripcion_novedad TEXT         NULL,
  asignado_a          VARCHAR(100) NULL,
  asignado_a_nombre   VARCHAR(200) NULL,
  estado              ENUM('PENDIENTE','RESUELTA') NOT NULL DEFAULT 'PENDIENTE',
  resuelto_at         TIMESTAMP    NULL,
  asistente_homenajes VARCHAR(100) NULL,
  hora_llegada        TIME         NULL,
  hora_retiro         TIME         NULL,
  actividad_realizada TEXT         NULL,
  firma_cliente       LONGTEXT     NULL,
  firma_asistente     LONGTEXT     NULL,
  created_by          VARCHAR(50)  NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_novedad_homenaje (origen, homenaje_id),
  -- La bandeja del asistente filtra por asignado + estado; es su consulta de cada entrada.
  KEY idx_novedad_asignado (asignado_a, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Las que ya existían. Se conserva el id: homenaje_residencia_auditoria.novedad_id
-- apunta a él y si se renumeran, el historial queda señalando a otra novedad.
INSERT INTO h360_homenaje_novedades
  (id, origen, homenaje_id, fecha_reporte, hora_reporte, descripcion_novedad,
   asignado_a, asignado_a_nombre, estado, resuelto_at, asistente_homenajes,
   hora_llegada, hora_retiro, actividad_realizada, firma_cliente, firma_asistente,
   created_by, created_at)
SELECT
   id, 'RESIDENCIA', homenaje_residencia_id, fecha_reporte, hora_reporte, descripcion_novedad,
   asignado_a, asignado_a_nombre, estado, resuelto_at, asistente_homenajes,
   hora_llegada, hora_retiro, actividad_realizada, firma_cliente, firma_asistente,
   created_by, created_at
FROM homenaje_residencia_novedades
ON DUPLICATE KEY UPDATE h360_homenaje_novedades.id = h360_homenaje_novedades.id;

-- La auditoría de sala tiene que poder registrar novedades, igual que la de
-- residencia, que ya traía 'NOVEDAD' en el enum.
ALTER TABLE homenaje_sala_auditoria
  MODIFY COLUMN seccion ENUM('INGRESO','SALIDA','VISITA','NOVEDAD') NOT NULL;

ALTER TABLE homenaje_sala_auditoria
  ADD COLUMN novedad_id INT NULL AFTER visita_id;

-- homenaje_residencia_novedades se deja como estaba, sin tocar: si algo sale
-- mal con la tabla nueva, los datos originales siguen ahí. Se puede eliminar
-- cuando el módulo lleve unos días funcionando.
