-- Verificación de solo lectura de la base de producción antes de migrar Portería.
-- La corre TI con el usuario de Mantix (DB_USER) contra la base de Mantix (DB_NAME, por defecto serfuweb):
--   mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < src/porteria/scripts/verificarProduccion.sql
-- Cada consulta devuelve (chequeo, valor, ok). ok = 'NO' detiene el despliegue; 'REVISAR' se anota y se decide.
-- No escribe nada.

-- FOR UPDATE OF exige MySQL >= 8.0.1 (MariaDB y 5.7 no lo aceptan).
SELECT 'version' AS chequeo, VERSION() AS valor,
       CASE WHEN VERSION() LIKE '%MariaDB%' THEN 'NO'
            WHEN CAST(SUBSTRING_INDEX(v, '.', 1) AS UNSIGNED) * 10000
               + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(v, '.', 2), '.', -1) AS UNSIGNED) * 100
               + CAST(SUBSTRING_INDEX(v, '.', -1) AS UNSIGNED) >= 80001 THEN 'SI'
            ELSE 'NO' END AS ok
  FROM (SELECT SUBSTRING_INDEX(VERSION(), '-', 1) AS v) AS x;

-- El módulo fija time_zone '-05:00' en cada conexión; se anota la del servidor.
SELECT 'time_zone_global' AS chequeo, @@global.time_zone AS valor, 'REVISAR' AS ok;

-- Las esperas de bloqueo comparten el pool de 10 conexiones; compararlo con el timeout de nginx/Apache.
SELECT 'innodb_lock_wait_timeout' AS chequeo, @@innodb_lock_wait_timeout AS valor,
       CASE WHEN @@innodb_lock_wait_timeout <= 50 THEN 'SI' ELSE 'REVISAR' END AS ok;

-- Las tablas por_* se crean con utf8mb4_unicode_ci; vehiculos.placa se compara con por_*.placa.
SELECT 'collation_base' AS chequeo, DEFAULT_COLLATION_NAME AS valor,
       CASE WHEN DEFAULT_CHARACTER_SET_NAME = 'utf8mb4' THEN 'SI' ELSE 'REVISAR' END AS ok
  FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE();

-- Agregado con COALESCE: si falta la tabla o la columna igual devuelve una fila (valor 'NO EXISTE').
SELECT 'collation_vehiculos.placa' AS chequeo, COALESCE(MAX(COLLATION_NAME), 'NO EXISTE') AS valor,
       CASE WHEN MAX(COLLATION_NAME) = 'utf8mb4_unicode_ci' THEN 'SI'
            WHEN COUNT(*) = 0 THEN 'NO' ELSE 'REVISAR' END AS ok
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'placa';

-- La búsqueda de exequias (hoy ±1 día) asume que fecha es DATE.
SELECT 'exequias.fecha' AS chequeo, COALESCE(MAX(DATA_TYPE), 'NO EXISTE') AS valor,
       CASE WHEN MAX(DATA_TYPE) = 'date' THEN 'SI' ELSE 'NO' END AS ok
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exequias' AND COLUMN_NAME = 'fecha';

-- (BINARY: con utf8mb4_unicode_ci un espacio normal coincide con el no separable y daría falsos positivos.)
-- Placas con tabulaciones o espacios no separables: la normalización no las reconocería.
SELECT 'placas_con_espacios_raros' AS chequeo, COUNT(*) AS valor, CASE WHEN COUNT(*) = 0 THEN 'SI' ELSE 'REVISAR' END AS ok
  FROM vehiculos
 WHERE BINARY placa LIKE CONCAT('%', CHAR(9), '%') OR BINARY placa LIKE CONCAT('%', UNHEX('C2A0'), '%');

-- Permisos del usuario sobre la base: SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES y
-- CREATE VIEW (o ALL PRIVILEGES). DROP: la migración 003 reemplaza la vista y el deshacer borra tablas/vista.
-- Si los privilegios llegan por roles de MySQL, SHOW GRANTS FOR CURRENT_USER solo lista los roles:
-- correr SHOW GRANTS FOR CURRENT_USER USING <rol>; para ver los efectivos.
SHOW GRANTS FOR CURRENT_USER;
