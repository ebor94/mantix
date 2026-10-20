// ============================================
// Socket.IO de TRIKIPELUDOS: namespace /trk sobre el servidor HTTP de Mantix.
// Rooms: admin | cabina | comentarista | jurado (con token) · pantalla (sin token).
// Toda carga con participante se serializa por room (RNF-5). Para rooms PUBLICO el reenvío es
// fail-closed: se eliminan datos del responsable a cualquier profundidad y los participantes no
// visibles (spec §4: INSCRITO/AUSENTE o fusionados) no se envían (I3).
// ============================================
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { bus } = require('./bus');
const { resolverSesion } = require('../middleware/trkAuth');
const { permisosTrk } = require('../utils/permisos');
const { serializarParticipante } = require('../utils/serializar');
const { ESTADOS_VISIBLES_PUBLICO } = require('../config/constantes');
const { errorParaLog } = require('../utils/errorSeguro');
const logger = require('../../utils/logger');

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

const nivelDe = (room) => NIVEL_POR_ROOM[room] || 'PUBLICO';
const plano = (v) => (v && typeof v.get === 'function' ? v.get({ plain: true }) : v);
const esObjetoPlano = (v) => v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v));

function serializarPayload(payload, room) {
  if (!payload || !payload.participante) return payload;
  return { ...payload, participante: serializarParticipante(payload.participante, nivelDe(room)) };
}

// Claves que nunca salen a rooms PUBLICO, vengan donde vengan (fail-closed ante filas crudas).
const CLAVES_SOLO_COMPLETO = new Set([
  'categoria_propuesta_id', 'notas_importacion', 'advertencias_importacion', 'autoriza_datos', 'autoriza_reglamento', 'fecha_inscripcion'
]);
const claveVedada = (k) => (k.startsWith('responsable_') && k !== 'responsable_primer_nombre') || CLAVES_SOLO_COMPLETO.has(k);

function despojar(valor) {
  const v = plano(valor);
  if (Array.isArray(v)) return v.map(despojar);
  if (!esObjetoPlano(v)) return v;
  const salida = {};
  for (const [k, x] of Object.entries(v)) if (!claveVedada(k)) salida[k] = despojar(x);
  return salida;
}

const visiblePublico = (p) => ESTADOS_VISIBLES_PUBLICO.includes(p.estado) && !p.fusionado_en_id;

// Carga para una room, o null si esa room no debe recibir el evento.
function cargaParaRoom(evento, payload, room) {
  if (nivelDe(room) === 'COMPLETO') return serializarPayload(payload, room);
  if (room === 'pantalla' && evento === 'participante:actualizado') return null; // la pantalla no lo usa
  const participante = payload && payload.participante ? plano(payload.participante) : null;
  if (participante && !visiblePublico(participante)) {
    // Solo la baja (para quitarlo de listas ya cargadas); nada de datos.
    return evento === 'participante:actualizado' ? { participante: { id: participante.id, estado: 'OCULTO' } } : null;
  }
  return despojar(serializarPayload(payload, room));
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
      const { exp } = jwt.decode(token) || {};
      if (exp) socket.data.exp = exp;
      return next();
    } catch (e) {
      return next(new Error('NO_AUTENTICADO'));
    }
  });

  const MAX_TIMER = 2 ** 31 - 1;
  nsp.on('connection', (socket) => {
    socket.join(socket.data.rooms);
    // I4 (respaldo): la sesión no sobrevive al vencimiento del token.
    if (socket.data.exp) {
      const ms = Math.min(Math.max(socket.data.exp * 1000 - Date.now(), 0), MAX_TIMER);
      const t = setTimeout(() => socket.disconnect(true), ms);
      socket.on('disconnect', () => clearTimeout(t));
    }
  });

  // I4: PIN regenerado o usuario desactivado → cerrar sus sockets abiertos.
  const revocar = async (usuarioId) => {
    try {
      const sockets = await nsp.fetchSockets();
      for (const s of sockets) if (s.data.usuarioId === usuarioId) s.disconnect(true);
    } catch (e) {
      logger.child({ modulo: 'trk' }).error('trk socket: fallo al revocar sesiones', errorParaLog(e));
    }
  };
  bus.on('trk:revocar', revocar);

  // Nunca lanza: el bus es síncrono y el servicio ya hizo commit (M3).
  const reenviar = ({ evento, payload, rooms }) => {
    for (const room of rooms) {
      try {
        const carga = cargaParaRoom(evento, payload, room);
        if (carga !== null) nsp.to(room).emit(evento, carga);
      } catch (e) {
        logger.child({ modulo: 'trk' }).error('trk socket: fallo al reenviar', { evento, room, ...errorParaLog(e) });
      }
    }
  };
  bus.on('trk', reenviar);

  io.trkCerrar = () => {
    bus.off('trk', reenviar);
    bus.off('trk:revocar', revocar);
    io.close();
  };
  return io;
}

module.exports = { attach, roomsDe, cargaParaRoom, NIVEL_POR_ROOM };
