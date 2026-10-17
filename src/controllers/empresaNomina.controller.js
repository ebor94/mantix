const svc = require('../services/empresaNomina.service');

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

module.exports = { buscar };
