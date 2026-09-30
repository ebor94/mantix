const svc = require('../services/empresarialRegistro.service');

async function buscarEmpresa(req, res, next) {
  try {
    const empresa = await svc.buscarEmpresaConPlanes(req.params.nit);
    res.json({ success: true, data: {
      id: empresa.id, nit: empresa.nit, nombre: empresa.nombre,
      vigenciaInicio: empresa.vigenciaInicio, vigenciaCierre: empresa.vigenciaCierre,
      planes: (empresa.planes || []).map(p => ({
        planTipo: p.planTipo, valorMensual: p.valorMensual, reglas: p.reglas, activo: p.activo
      }))
    }});
  } catch (err) { next(err); }
}

async function cotizar(req, res, next) {
  try { res.json({ success: true, data: await svc.cotizar(req.body) }); }
  catch (err) { next(err); }
}

module.exports = { buscarEmpresa, cotizar };
