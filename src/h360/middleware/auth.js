/**
 * h360/middleware/auth.js
 * Middleware de autenticación exclusivo para rutas H360.
 * Los tokens H360 se generan con LDAP y contienen { usuario, nombre, email, rol }.
 * Son distintos a los tokens de mantix (que contienen { id, email } de la BD).
 */
const jwt = require('jsonwebtoken')

function verifyToken(req, res, next) {
  const auth  = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  if (!token) {
    return res.status(401).json({ mensaje: 'Token requerido' })
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ mensaje: 'Token inválido o expirado' })
  }
}

function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ mensaje: `Acceso denegado. Roles permitidos: ${roles.join(', ')}` })
    }
    next()
  }
}

module.exports = { verifyToken, requireRol }
