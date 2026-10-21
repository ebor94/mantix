-- Requiere MySQL 8.0.16+.
-- Usuarios de BD con privilegios mínimos. TODO ESTÁ COMENTADO a propósito:
-- no se ejecuta por accidente. Edwin lo ejecuta manualmente (como administrador)
-- tras descomentar y reemplazar los marcadores, contra la base `serfuweb`.
-- Las contraseñas reales van SOLO en .env / gestor de contraseñas; nunca en el repo.
-- Cambiar 'localhost' por el host desde el que se conectan la API / Superset.

-- Usuario de la API: solo INSERT y SELECT sobre su tabla.
-- CREATE USER IF NOT EXISTS 'bigday_api'@'localhost' IDENTIFIED BY '<CAMBIAR_CONTRASEÑA>';
-- GRANT INSERT, SELECT ON serfuweb.bigday_respuestas TO 'bigday_api'@'localhost';

-- (Opcional) Usuario de Superset: solo lectura sobre la vista.
-- CREATE USER IF NOT EXISTS 'bigday_superset'@'localhost' IDENTIFIED BY '<CAMBIAR_CONTRASEÑA>';
-- GRANT SELECT ON serfuweb.vw_bigday_resumen TO 'bigday_superset'@'localhost';

-- FLUSH PRIVILEGES;
