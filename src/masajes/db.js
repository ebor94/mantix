// Pool mysql2 propio del módulo, perezoso, con time_zone -05:00 en cada conexión (spec §6.5).
// Reutiliza la implementación de Portería: es genérica (recibe la configuración) y así no divergen.
// El pool de Masajes es una instancia distinta, con el usuario de mínimo privilegio MSJ_DB_USER si está definido.
module.exports = require('../porteria/db');
