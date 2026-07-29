const convenioService = require('../services/convenio.service');
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

module.exports = { getPublico, validarPublico, listar };
