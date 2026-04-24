const jwt                = require('jsonwebtoken')
const { autenticarLDAP } = require('../services/ldap.service')

async function login(req, res, next) {
  try {
    const { usuario, password } = req.body
    if (!usuario || !password)
      return res.status(400).json({ mensaje: 'Usuario y contraseña son requeridos' })

    const userData = await autenticarLDAP(usuario, password)

    const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '8h' })

    res.json({ token, user: userData })
  } catch (err) {
    res.status(401).json({ mensaje: err.message })
  }
}

function me(req, res) {
  res.json({ user: req.user })
}

module.exports = { login, me }
