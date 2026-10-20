// ============================================
// Socket.IO de TRIKIPELUDOS: namespace /trk sobre el servidor HTTP de Mantix.
// Rooms: admin | cabina | comentarista | jurado (con token) · pantalla (sin token).
// Toda carga con participante se serializa por room (RNF-5).
// ============================================
const { Server } = require('socket.io');
const { bus } = require('./bus');
const { resolverSesion } = require('../middleware/trkAuth');
const { permisosTrk } = require('../utils/permisos');
const { serializarParticipante } = require('../utils/serializar');

const NIVEL_POR_ROOM = { admin: 'COMPLETO', cabina: 'COMPLETO', comentarista: 'PUBLICO', jurado: 'PUBLICO', pantalla: 'PUBLICO' };

function roomsDe(usuario) {
  const p = permisosTrk(usuario);
  if (p.administrar) return ['admin'];
  const rooms = [];
  if (p.cabina) rooms.push('cabina');
  if (p.pasarela) rooms.push('comentarista');
  if (p.calificar) rooms.push('jurado');
  return rooms.length ? rooms : ['pantalla'];
}

function serializarPayload(payload, room) {
  if (!payload || !payload.participante) return payload;
  return { ...payload, participante: serializarParticipante(payload.participante, NIVEL_POR_ROOM[room]) };
}

function attach(httpServer, opciones = {}) {
  const io = new Server(httpServer, { path: '/socket.io', cors: { origin: true }, ...opciones });
  const nsp = io.of('/trk');

  nsp.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) {
        socket.data.rooms = ['pantalla'];
        return next();
      }
      const sesion = await resolverSesion(token);
      if (!sesion) return next(new Error('NO_AUTENTICADO'));
      socket.data.rooms = roomsDe(sesion.usuario);
      socket.data.usuarioId = sesion.usuario.id;
      return next();
    } catch (e) {
      return next(new Error('NO_AUTENTICADO'));
    }
  });

  nsp.on('connection', (socket) => socket.join(socket.data.rooms));

  const reenviar = ({ evento, payload, rooms }) => {
    for (const room of rooms) nsp.to(room).emit(evento, serializarPayload(payload, room));
  };
  bus.on('trk', reenviar);

  io.trkCerrar = () => {
    bus.off('trk', reenviar);
    io.close();
  };
  return io;
}

module.exports = { attach, roomsDe, NIVEL_POR_ROOM };
