const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const DueloError = require('../utils/DueloError');

const ROL = 'panel_duelo';

const firmarToken = (config) => jwt.sign({ rol: ROL }, config.jwtSecret, { expiresIn: config.jwtExpires });

// Comparación en tiempo constante sobre el hash (timingSafeEqual exige la misma longitud).
const huella = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
const iguales = (a, b) => crypto.timingSafeEqual(huella(a), huella(b));

function credencialesValidas(config, usuario, clave) {
  const usuarioOk = iguales(usuario, config.panel.usuario);
  const claveOk = iguales(clave, config.panel.clave);
  return usuarioOk && claveOk;
}

const crearAutenticacion = (obtenerConfig) => (req, res, next) => {
  try {
    const coincide = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
    const carga = jwt.verify(coincide[1], obtenerConfig().jwtSecret);
    if (carga.rol !== ROL) throw new Error('rol');
    return next();
  } catch {
    return next(new DueloError(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar'));
  }
};

module.exports = { firmarToken, credencialesValidas, crearAutenticacion };
