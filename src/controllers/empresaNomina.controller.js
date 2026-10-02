const svc = require('../services/empresaNomina.service');

async function buscar(req, res, next) {
  try {
    const f = await svc.buscarEnNomina(req.params.empresaId, req.params.cedula);
    res.json({ success: true, data: {
      numeroDocumento: f.numeroDocumento,
      primerNombre: f.primerNombre, segundoNombre: f.segundoNombre,
      primerApellido: f.primerApellido, segundoApellido: f.segundoApellido,
      estadoCivil: f.estadoCivil, fechaNacimiento: f.fechaNacimiento,
      direccion: f.direccion, celular: f.celular, email: f.email,
      planTipo: f.planTipo
    }});
  } catch (err) { next(err); }
}

module.exports = { buscar };
