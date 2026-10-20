// Bus interno de eventos TRK. Los servicios emiten aquí; sockets/index.js reenvía a Socket.IO
// serializando por room. Así los servicios no dependen de Socket.IO y se prueban sin red.
const { EventEmitter } = require('events');

const ROOMS_TODAS = ['admin', 'cabina', 'comentarista', 'jurado', 'pantalla'];
const bus = new EventEmitter();
bus.setMaxListeners(50);

function emitir(evento, payload, { rooms = ROOMS_TODAS } = {}) {
  bus.emit('trk', { evento, payload, rooms });
}

// I4: tras regenerar PIN o desactivar un usuario, sockets/index.js cierra sus conexiones abiertas.
function revocarSesiones(usuarioId) {
  bus.emit('trk:revocar', Number(usuarioId));
}

module.exports = { bus, emitir, revocarSesiones, ROOMS_TODAS };
