/**
 * h360/routes/usuarios.routes.js
 * Endpoints de consulta de usuarios del directorio activo para H360.
 */
const router = require('express').Router()
const { listarMiembrosGrupo } = require('../services/ldap.service')

// Grupos cuyos miembros conducen. Los asistentes externos conducen y además
// hacen la asistencia, así que el conductor del F-01 es quien queda a cargo del
// caso; por eso el rol viaja con cada opción.
const GRUPOS_CONDUCTORES = [
  { envVar: 'LDAP_GROUP_ASIST_TANATOLOGO', rol: 'asistente_tanatologo' },
  { envVar: 'LDAP_GROUP_ASISTENTE',        rol: 'asistente' },
]

/**
 * GET /api/h360/usuarios/conductores
 * Opciones del selector de conductor en F-01 y en el despacho.
 * Cada una trae `usuario` (lo que se guarda) y `rol` (de qué grupo salió).
 */
router.get('/conductores', async (req, res) => {
  const porUsuario = new Map()

  for (const { envVar, rol } of GRUPOS_CONDUCTORES) {
    const grupo = process.env[envVar]
    if (!grupo) continue
    try {
      for (const m of await listarMiembrosGrupo(grupo)) {
        // Si alguien está en los dos grupos gana el primero, que es el de más
        // alcance y el que le daría el login.
        if (!porUsuario.has(m.usuario)) porUsuario.set(m.usuario, { ...m, rol })
      }
    } catch (err) {
      // Que falle un grupo no debe dejar el formulario sin opciones.
      console.error(`[usuarios/conductores] ${envVar}:`, err.message)
    }
  }

  const conductores = [...porUsuario.values()].sort((a, b) =>
    String(a.nombre || a.usuario).localeCompare(String(b.nombre || b.usuario), 'es'))
  res.json(conductores)
})

module.exports = router
