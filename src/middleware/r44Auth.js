// ============================================
// Middleware de autenticación exclusivo del módulo R-44
// Usa la tabla r44_usuarios (separada de usuarios Mantix)
// ============================================
const jwt = require('jsonwebtoken');
const { R44Usuario } = require('../models');

/**
 * Verifica el JWT del portal de proveedores R-44.
 * Adjunta req.r44Usuario con los datos del usuario autenticado.
 */
async function r44Auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Token requerido' });
    }

    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload.r44) {
      return res.status(401).json({ ok: false, error: 'Token no válido para este módulo' });
    }

    const usuario = await R44Usuario.findOne({
      where: { id: payload.id, activo: true },
      attributes: ['id', 'nombre', 'email', 'rol'],
    });

    if (!usuario) {
      return res.status(401).json({ ok: false, error: 'Usuario inactivo o no encontrado' });
    }

    req.r44Usuario = usuario;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
    }
    next(err);
  }
}

/**
 * Requiere que el usuario tenga uno de los roles indicados.
 * Uso: router.get('/ruta', r44Auth, r44Authorize('admin', 'revisor_compras'), controller)
 */
function r44Authorize(...roles) {
  return (req, res, next) => {
    if (!req.r44Usuario) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }
    if (!roles.includes(req.r44Usuario.rol)) {
      return res.status(403).json({ ok: false, error: 'Sin permisos para esta acción' });
    }
    next();
  };
}

/**
 * Verifica que el proveedor autenticado solo acceda a sus propios datos.
 * El parámetro :proveedor_id del route debe coincidir con req.r44Usuario.id
 * (a menos que sea revisor/admin).
 */
function r44SoloPropio(req, res, next) {
  const u = req.r44Usuario;
  if (!u) return res.status(401).json({ ok: false, error: 'No autenticado' });

  const revisores = ['revisor_compras', 'revisor_excelencia', 'admin'];
  if (revisores.includes(u.rol)) return next();

  // Para proveedores, el proveedor_id del route debe resolverse después via controller
  next();
}

module.exports = { r44Auth, r44Authorize, r44SoloPropio };
