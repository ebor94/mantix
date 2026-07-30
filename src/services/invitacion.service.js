// ============================================
// src/services/invitacion.service.js
// Convenios empresariales — nómina e invitaciones de autoafiliación (Task 3)
// ============================================
//
// Una empresa con convenio importa su nómina (ConvenioEmpleado, Task 2) y
// genera invitaciones de un solo uso (ConvenioInvitacion, Task 2) para que
// cada empleado se autoafilie sin intervención de un asesor. Este archivo es
// la única capa de negocio sobre esas dos tablas: importación, generación y
// envío de invitaciones, y la resolución/consumo del token público.
//
// El token NO usa hashId.js (el ofuscador reversible AES-256-CBC del resto del
// proyecto): es una capacidad de un solo uso, no un identificador a ocultar,
// así que se genera con crypto.randomBytes — ver generarInvitaciones.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { ConvenioEmpleado, ConvenioInvitacion, Convenio } = require('../models');
const { ENGINE_VERSION } = require('../rules/convenioRules');
const whatsappService = require('./whatsappService');
const emailService = require('./emailService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const CANALES_VALIDOS = ['WHATSAPP', 'EMAIL', 'MANUAL'];
/** Mismos seis valores que el ENUM de ConvenioEmpleado.tipoDocumento (NOT NULL). */
const TIPOS_DOCUMENTO_VALIDOS = ['CC', 'TI', 'CE', 'PA', 'NIT', 'PPT'];

/** Columnas de ConvenioEmpleado que se refrescan en cada reimportación. */
const COLUMNAS_ACTUALIZABLES = [
  'tipoDocumento', 'primerNombre', 'primerApellido',
  'celular', 'email', 'cargo', 'unidadNegocio'
];

/**
 * Valida una fila cruda del archivo de nómina.
 * @returns {string|null} motivo del rechazo, o null si la fila es válida.
 */
function motivoInvalido(fila) {
  if (!String(fila?.numeroDocumento ?? '').trim()) {
    return 'El número de documento es obligatorio';
  }
  if (!TIPOS_DOCUMENTO_VALIDOS.includes(String(fila?.tipoDocumento ?? '').trim())) {
    return 'tipoDocumento inválido o vacío (debe ser CC, TI, CE, PA, NIT o PPT)';
  }
  if (!String(fila?.primerNombre ?? '').trim()) {
    return 'El primer nombre es obligatorio';
  }
  if (!String(fila?.primerApellido ?? '').trim()) {
    return 'El primer apellido es obligatorio';
  }
  return null;
}

/**
 * Importa (o reimporta) la nómina de un convenio desde un array ya
 * estructurado — el parseo de Excel/CSV es responsabilidad del frontend.
 *
 * Cada fila se valida antes de intentar el insert; las inválidas van a
 * `errores[]` con su número de fila 1-indexado (contando solo filas de datos,
 * no el header) y no abortan el resto del lote.
 *
 * Si el mismo `numeroDocumento` aparece más de una vez dentro del propio
 * archivo, se conserva la última ocurrencia (mismo criterio que un
 * `INSERT ... ON DUPLICATE KEY UPDATE` de varias filas en una sola sentencia)
 * y las ocurrencias anteriores se cuentan en `ignorados` — no son un error de
 * datos, son redundantes.
 *
 * El UNIQUE (convenioId, numeroDocumento) — Task 2 — es lo que permite usar
 * `bulkCreate` con `updateOnDuplicate` para que reimportar la misma nómina sea
 * idempotente: filas ya existentes se actualizan en vez de duplicarse.
 *
 * @param {number} convenioId
 * @param {Array<object>} filas
 * @param {object} [usuario] Solo para trazabilidad en el log; no se persiste
 *        (ConvenioEmpleado no tiene columna de auditoría por importación).
 * @returns {Promise<{creados:number, actualizados:number, ignorados:number, errores:Array<{fila:number, motivo:string}>}>}
 */
async function importarEmpleados(convenioId, filas, usuario) {
  const errores = [];
  const porDocumento = new Map(); // numeroDocumento -> { fila, datos }
  let ignorados = 0;

  (filas || []).forEach((fila, idx) => {
    const numeroFila = idx + 1;
    const motivo = motivoInvalido(fila);
    if (motivo) {
      errores.push({ fila: numeroFila, motivo });
      return;
    }

    const numeroDocumento = String(fila.numeroDocumento).trim();
    if (porDocumento.has(numeroDocumento)) {
      ignorados += 1; // fila repetida en el mismo archivo — se queda con la última
    }
    porDocumento.set(numeroDocumento, {
      fila: numeroFila,
      datos: {
        convenioId,
        tipoDocumento: String(fila.tipoDocumento).trim(),
        numeroDocumento,
        primerNombre: String(fila.primerNombre).trim(),
        primerApellido: String(fila.primerApellido).trim(),
        celular: fila.celular || null,
        email: fila.email || null,
        cargo: fila.cargo || null,
        unidadNegocio: fila.unidadNegocio || null
      }
    });
  });

  const documentos = [...porDocumento.keys()];
  let creados = 0;
  let actualizados = 0;

  if (documentos.length > 0) {
    const existentes = await ConvenioEmpleado.findAll({
      where: { convenioId, numeroDocumento: { [Op.in]: documentos } },
      attributes: ['numeroDocumento']
    });
    const existentesSet = new Set(existentes.map(e => e.numeroDocumento));

    const registros = documentos.map(doc => porDocumento.get(doc).datos);
    await ConvenioEmpleado.bulkCreate(registros, {
      updateOnDuplicate: COLUMNAS_ACTUALIZABLES
    });

    documentos.forEach(doc => {
      if (existentesSet.has(doc)) actualizados += 1;
      else creados += 1;
    });
  }

  logger.info(
    `[Invitaciones] Importación de nómina convenio=${convenioId} usuario=${usuario?.id ?? 'desconocido'}: ` +
    `creados=${creados} actualizados=${actualizados} ignorados=${ignorados} errores=${errores.length}`
  );

  return { creados, actualizados, ignorados, errores };
}

/**
 * Genera (o reutiliza) invitaciones de autoafiliación para una lista de
 * empleados de un convenio.
 *
 * Si un empleado ya tiene una invitación vigente (`usadoEn IS NULL` y
 * `expiraEn > NOW()`) se reutiliza tal cual — no se crea una segunda, para no
 * invalidar un link que la persona ya pudo haber recibido. Si no, se crea una
 * nueva con un token de un solo uso.
 *
 * El token se genera con `crypto.randomBytes(32).toString('base64url')`
 * (43 caracteres) — nunca con `hashId.js`, que es reversible y no sirve como
 * capability token.
 *
 * Empleados con `ConvenioEmpleado.activo = 0` (ya no están en la nómina, ver
 * el comment de esa columna en el modelo) no reciben invitación: en vez de
 * fallar silenciosamente o abortar el lote completo, se reportan en
 * `omitidos[]` para que RRHH sepa cuáles quedaron fuera y por qué.
 *
 * @param {number} convenioId
 * @param {Array<number>} empleadoIds
 * @param {{diasVigencia?: number}} [opciones]
 * @returns {Promise<Array & {omitidos: Array<{empleadoId:number, motivo:string}>}>}
 *          Invitaciones (nuevas + reutilizadas), cada una con su `token` en
 *          claro — la única vez que el backend lo devuelve completo, para que
 *          el frontend arme el link. El array devuelto lleva además una
 *          propiedad `omitidos` (no un elemento más del array) con los
 *          empleados inactivos que no se invitaron — aditivo, no rompe el
 *          consumo existente como array de invitaciones.
 */
async function generarInvitaciones(convenioId, empleadoIds, { diasVigencia = 15 } = {}) {
  const resultados = [];
  const omitidos = [];
  const ids = empleadoIds || [];

  const empleados = ids.length > 0
    ? await ConvenioEmpleado.findAll({
        where: { id: { [Op.in]: ids }, convenioId },
        attributes: ['id', 'activo']
      })
    : [];
  const activoPorEmpleadoId = new Map(empleados.map(e => [e.id, e.activo]));

  for (const empleadoId of ids) {
    const activo = activoPorEmpleadoId.get(empleadoId);
    if (activo === 0 || activo === false) {
      omitidos.push({ empleadoId, motivo: 'Empleado inactivo en la nómina' });
      continue;
    }

    const vigente = await ConvenioInvitacion.findOne({
      where: {
        convenioId,
        empleadoId,
        usadoEn: null,
        expiraEn: { [Op.gt]: new Date() }
      },
      order: [['id', 'DESC']]
    });

    if (vigente) {
      resultados.push(vigente);
      continue;
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiraEn = new Date(Date.now() + diasVigencia * MS_POR_DIA);
    const nueva = await ConvenioInvitacion.create({ convenioId, empleadoId, token, expiraEn });
    resultados.push(nueva);
  }

  resultados.omitidos = omitidos;
  return resultados;
}

/**
 * Envía (o marca como entregada) una invitación por el canal indicado y deja
 * constancia en `enviadoEn`/`canalEnvio`.
 *
 * - WHATSAPP: whatsappService.sendInvitacion (misma convención de llamada que
 *   sendOTP/sendAceptacion: número + payload, no lanza si falla el envío).
 * - EMAIL: emailService.enviarNotificacion, igual que
 *   notificarRegistroConvenio en afiliado.controller.js.
 * - MANUAL: no envía nada — cubre el caso en que RRHH exporta los links y los
 *   reparte por su cuenta.
 *
 * @param {number} invitacionId
 * @param {'WHATSAPP'|'EMAIL'|'MANUAL'} canal
 * @param {object} [usuario] Solo para trazabilidad en el log.
 */
async function enviarInvitacion(invitacionId, canal, usuario) {
  if (!CANALES_VALIDOS.includes(canal)) {
    throw new AppError('Canal de envío no válido', 400);
  }

  const invitacion = await ConvenioInvitacion.findByPk(invitacionId, {
    include: [{ model: ConvenioEmpleado, as: 'empleado' }]
  });
  if (!invitacion) {
    throw new AppError('Invitación no encontrada', 404);
  }

  const empleado = invitacion.empleado;
  const baseUrl = process.env.FRONT_BASE_URL || 'https://losolivoscucuta.com';
  const link = `${baseUrl}/afiliados/invitacion/${invitacion.token}`;

  if (canal === 'WHATSAPP') {
    if (!empleado?.celular) {
      throw new AppError('El empleado no tiene celular registrado para enviar por WhatsApp', 400);
    }
    await whatsappService.sendInvitacion(empleado.celular, link);
  } else if (canal === 'EMAIL') {
    if (!empleado?.email) {
      throw new AppError('El empleado no tiene correo registrado para enviar por email', 400);
    }
    await emailService.enviarNotificacion(
      empleado.email,
      'Invitación para afiliarte a tu plan exequial',
      `Hola ${empleado.primerNombre}, tu empresa te invitó a afiliarte a tu plan exequial. ` +
      `Ingresa al siguiente enlace para completar tu registro: <a href="${link}">${link}</a>`
    );
  }
  // MANUAL: no se envía nada, solo se deja constancia abajo.

  invitacion.enviadoEn = new Date();
  invitacion.canalEnvio = canal;
  await invitacion.save();

  logger.info(
    `[Invitaciones] Invitación ${invitacionId} enviada por ${canal} (usuario=${usuario?.id ?? 'desconocido'})`
  );

  return invitacion;
}

/**
 * Resuelve un token de invitación público, con cinco comprobaciones en
 * orden — cada una con su propio mensaje para que el frontend muestre algo
 * específico en vez de un genérico:
 *   1. El token existe.
 *   2. No ha sido usado (`usadoEn IS NULL`).
 *   3. No ha vencido (`expiraEn > NOW()`).
 *   4. El convenio asociado sigue activo.
 *   5. El empleado asociado sigue activo en la nómina (`activo != 0`) — un
 *      token generado antes de que RRHH lo diera de baja no debe permitir
 *      completar la autoafiliación.
 *
 * @param {string} token
 * @returns {Promise<{convenio:object, empleado:object}>} El convenio completo
 *          (mismo shape que expone `GET /convenios/publico/:slug`) y los datos
 *          del empleado para prellenar el formulario.
 */
async function resolverToken(token) {
  const invitacion = await ConvenioInvitacion.findOne({
    where: { token },
    include: [
      { model: ConvenioEmpleado, as: 'empleado' },
      { model: Convenio, as: 'convenio' }
    ]
  });

  if (!invitacion) {
    throw new AppError('Invitación no válida', 404);
  }
  if (invitacion.usadoEn) {
    throw new AppError('Esta invitación ya fue utilizada', 410);
  }
  if (!(new Date(invitacion.expiraEn) > new Date())) {
    throw new AppError('Esta invitación venció, contacta a talento humano de tu empresa', 410);
  }

  const convenio = invitacion.convenio;
  if (!convenio || !convenio.activo) {
    throw new AppError('Este convenio no está disponible actualmente', 404);
  }

  const empleado = invitacion.empleado;
  if (!empleado || empleado.activo === 0 || empleado.activo === false) {
    throw new AppError('Este empleado ya no hace parte de la nómina de la empresa, contacta a talento humano', 410);
  }

  return {
    convenio: convenio.toPublicJSON(ENGINE_VERSION),
    empleado: {
      tipoDocumento: empleado.tipoDocumento,
      numeroDocumento: empleado.numeroDocumento,
      primerNombre: empleado.primerNombre,
      primerApellido: empleado.primerApellido,
      celular: empleado.celular,
      email: empleado.email,
      cargo: empleado.cargo
    }
  };
}

/**
 * Consume una invitación de forma atómica junto con la creación del afiliado.
 *
 * Recibe la transacción ya abierta de `createAfiliadoWithBeneficiarios` (no
 * abre la suya) porque debe ser atómica con esa creación: hace
 * `UPDATE convenio_invitaciones SET usadoEn = NOW(), afiliadoId = ?
 * WHERE token = ? AND usadoEn IS NULL` dentro de la misma transacción. Si el
 * UPDATE afecta 0 filas —alguien más ya la usó en una carrera concurrente—
 * lanza AppError para que la transacción completa haga rollback: así un doble
 * submit simultáneo con el mismo token no genera dos afiliaciones.
 *
 * @param {string} token
 * @param {number} afiliadoId
 * @param {import('sequelize').Transaction} transaction
 */
async function marcarUsada(token, afiliadoId, transaction) {
  const [afectadas] = await ConvenioInvitacion.update(
    { usadoEn: new Date(), afiliadoId },
    { where: { token, usadoEn: null }, transaction }
  );

  if (afectadas === 0) {
    throw new AppError('Esta invitación ya fue utilizada', 410);
  }
}

module.exports = {
  importarEmpleados,
  generarInvitaciones,
  enviarInvitacion,
  resolverToken,
  marcarUsada
};
