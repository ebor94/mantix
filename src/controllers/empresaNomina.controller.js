const svc = require('../services/empresaNomina.service');
const { Empresa } = require('../models');
const AppError = require('../utils/AppError');
const { interesadoPublicoSchema } = require('../validations/empresaNomina.validation');

// Normaliza nombres/apellidos a MAYÚSCULAS en la precarga (por si la nómina
// trae datos en minúscula/mixto).
const up = (v) => (v ? String(v).toUpperCase() : v);

async function buscar(req, res, next) {
  try {
    const f = await svc.buscarEnNomina(req.params.empresaId, req.params.cedula);
    res.json({ success: true, data: {
      numeroDocumento: f.numeroDocumento,
      primerNombre: up(f.primerNombre), segundoNombre: up(f.segundoNombre),
      primerApellido: up(f.primerApellido), segundoApellido: up(f.segundoApellido),
      estadoCivil: f.estadoCivil, fechaNacimiento: f.fechaNacimiento,
      direccion: f.direccion, celular: f.celular, email: f.email,
      planTipo: f.planTipo
    }});
  } catch (err) { next(err); }
}

async function listar(req, res, next) {
  try { res.json({ success: true, data: await svc.listarNomina(req.params.empresaId) }); }
  catch (err) { next(err); }
}

async function importar(req, res, next) {
  try {
    const filas = req.body?.filas;
    if (!Array.isArray(filas) || filas.length === 0) throw new AppError('Envía al menos una fila en `filas`', 400);
    if (filas.length > 5000) throw new AppError('Máximo 5000 filas por importación', 400);
    res.json({ success: true, data: await svc.importarNomina(req.params.empresaId, filas) });
  } catch (err) { next(err); }
}

// Público: resuelve empresa por slug y exige interesados_activo = 1.
async function crearInteresado(req, res, next) {
  try {
    const empresa = await Empresa.findOne({ where: { slug: req.params.slug, interesadosActivo: 1, activo: 1 } });
    if (!empresa) throw new AppError('Formulario de interesados no disponible', 404);
    const { value, error } = interesadoPublicoSchema.validate(req.body || {}, { stripUnknown: true });
    if (error) throw new AppError(error.message, 400);
    await svc.crearInteresado(empresa.id, value);
    res.json({ success: true, message: 'Registro recibido. El asesor te contactará.' });
  } catch (err) { next(err); }
}

module.exports = { buscar, listar, importar, crearInteresado };
