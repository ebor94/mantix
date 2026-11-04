-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — El Ser Querido que llega desde otra ciudad
--
-- Hasta ahora toda asistencia suponía un traslado nuestro: alguien sale, lo
-- recoge y lo trae. Pero hay casos donde el Ser Querido llega al laboratorio
-- por su cuenta, traído desde otra ciudad por quien lo atendió allá. Ahí no
-- hay a quién asignar como conductor, y obligar a poner uno hacía que quedara
-- a cargo del caso alguien que nunca manejó.
--
-- No se confunde con traslado_otra_ciudad, que es lo contrario: ese es el que
-- SALE de aquí hacia otra ciudad y por eso no se vela acá. Este ENTRA. Uno
-- habla del destino y el otro del origen, y una misma asistencia podría tener
-- los dos.
--
-- La columna va al lado de las otras dos banderas del mismo bloque del F-01
-- para que quien lea la tabla las encuentre juntas.
--
-- NOT NULL con default 0: las 289 asistencias que ya existen sí tuvieron
-- traslado nuestro, así que 0 es la respuesta correcta para todas y no hay
-- que rellenar nada a mano.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE asistencias
  ADD COLUMN viene_otra_ciudad TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'El Ser Querido llega al laboratorio desde otra ciudad: no hay traslado nuestro ni conductor'
    AFTER destino_final_directo;

-- Comprobación: tiene que dar 289 en 0 y 0 en 1.
--   SELECT viene_otra_ciudad, COUNT(*) FROM asistencias GROUP BY viene_otra_ciudad;
