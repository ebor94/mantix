/**
 * duelo_atenciones.controller.js
 * Registro de atención psicológica del R-56.
 *
 * El permiso se verifica acá además de en la ruta. Es redundante a propósito:
 * si algún día alguien monta estas funciones en otra ruta y se le olvida el
 * requireRol, el dato sigue protegido. Son 941 atenciones al año sobre
 * familias en duelo; el costo de un `if` de más es nada.
 *
 * Nada de lo que viaja en el cuerpo de una atención se escribe a un log: ni
 * `notas` ni `motivo`, y tampoco quién fue atendido (`atendido_nombre`,
 * `atendido_parentesco`) ni `acompanante`, que ligados a una atención
 * psicológica también son dato de salud.
 */
const svc = require('../services/duelo_atenciones.service')
// Quién hace el registro y sobre qué gestión: las mismas guardas que usa el
// controlador de la gestión, en un solo lugar (ver duelo.peticion.js).
const { usuarioDelLogin, sinUsuario, leerId } = require('../utils/duelo.peticion')

const ROLES_PERMITIDOS = ['psicologia', 'admin']

function puede(req) {
  return !!req.user && ROLES_PERMITIDOS.includes(req.user.rol)
}

function denegar(res) {
  return res.status(403).json({
    mensaje: 'El registro de atención psicológica solo lo consulta el equipo de psicología.',
  })
}

// Quién atendió sale del login (no del cuerpo) para poder auditarlo: lo lee
// usuarioDelLogin, y sinUsuario es el 403 que explica qué hacer cuando la sesión
// no trae nombre. Las dos viven en utils/duelo.peticion.js porque el controlador
// de la gestión escribe las mismas columnas NOT NULL desde el mismo login.

// GET /api/h360/duelo/gestion/:id/atenciones
async function listar(req, res, next) {
  if (!puede(req)) return denegar(res)
  try {
    // El id se valida antes de la consulta: uno no numérico no coincide con nada
    // y la lista vacía se leería como «esta familia no tiene atenciones».
    const data = await svc.atencionesDeGestion(leerId(req.params.id))
    res.json({ data })
  } catch (err) {
    if (err?.status === 400) return res.status(400).json({ mensaje: err.message })
    next(err)
  }
}

// POST /api/h360/duelo/gestion/:id/atenciones
async function crear(req, res, next) {
  if (!puede(req)) return denegar(res)
  const psicologa = usuarioDelLogin(req)
  if (!psicologa) return sinUsuario(res)
  try {
    const id = await svc.crearAtencion(leerId(req.params.id), {
      momento:             req.body?.momento,
      modalidad:           req.body?.modalidad,
      // Del login, no del cuerpo.
      psicologa,
      acompanante:         req.body?.acompanante ?? null,
      atendido_nombre:     req.body?.atendido_nombre ?? null,
      atendido_parentesco: req.body?.atendido_parentesco ?? null,
      motivo:              req.body?.motivo ?? null,
      notas:               req.body?.notas ?? null,
      created_by:          psicologa,
    })
    res.status(201).json({ id })
  } catch (err) {
    if (err?.status === 400) return res.status(400).json({ mensaje: err.message })
    // El mensaje del error no lleva el cuerpo, pero mysql2 le cuelga la
    // sentencia ya armada en `err.sql`, con los valores adentro, y ahí van las
    // notas. Se quita antes de pasarlo a next para que ningún manejador ni
    // logger que serialice el error se las lleve.
    if (err?.sql) delete err.sql
    next(err)
  }
}

module.exports = { listar, crear }
