const convenioService = require('../services/convenio.service');
const invitacionService = require('../services/invitacion.service');
const AppError = require('../utils/AppError');

/**
 * GET /api/convenios/publico/:slug
 *
 * Configuración que necesita el formulario público. Sin autenticación: la URL
 * del convenio es pública por diseño.
 *
 * Devuelve la proyección de Convenio.toPublicJSON(), que deliberadamente NO
 * incluye `contacto.googleChat` ni `contacto.notificarA` — son datos internos
 * (webhook de notificaciones y correo de talento humano).
 *
 * Un convenio con activo = 0 responde 404, igual que uno inexistente: así se
 * puede sembrar un convenio y publicarlo después con un UPDATE, sin que la URL
 * funcione mientras tanto.
 */
async function getPublico(req, res, next) {
  try {
    const convenio = await convenioService.obtenerPorSlug(req.params.slug);
    if (!convenio) throw new AppError('Convenio no encontrado o no disponible', 404);
    res.json({
      success: true,
      data: convenio.toPublicJSON(convenioService.ENGINE_VERSION)
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/convenios/publico/:slug/validar
 *
 * Dry-run del motor de reglas: valida un grupo familiar sin persistir nada.
 *
 * Existe como red de seguridad del espejo del motor que corre en el navegador.
 * Si el frontend quedara desactualizado respecto del backend, el usuario vería
 * el error real ANTES de enviar el formulario, en vez de recibir un 400 sin
 * contexto después de llenarlo todo.
 *
 * Responde 200 siempre que la petición sea válida; el veredicto va en el cuerpo.
 */
async function validarPublico(req, res, next) {
  try {
    const convenio = await convenioService.obtenerPorSlug(req.params.slug);
    if (!convenio) throw new AppError('Convenio no encontrado o no disponible', 404);

    const { afiliado = {}, beneficiarios = [] } = req.body || {};
    if (!Array.isArray(beneficiarios)) {
      throw new AppError('beneficiarios debe ser una lista', 400);
    }
    if (beneficiarios.length > 50) {
      throw new AppError('Demasiados beneficiarios en la solicitud', 400);
    }

    const resultado = convenioService.evaluar(convenio, afiliado, beneficiarios);
    res.json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/convenios
 * Listado interno para el panel (selector de convenio, filtro de aprobaciones).
 * Requiere sesión; no expone reglas ni configuración.
 */
async function listar(req, res, next) {
  try {
    const convenios = await convenioService.listar();
    res.json({ success: true, data: convenios });
  } catch (error) {
    next(error);
  }
}

// ── Nómina / invitaciones de un convenio (Task 4) ──────────────────────────
//
// Los seis endpoints de esta sección son delgados a propósito: toda la
// lógica de negocio (validación de filas, generación/reutilización de
// tokens, envío por canal, resolución/consumo del token público) vive en
// invitacion.service.js (Task 3). Lo único que agrega este archivo es:
//   1. Resolver el convenio por slug.
//   2. Validar que el usuario autenticado pueda operar ESE convenio.
//   3. Delegar.

/**
 * Extrae los permisos del módulo `empresa` del rol del usuario (mismo idiom
 * defensivo que getPermisos en afiliado.service.js: permisos puede venir
 * como string JSON o como objeto).
 */
function getPermisosEmpresa(usuario) {
  const raw = usuario?.rol?.permisos;
  const permisos = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
  return permisos.empresa || {};
}

/**
 * ¿Puede este usuario operar (ver/gestionar nómina/invitar) sobre este
 * convenio? Mismo criterio que whereConFiltroEmpresa en afiliado.service.js:
 *   - super_admin, o permiso empresa.ver_todas → sin restricción.
 *   - usuario sin empresa_id → sin restricción por este chequeo (p.ej. un
 *     admin interno que gestiona convenios desde el panel general).
 *   - usuario con empresa_id → solo el convenio cuyo empresaId coincida.
 *
 * ⚠️ Nota deliberada (ronda de revisión, ver Fix 2 vs Fix 3): esta función
 * tiene la MISMA forma "fail-open sin empresa_id" que tenía
 * whereConFiltroAsesorYEmpresa en afiliado.service.js antes de su fix — y
 * ahí SÍ era un bug (podía exponer afiliados de TODAS las empresas ante un
 * futuro `ver_afiliaciones: true` con `empresa_id` nulo). Acá NO se
 * endurece de la misma forma, y es intencional, no una inconsistencia
 * olvidada:
 *   - El scope de whereConFiltroAsesorYEmpresa protege LECTURA de PII de
 *     afiliados (documento, celular, etc.) para CUALQUIER usuario
 *     autenticado a quien, por error, se le otorgue el permiso — el fail-open
 *     ahí era alcanzable por una sola casilla de configuración mal puesta.
 *   - `puedeOperarConvenio` en cambio solo se evalúa para usuarios que YA
 *     pasaron `requirePermiso('empresa', 'ver'|'gestionar_empleados'|
 *     'invitar')` a nivel de ruta (ver convenio.routes.js) — es decir, ya
 *     son personal interno con un permiso `empresa.*` explícitamente
 *     otorgado. Sin `empresa_id`, el diseño asume a propósito "admin interno
 *     de Los Olivos sin empresa propia, gestionando convenios de terceros
 *     desde el panel general" (mismo caso que un asesor sin empresa_id
 *     hoy) — no un accidente de seeding. tests/convenioNomina.routes.test.js
 *     ("200 con permiso empresa.ver y sin empresa_id") fija este
 *     comportamiento como esperado.
 *   - Si en el futuro se decide que este fail-open también debe cerrarse
 *     (p.ej. porque aparece un perfil interno sin empresa_id que NO debería
 *     operar convenios ajenos), hacerlo aquí Y revisar/actualizar ese test —
 *     nunca "corregir" esto copiando el guard de whereConFiltroAsesorYEmpresa
 *     sin releer este comentario, para no volver a divergir por accidente.
 */
function puedeOperarConvenio(usuario, convenio) {
  if (usuario.es_super_admin) return true;
  const p = getPermisosEmpresa(usuario);
  if (p.ver_todas) return true;
  if (!usuario.empresa_id) return true;
  return convenio.empresaId === usuario.empresa_id;
}

/**
 * Resuelve el convenio de `req.params.slug` y valida el scope por empresa.
 * Se busca sin el filtro `soloActivo` de la vista pública (`obtenerPorSlug`
 * por defecto solo trae convenios activos): estas son rutas internas
 * autenticadas y RRHH debe poder importar nómina/generar invitaciones antes
 * de publicar el convenio.
 *
 * Un convenio inexistente y uno que no pertenece a la empresa del usuario
 * responden EXACTAMENTE igual (404 "Convenio no encontrado"), nunca 403 —
 * para no revelarle a un usuario de otra empresa que el convenio existe.
 */
async function resolverConvenioOperable(req) {
  const convenio = await convenioService.obtenerPorSlug(req.params.slug, { soloActivo: false });
  if (!convenio || !puedeOperarConvenio(req.usuario, convenio)) {
    throw new AppError('Convenio no encontrado', 404);
  }
  return convenio;
}

/**
 * GET /api/convenios/:slug/empleados
 * Lista la nómina importada del convenio.
 */
async function getEmpleados(req, res, next) {
  try {
    const convenio = await resolverConvenioOperable(req);
    const { ConvenioEmpleado } = require('../models');
    const empleados = await ConvenioEmpleado.findAll({
      where: { convenioId: convenio.id },
      order: [['primerApellido', 'ASC'], ['primerNombre', 'ASC']]
    });
    res.json({ success: true, data: empleados });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/convenios/:slug/empleados/importar
 * Importa (o reimporta) la nómina del convenio. Body: { filas: object[] }.
 */
async function importarEmpleados(req, res, next) {
  try {
    const convenio = await resolverConvenioOperable(req);
    const { filas } = req.body || {};
    if (!Array.isArray(filas)) {
      throw new AppError('El campo filas debe ser una lista', 400);
    }
    const resultado = await invitacionService.importarEmpleados(convenio.id, filas, req.usuario);
    res.json({ success: true, message: 'Nómina importada', data: resultado });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/convenios/:slug/invitaciones
 * Genera (o reutiliza) invitaciones para los empleados indicados.
 * Body: { empleadoIds: number[], diasVigencia?: number }.
 */
async function crearInvitaciones(req, res, next) {
  try {
    const convenio = await resolverConvenioOperable(req);
    const { empleadoIds, diasVigencia } = req.body || {};
    if (!Array.isArray(empleadoIds) || empleadoIds.length === 0) {
      throw new AppError('Debe seleccionar al menos un empleado', 400);
    }
    const opciones = diasVigencia ? { diasVigencia } : undefined;
    const invitaciones = await invitacionService.generarInvitaciones(convenio.id, empleadoIds, opciones);
    res.json({
      success: true,
      message: 'Invitaciones generadas',
      data: invitaciones,
      omitidos: invitaciones.omitidos || []
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/convenios/:slug/invitaciones/enviar
 * Envía un lote de invitaciones por un canal. Body: { invitacionIds: number[], canal }.
 * Cada invitación se procesa individualmente para poder reportar fallas
 * puntuales (ej. empleado sin celular) sin abortar el resto del lote.
 */
async function enviarInvitaciones(req, res, next) {
  try {
    const convenio = await resolverConvenioOperable(req);
    const { invitacionIds, canal } = req.body || {};
    if (!Array.isArray(invitacionIds) || invitacionIds.length === 0) {
      throw new AppError('Debe seleccionar al menos una invitación', 400);
    }

    const { ConvenioInvitacion } = require('../models');
    const resultados = [];
    for (const invitacionId of invitacionIds) {
      try {
        // Ownership: la invitación debe pertenecer al convenio ya validado arriba.
        const invitacion = await ConvenioInvitacion.findOne({
          where: { id: invitacionId, convenioId: convenio.id },
          attributes: ['id']
        });
        if (!invitacion) {
          resultados.push({ invitacionId, exito: false, motivo: 'Invitación no encontrada en este convenio' });
          continue;
        }
        await invitacionService.enviarInvitacion(invitacionId, canal, req.usuario);
        resultados.push({ invitacionId, exito: true });
      } catch (err) {
        resultados.push({ invitacionId, exito: false, motivo: err.message });
      }
    }

    res.json({ success: true, message: 'Envío de invitaciones procesado', data: resultados });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/convenios/:slug/invitaciones
 * Lista las invitaciones generadas para el convenio, con su empleado.
 */
async function getInvitaciones(req, res, next) {
  try {
    const convenio = await resolverConvenioOperable(req);
    const { ConvenioInvitacion, ConvenioEmpleado } = require('../models');
    const invitaciones = await ConvenioInvitacion.findAll({
      where: { convenioId: convenio.id },
      include: [{ model: ConvenioEmpleado, as: 'empleado' }],
      order: [['id', 'DESC']]
    });
    res.json({ success: true, data: invitaciones });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/convenios/invitacion/:token
 * Resuelve un token de invitación público — configuración del convenio +
 * datos del empleado para prellenar el formulario de autoafiliación. Sin
 * autenticación (rate limiter estricto en la ruta); resolverToken hace las
 * comprobaciones de validez (existe, no usado, no vencido, convenio activo,
 * empleado activo en la nómina).
 */
async function resolverInvitacion(req, res, next) {
  try {
    const resultado = await invitacionService.resolverToken(req.params.token);
    res.json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPublico,
  validarPublico,
  listar,
  getEmpleados,
  importarEmpleados,
  crearInvitaciones,
  enviarInvitaciones,
  getInvitaciones,
  resolverInvitacion
};
