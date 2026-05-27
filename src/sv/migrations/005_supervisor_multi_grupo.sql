-- =====================================================================
-- SerVentas CRM — Migración 005: Supervisor multi-grupo
-- Permite que un supervisor tenga visibilidad sobre N grupos de trabajo.
-- Caso de uso: "Supervisor Previsión" ve EMPRESARIALES + PAP.
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- sv_org_usuario_grupos — pivote N:M (un usuario puede supervisar varios grupos)
-- El grupo "principal" sigue siendo usr_grupo_id; estos son grupos adicionales.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_usuario_grupos (
  usr_id           INT      NOT NULL,
  grupo_id         INT      NOT NULL,
  ug_created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usr_id, grupo_id),
  CONSTRAINT fk_ug_usr   FOREIGN KEY (usr_id)   REFERENCES sv_org_usuarios(usr_id)     ON DELETE CASCADE,
  CONSTRAINT fk_ug_grupo FOREIGN KEY (grupo_id) REFERENCES sv_cfg_grupos_trabajo(grupo_id) ON DELETE CASCADE,
  INDEX idx_ug_grupo (grupo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: grupos adicionales que supervisa un usuario (N:M con sv_org_usuarios)';

-- ---------------------------------------------------------------------
-- Seed: usuario "Supervisor Previsión" + asignación a EMPRESARIALES + PAP
-- ---------------------------------------------------------------------
-- Insertar usuario solo si no existe (idempotente por email único)
INSERT IGNORE INTO sv_org_usuarios
  (usr_area_id, usr_grupo_id, usr_rol_id, usr_punto_id,
   usr_email, usr_nombre, usr_apellido, usr_password_hash, usr_telefono)
VALUES
  (2, 2, 3, 1,
   'supervisor.prevision@serfunorte.com', 'Pedro', 'Supervisor Previsión',
   'PENDING', '301 222 0001');

-- Recuperar el ID por email para el siguiente paso
SET @uid = (SELECT usr_id FROM sv_org_usuarios WHERE usr_email = 'supervisor.prevision@serfunorte.com');

-- Vincular a los dos grupos de Previsión: 2 (EMPRESARIALES) y 3 (PAP)
INSERT IGNORE INTO sv_org_usuario_grupos (usr_id, grupo_id) VALUES
  (@uid, 2),
  (@uid, 3);

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- Verificación
SELECT 'usuario_grupos' AS tabla, COUNT(*) AS registros FROM sv_org_usuario_grupos;
SELECT u.usr_id, u.usr_email,
       GROUP_CONCAT(g.grupo_codigo ORDER BY g.grupo_codigo) AS grupos_supervisados
  FROM sv_org_usuarios u
  JOIN sv_org_usuario_grupos ug ON ug.usr_id = u.usr_id
  JOIN sv_cfg_grupos_trabajo g  ON g.grupo_id = ug.grupo_id
 GROUP BY u.usr_id, u.usr_email;
