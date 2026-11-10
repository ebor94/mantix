-- Auditoría de las acciones del admin sobre beneficiarios (vincular/desvincular AD, activar/desactivar).
-- Igual que autovinculacion, no llevan cita (ck_msj_historial_cita se amplía).
ALTER TABLE msj_cita_historial
  MODIFY accion ENUM('creada','reprogramada','cancelada','asistencia','autovinculacion',
                     'vinculacion','desvinculacion','activacion','desactivacion') NOT NULL;

ALTER TABLE msj_cita_historial DROP CHECK ck_msj_historial_cita;
ALTER TABLE msj_cita_historial ADD CONSTRAINT ck_msj_historial_cita
  CHECK (accion IN ('autovinculacion','vinculacion','desvinculacion','activacion','desactivacion') OR cita_id IS NOT NULL);
