/**
 * duelo_atenciones.controller.js
 * Registro de atención psicológica del R-56.
 *
 * El permiso se verifica acá además de en la ruta. Es redundante a propósito:
 * si algún día alguien monta estas funciones en otra ruta y se le olvida el
 * requireRol, el dato sigue protegido. Son 941 atenciones al año sobre
 * familias en duelo; el costo de un `if` de más es nada.
 *
 * Nada de lo que hay en `notas` se escribe a un log.
 */
const svc = require('../services/duelo_atenciones.service')

const ROLES_PERMITIDOS = ['psicologia', 'admin']

function puede(req) {
  return !!req.user && ROLES_PERMITIDOS.includes(req.user.rol)
}

function denegar(res) {
  return res.status(403).json({
    mensaje: 'El registro de atención psicológica solo lo consulta el equipo de psicología.',
  })
}

// Quién atendió sale del login (no del cuerpo) para poder auditarlo. Un token
// válido en rol pero sin nombre de usuario guardaría NULL en `psicologa` y en
// `created_by`, y no habría forma de saber quién atendió: el mismo hueco que
// tenía el Excel, donde ese nombre se escribía a mano. Solo vale un texto con
// contenido; cualquier otra cosa (ausente, null, vacío, solo espacios, número,
// objeto, arreglo) se trata como «no hay usuario».
function usuarioDelLogin(req) {
  const u = req.user.usuario
  return typeof u === 'string' && u.trim() !== '' ? u : null
}

function sinUsuario(res) {
  return res.status(403).json({
    mensaje: 'No se pudo identificar a la persona que registra la atención: ' +
      'la sesión no trae el nombre de usuario. Cierra sesión, ingresa de nuevo ' +
      'y, si persiste, avisa a soporte.',
  })
}

// GET /api/h360/duelo/gestion/:id/atenciones
async function listar(req, res, next) {
  if (!puede(req)) return denegar(res)
  try {
    const data = await svc.atencionesDeGestion(req.params.id)
    res.json({ data })
  } catch (err) { next(err) }
}

// POST /api/h360/duelo/gestion/:id/atenciones
async function crear(req, res, next) {
  if (!puede(req)) return denegar(res)
  const psicologa = usuarioDelLogin(req)
  if (!psicologa) return sinUsuario(res)
  try {
    const id = await svc.crearAtencion(req.params.id, {
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
