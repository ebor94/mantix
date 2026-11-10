-- Usuario de mínimo privilegio para el módulo Masajes (spec §17.8). Lo ejecuta el DBA, DESPUÉS de
-- `npm run masajes:migrate` (las tablas deben existir para otorgar permisos por tabla).
-- Reemplazar <BASE> (por defecto serfuweb), <HOST_BACKEND> (IP o host de srv-backend; evitar '%')
-- y la contraseña. La contraseña va en MSJ_DB_PASSWORD del .env, nunca en el repo.
--
-- Las migraciones NO usan este usuario: corren con DB_USER (tiene DDL).

CREATE USER IF NOT EXISTS 'mantix_masajes'@'<HOST_BACKEND>' IDENTIFIED BY '<CONTRASEÑA_LARGA_ALEATORIA>';

-- Baja lógica (activo = 0): sin DELETE.
GRANT SELECT, INSERT, UPDATE ON <BASE>.msj_beneficiarios  TO 'mantix_masajes'@'<HOST_BACKEND>';
GRANT SELECT, INSERT, UPDATE ON <BASE>.msj_semanas        TO 'mantix_masajes'@'<HOST_BACKEND>';
-- El admin puede quitar un bloqueo (spec §5.2).
GRANT SELECT, INSERT, UPDATE, DELETE ON <BASE>.msj_bloqueos TO 'mantix_masajes'@'<HOST_BACKEND>';
-- Cancelar es un cambio de estado, no un borrado.
GRANT SELECT, INSERT, UPDATE ON <BASE>.msj_citas          TO 'mantix_masajes'@'<HOST_BACKEND>';
GRANT SELECT, INSERT, UPDATE ON <BASE>.msj_notificaciones TO 'mantix_masajes'@'<HOST_BACKEND>';
-- Auditoría de solo inserción: la app no puede alterar ni borrar el historial.
GRANT SELECT, INSERT         ON <BASE>.msj_cita_historial TO 'mantix_masajes'@'<HOST_BACKEND>';

-- Sin permisos sobre ninguna otra tabla de la base (usuarios, afiliados, H360, Portería…).
-- Si más adelante se agrega la purga por retención (spec §17.5), hacerla con un usuario o job aparte.

-- Comprobación:
-- SHOW GRANTS FOR 'mantix_masajes'@'<HOST_BACKEND>';
