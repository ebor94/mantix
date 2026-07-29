/**
 * Convenios empresariales: lectura de la configuración y aplicación de las
 * reglas de beneficiarios.
 *
 * Este servicio es el ÚNICO punto donde se hacen cumplir las reglas en el
 * servidor. Se invoca desde los tres caminos que escriben beneficiarios en
 * afiliado.service.js (alta, reenvío de corrección y actualización desde la
 * consulta pública), porque los dos últimos borran y recrean el grupo familiar
 * sin pasar por el primero.
 *
 * Importa: hasta ahora NO existía ninguna validación de reglas de beneficiarios
 * del lado servidor — todas vivían en Vue, así que un POST con curl las evadía
 * por completo. El motor corre igual en el navegador (para dar feedback en vivo)
 * pero la palabra final la tiene este archivo.
 */

const { Convenio } = require('../models');
const { validarConjunto, ENGINE_VERSION } = require('../rules/convenioRules');
const AppError = require('../utils/AppError');

/**
 * Busca un convenio por su slug de URL.
 * @param {string} slug
 * @param {object} [opciones]
 * @param {boolean} [opciones.soloActivo=true] Si es true, un convenio con
 *        activo = 0 se comporta como inexistente. Es lo que permite sembrar un
 *        convenio y publicarlo después con un UPDATE.
 */
async function obtenerPorSlug(slug, opciones) {
  const soloActivo = !opciones || opciones.soloActivo !== false;
  const where = { slug: String(slug || '').trim().toLowerCase() };
  if (soloActivo) where.activo = 1;
  return Convenio.findOne({ where });
}

async function obtenerPorId(id) {
  if (!id) return null;
  return Convenio.findByPk(id);
}

/** Convenios visibles para el panel interno (no expone la config completa). */
async function listar() {
  return Convenio.findAll({
    attributes: ['id', 'slug', 'nombre', 'nit', 'empresaId', 'planNombre', 'activo'],
    order: [['nombre', 'ASC']]
  });
}

/**
 * Extrae del payload de afiliación los datos del titular que el motor necesita.
 * La edad NO se toma del cliente: el motor la recalcula desde fechaNacimiento.
 */
function titularDesdePayload(afiliadoData) {
  return {
    estadoCivil: afiliadoData?.estadoCivil || null,
    fechaNacimiento: afiliadoData?.fechaNacimiento || null,
    edad: afiliadoData?.edad
  };
}

/**
 * Evalúa las reglas de un convenio contra un grupo familiar, sin persistir.
 * Devuelve el resultado crudo del motor (lo usa el endpoint de dry-run).
 */
function evaluar(convenio, afiliadoData, beneficiarios) {
  const reglas = typeof convenio.json === 'function'
    ? convenio.json('reglas')
    : convenio.reglas;

  return validarConjunto(
    reglas,
    {
      titular: titularDesdePayload(afiliadoData),
      beneficiarios: Array.isArray(beneficiarios) ? beneficiarios : []
    },
    {}
  );
}

/**
 * Arma un mensaje único a partir de los errores del motor. Se usa como
 * `message` del AppError; la lista completa viaja en `detalles.errores` para
 * que el formulario pueda señalar los beneficiarios exactos.
 */
function resumirErrores(errores) {
  if (!errores.length) return 'El grupo familiar no cumple las condiciones del convenio.';
  if (errores.length === 1) return errores[0].mensaje;
  return `El grupo familiar no cumple las condiciones del convenio:\n· ${
    errores.map(e => e.mensaje).join('\n· ')
  }`;
}

/**
 * Hace cumplir las reglas del convenio o lanza AppError 400.
 *
 * No hace nada cuando `convenioId` es null, que es el caso de TODAS las
 * afiliaciones existentes (asesor y Veolia): esta validación no puede cambiar
 * el comportamiento de nada que ya esté en producción.
 *
 * @param {number|null} convenioId  Debe venir de la BD, no del body del cliente.
 * @param {object} afiliadoData     Payload del titular.
 * @param {Array}  beneficiarios
 * @throws {AppError} 400 con `detalles.errores` cuando el grupo familiar no cumple.
 */
async function assertReglasConvenio(convenioId, afiliadoData, beneficiarios) {
  if (!convenioId) return null;

  const convenio = await obtenerPorId(convenioId);
  if (!convenio) {
    throw new AppError('El convenio de esta afiliación no existe o fue eliminado', 400);
  }

  const resultado = evaluar(convenio, afiliadoData, beneficiarios);

  if (!resultado.valido) {
    throw new AppError(
      resumirErrores(resultado.errores),
      400,
      { errores: resultado.errores, cupos: resultado.cupos, convenio: convenio.slug }
    );
  }

  return resultado;
}

module.exports = {
  ENGINE_VERSION,
  obtenerPorSlug,
  obtenerPorId,
  listar,
  evaluar,
  assertReglasConvenio,
  titularDesdePayload
};
