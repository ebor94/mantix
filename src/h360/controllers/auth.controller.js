const jwt                = require('jsonwebtoken')
const { autenticarLDAP } = require('../services/ldap.service')

const EXPIRA = () => process.env.JWT_EXPIRES || '8h'

const firmar = (datos) =>
  jwt.sign(datos, process.env.JWT_SECRET, { expiresIn: EXPIRA() })

async function login(req, res, next) {
  try {
    const { usuario, password } = req.body
    if (!usuario || !password)
      return res.status(400).json({ mensaje: 'Usuario y contraseña son requeridos' })

    const userData = await autenticarLDAP(usuario, password)

    // Entra con el rol de más alcance. Si tiene varios, la pantalla de ingreso
    // le pregunta y llama a /auth/rol para cambiarlo.
    res.json({ token: firmar(userData), user: userData })
  } catch (err) {
    res.status(401).json({ mensaje: err.message })
  }
}

/**
 * POST /auth/rol — cambia el rol activo sin volver a pedir la contraseña.
 *
 * Los roles permitidos vienen firmados dentro del token, así que no hay que
 * volver a consultar el directorio ni se puede pedir un rol que no se tenga:
 * el token no se puede alterar sin la llave.
 *
 * Un token emitido antes de este cambio no trae `roles`; en ese caso se
 * rechaza con un mensaje que dice qué hacer, en vez de dejarlo sin rol.
 */
function cambiarRol(req, res) {
  const { rol } = req.body
  const { usuario, nombre, email, roles } = req.user

  if (!Array.isArray(roles) || !roles.length)
    return res.status(409).json({
      mensaje: 'Tu sesión es anterior a este cambio. Vuelve a iniciar sesión para elegir el rol.',
    })
  if (!roles.includes(rol))
    return res.status(403).json({ mensaje: 'No tienes ese rol asignado en el directorio.' })

  const userData = { usuario, nombre, email, rol, roles }
  res.json({ token: firmar(userData), user: userData })
}

function me(req, res) {
  res.json({ user: req.user })
}

module.exports = { login, cambiarRol, me }
