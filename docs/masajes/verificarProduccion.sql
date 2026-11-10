-- Verificación de SOLO LECTURA de la base de producción antes de migrar Masajes. No escribe nada.
-- La corre TI con DB_USER contra la base de Mantix (DB_NAME, por defecto serfuweb):
--   mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < docs/masajes/verificarProduccion.sql
-- Cada consulta devuelve (chequeo, valor, ok). ok = 'NO' detiene el despliegue; 'REVISAR' se anota y se decide.

-- >= 8.0.16: los CHECK se aplican. Entre 8.0.1 y 8.0.15 MySQL los ACEPTA PERO LOS IGNORA sin avisar
-- (la regla igual la aplica el código, pero se pierde la red de seguridad). < 8.0.1 no tiene SKIP LOCKED.
SELECT 'version' AS chequeo, VERSION() AS valor,
       CASE WHEN VERSION() LIKE '%MariaDB%' THEN 'NO'
            WHEN n >= 80016 THEN 'SI'
            WHEN n >= 80001 THEN 'REVISAR'
            ELSE 'NO' END AS ok
  FROM (SELECT CAST(SUBSTRING_INDEX(v, '.', 1) AS UNSIGNED) * 10000
             + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(v, '.', 2), '.', -1) AS UNSIGNED) * 100
             + CAST(SUBSTRING_INDEX(v, '.', -1) AS UNSIGNED) AS n
          FROM (SELECT SUBSTRING_INDEX(VERSION(), '-', 1) AS v) AS a) AS x;

-- Ninguna tabla msj_* previa (choque de nombres con otra aplicación).
SELECT 'tablas_msj_existentes' AS chequeo, COUNT(*) AS valor, CASE WHEN COUNT(*) = 0 THEN 'SI' ELSE 'REVISAR' END AS ok
  FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'msj\_%';

-- Modo estricto: sin él, un texto más largo que la columna se trunca en silencio en vez de fallar.
SELECT 'sql_mode_estricto' AS chequeo, @@global.sql_mode AS valor,
       CASE WHEN @@global.sql_mode LIKE '%STRICT_TRANS_TABLES%' OR @@global.sql_mode LIKE '%STRICT_ALL_TABLES%' THEN 'SI' ELSE 'REVISAR' END AS ok;

-- El módulo fija time_zone '-05:00' en cada conexión; se anota la del servidor.
SELECT 'time_zone_global' AS chequeo, @@global.time_zone AS valor, 'REVISAR' AS ok;

-- Las tablas msj_* se crean con utf8mb4_unicode_ci.
SELECT 'collation_base' AS chequeo, DEFAULT_COLLATION_NAME AS valor,
       CASE WHEN DEFAULT_CHARACTER_SET_NAME = 'utf8mb4' THEN 'SI' ELSE 'REVISAR' END AS ok
  FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE();

-- DB_USER debe poder crear tablas y FKs (las migraciones corren con él).
SELECT 'privilegios_db_user' AS chequeo, CURRENT_USER() AS valor, 'REVISAR: SHOW GRANTS debe incluir CREATE, ALTER, INDEX, REFERENCES' AS ok;
