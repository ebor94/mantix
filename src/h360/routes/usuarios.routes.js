/**
 * h360/routes/usuarios.routes.js
 * Endpoints de consulta de usuarios del directorio activo para H360.
 */
const router = require('express').Router()
const { listarMiembrosGrupo } = require('../services/ldap.service')

/**
 * GET /api/h360/usuarios/conductores
 * Retorna los miembros activos del grupo LDAP_GROUP_ASIST_TANATOLOGO
 * para usar como opciones en el selector de conductor en F-01.
 */
router.get('/conductores', async (req, res, next) => {
  try {
    const groupName = process.env.LDAP_GROUP_ASIST_TANATOLOGO
    if (!groupName) {
      return res.status(500).json({ mensaje: 'Variable LDAP_GROUP_ASIST_TANATOLOGO no configurada' })
    }
    const miembros = await listarMiembrosGrupo(groupName)
    res.json(miembros)
  } catch (err) {
    console.error('[usuarios/conductores]', err.message)
    // Devolver lista vacía en vez de 500 para no bloquear el formulario
    res.json([])
  }
})

module.exports = router
