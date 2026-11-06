const { Op } = require('sequelize');
const { EmpresaNomina } = require('../models');
const AppError = require('../utils/AppError');
const { filaNominaSchema } = require('../validations/empresaNomina.validation');

const COLUMNAS_ACTUALIZABLES = [
  'primerNombre','segundoNombre','primerApellido','segundoApellido',
  'estadoCivil','fechaNacimiento','direccion','celular','email','planTipo','activo'
];

async function buscarEnNomina(empresaId, cedula) {
  const doc = String(cedula || '').replace(/\D/g, '');
  if (!doc) throw new AppError('Documento inválido', 400);
  const fila = await EmpresaNomina.findOne({
    where: { empresaId, numeroDocumento: doc, activo: 1 }
  });
  if (!fila) throw new AppError('Empleado no está en la nómina de esta empresa', 404);
  return fila;
}

async function importarNomina(empresaId, filas) {
  const errores = [];
  const porDocumento = new Map();
  let ignorados = 0;
  (Array.isArray(filas) ? filas : []).forEach((fila, idx) => {
    const n = idx + 1;
    const { value, error } = filaNominaSchema.validate(fila, { stripUnknown: true });
    if (error) { errores.push({ fila: n, motivo: error.message }); return; }
    const doc = String(value.numeroDocumento).trim();
    if (porDocumento.has(doc)) ignorados += 1;
    porDocumento.set(doc, { ...value, empresaId, numeroDocumento: doc, activo: 1 });
  });
  const docs = [...porDocumento.keys()];
  let creados = 0, actualizados = 0;
  if (docs.length > 0) {
    const existentes = await EmpresaNomina.findAll({
      where: { empresaId, numeroDocumento: { [Op.in]: docs } },
      attributes: ['numeroDocumento']
    });
    const set = new Set(existentes.map(e => e.numeroDocumento));
    await EmpresaNomina.bulkCreate([...porDocumento.values()], { updateOnDuplicate: COLUMNAS_ACTUALIZABLES });
    docs.forEach(d => (set.has(d) ? actualizados++ : creados++));
  }
  return { creados, actualizados, ignorados, errores };
}

async function listarNomina(empresaId) {
  return EmpresaNomina.findAll({ where: { empresaId }, order: [['primerApellido','ASC'], ['primerNombre','ASC']] });
}

// Alta de un interesado desde el link público. Crea la fila solo si no existe
// (findOrCreate): un llamador anónimo NO puede sobrescribir ni reactivar una
// fila ya cargada por el asesor (misma clave única empresa_id + numero_documento).
async function crearInteresado(empresaId, datos) {
  const numeroDocumento = String(datos.numeroDocumento).trim();
  const [fila] = await EmpresaNomina.findOrCreate({
    where: { empresaId, numeroDocumento },
    defaults: { ...datos, empresaId, numeroDocumento, activo: 1 }
  });
  return fila;
}

module.exports = { buscarEnNomina, importarNomina, listarNomina, crearInteresado };
