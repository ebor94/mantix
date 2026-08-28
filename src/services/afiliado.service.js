const { Op } = require('sequelize');
const { sequelize, Afiliado, Beneficiario, Empresa, Convenio, Seguro, ContratoValor, Tarifa, Trazabilidad, Usuario } = require('../models');
const { buscarTarifa, calcularContrato } = require('./tarifa.service');
const { buscarPorNit, crearEmpresa } = require('./empresa.service');
const reciboCajaService = require('./reciboCaja.service');
const convenioService = require('./convenio.service');
const invitacionService = require('./invitacion.service');
const AppError = require('../utils/AppError');

/**
 * Extrae el objeto de permisos del rol del usuario
 * (el campo permisos puede venir como string JSON o como objeto JS)
 */
function getPermisos(usuario) {
  const raw = usuario?.rol?.permisos;
  if (!raw) return {};
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Construye la cláusula WHERE para getPendientes / getRechazados
 * según los permisos del usuario:
 *   - super_admin o ver_todas → sin filtro por asesorId
 *   - ver_propias             → filtrar por asesorId del usuario
 */
function whereConFiltroAsesor(baseWhere, usuario) {
  if (usuario.es_super_admin) return baseWhere;
  const p = getPermisos(usuario).afiliaciones || {};
  if (p.ver_todas) return baseWhere;
  // Solo ve las propias
  return { ...baseWhere, asesorId: usuario.id };
}

/**
 * Construye la cláusula WHERE que restringe por empresa de convenio (Task 4).
 *
 * Pensado para componerse SIEMPRE después de whereConFiltroAsesor (nunca en
 * su lugar): whereConFiltroAsesor ya decide si el usuario ve todo o solo lo
 * suyo por asesorId; esta función solo puede ANGOSTAR ese resultado más — un
 * usuario con `empresa_id` (típicamente EMPRESA_RRHH) nunca ve afiliados de
 * otra empresa.
 *
 * IMPORTANTE: el único bypass de esta función es `es_super_admin`. NO se
 * bypassea con `afiliaciones.ver_todas` — ese flag es la dimensión de
 * "ver todos los asesores", no la de "ver todas las empresas", y son
 * ortogonales. Si ambos bypasses compartieran el mismo flag, un usuario con
 * `empresa_id` seteado al que se le otorgara `ver_todas` (p.ej. por un futuro
 * cambio de rol) vería instantáneamente los afiliados de TODAS las empresas,
 * no solo la suya — justo lo que este filtro existe para impedir. Por eso
 * cada filtro tiene su propio criterio de bypass, independiente del otro:
 *
 *   - super_admin             → sin filtro adicional.
 *   - usuario con empresa_id  → agrega empresaId = usuario.empresa_id,
 *     SIN excepción por `ver_todas`.
 *   - usuario sin empresa_id  → no restringe nada por acá (ya lo hizo, si
 *     correspondía, whereConFiltroAsesor).
 */
function whereConFiltroEmpresa(baseWhere, usuario) {
  if (usuario.es_super_admin) return baseWhere;
  if (usuario.empresa_id) return { ...baseWhere, empresaId: usuario.empresa_id };
  return baseWhere; // usuario sin empresa_id: no se restringe por este filtro (lo hace whereConFiltroAsesor)
}

/**
 * Compone whereConFiltroAsesor y whereConFiltroEmpresa en el orden que exige
 * Task 4: primero asesor, luego empresa sobre el resultado — así ninguno se
 * pisa y ambos se respetan. Pequeño helper interno para no repetir la misma
 * llamada anidada en cada función que lista/busca afiliados.
 *
 * EXCEPCIÓN (fix de regresión, ronda de revisión): un usuario con el permiso
 * `empresa.ver_afiliaciones` (EMPRESA_RRHH puro, sin ningún permiso bajo
 * `afiliaciones`) NO participa de la dimensión "asesor-ownership" — no crea
 * afiliaciones como asesor, así que nunca hay una fila cuyo `asesorId`
 * coincida con su `usuario.id`. Si se le aplicara whereConFiltroAsesor tal
 * cual (que SIEMPRE agrega `asesorId = usuario.id` salvo super_admin/
 * ver_todas), sus listados quedarían SIEMPRE vacíos — un 404/[] silencioso
 * que hace inútil el permiso `empresa.ver_afiliaciones` en la práctica,
 * aunque la ruta lo deje pasar (Fix 2). Por eso, para ese permiso puntual,
 * se aplica SOLO whereConFiltroEmpresa. whereConFiltroAsesor en sí NO se
 * modifica (sigue intacta para todo el canal ASESOR/APROBADOR existente);
 * esto solo cambia si la composición LA LLAMA o no para este perfil.
 *
 * Fix de seguridad (ronda de revisión): el atajo de arriba SOLO se toma si,
 * ADEMÁS de `empresa.ver_afiliaciones`, el usuario tiene `empresa_id`
 * verdadero. Antes de este fix se comprobaba únicamente el permiso — si
 * alguna cuenta llegara a tener `ver_afiliaciones: true` con `empresa_id`
 * `null`/`undefined` (hoy no lo permite el seed, pero basta un error de
 * configuración futuro), el bloque `if` de todas formas se tomaba y
 * devolvía DIRECTAMENTE `whereConFiltroEmpresa(baseWhere, usuario)`, que a
 * su vez, sin `empresa_id`, es un no-op (`return baseWhere`) — es decir,
 * acceso sin ninguna restricción a los afiliados de TODAS las empresas. Con
 * `usuario.empresa_id` exigido en la propia condición, ese caso ya no
 * cumple el atajo y cae al camino normal (`whereConFiltroEmpresa(
 * whereConFiltroAsesor(...))`): un RRHH sin `asesorId` propio termina con
 * `asesorId = usuario.id`, que no matchea ninguna fila — "no ve nada" es la
 * dirección segura de fallo, no "ve todo".
 */
function whereConFiltroAsesorYEmpresa(baseWhere, usuario) {
  const pEmpresa = getPermisos(usuario).empresa || {};
  if (!usuario.es_super_admin && pEmpresa.ver_afiliaciones && usuario.empresa_id) {
    return whereConFiltroEmpresa(baseWhere, usuario);
  }
  return whereConFiltroEmpresa(whereConFiltroAsesor(baseWhere, usuario), usuario);
}

// Convierte strings vacíos a null para evitar truncamiento en columnas ENUM/DATE
const NULLABLE_FIELDS = [
  'sucursal', 'novedad', 'vigenciaDesde', 'vigenciaHasta',
  'canal', 'producto', 'grupo', 'asistenciaFueraDeCasa',
  'celular2', 'email', 'barrio', 'nit', 'nombreEmpresa', 'unidadNegocio', 'planVeolia',
  'actividadEconomica', 'ocupacion', 'codigoCiiu',
  'usuarioCens', 'cicloEstrato', 'relacionPredio', 'observaciones',
  'referenciaPago1', 'referenciaPago2', 'referenciaPago3', 'formaPago',
  'fechaPagoTentativa', 'contratoCompetencia'
]
function nullifyEmpty(obj) {
  const result = { ...obj }
  for (const field of NULLABLE_FIELDS) {
    if (result[field] === '') result[field] = null
  }
  return result
}

async function createAfiliadoWithBeneficiarios(data) {
  const { beneficiarios = [], seguros = [], contrato = {}, ...raw } = data;
  const afiliadoData = nullifyEmpty(raw);

  // ── 0. Reglas del convenio ───────────────────────────────
  // Antes de abrir la transacción: si el grupo familiar no cumple, no tiene
  // sentido empezar a escribir. No hace nada cuando convenioId es null, que es
  // el caso de todas las afiliaciones de asesor y de Veolia.
  await convenioService.assertReglasConvenio(
    afiliadoData.convenioId, afiliadoData, beneficiarios
  );

  const transaction = await sequelize.transaction();

  try {
    // ── 1. Resolver empresa por NIT ──────────────────────────
    if (afiliadoData.nit) {
      let empresa = await buscarPorNit(afiliadoData.nit);
      if (!empresa) {
        // Si no existe, la creamos con los datos que vienen del formulario
        empresa = await Empresa.create(
          { nit: afiliadoData.nit, nombre: afiliadoData.nombreEmpresa || afiliadoData.nit },
          { transaction }
        );
      }
      afiliadoData.empresaId = empresa.id;
      afiliadoData.nombreEmpresa = empresa.nombre;
    }

    // ── 2. Crear afiliado ────────────────────────────────────
    if (afiliadoData.notificacionRecibo === undefined) afiliadoData.notificacionRecibo = 1;
    afiliadoData.fechaNotificacionRecibo = new Date();
    afiliadoData.estadoRegistro = 0; // Siempre inicia como pendiente, independiente del default BD
    const afiliado = await Afiliado.create(afiliadoData, { transaction });

    // ── 3. Crear beneficiarios ───────────────────────────────
    if (beneficiarios.length > 0) {
      const beneficiariosConId = beneficiarios.map(b => ({ ...b, afiliadoId: afiliado.id }));
      await Beneficiario.bulkCreate(beneficiariosConId, { transaction });
    }

    // ── 4. Crear seguros y calcular primas ───────────────────
    if (seguros.length > 0) {
      const segurosConId = seguros.map(s => ({ ...s, afiliadoId: afiliado.id }));
      await Seguro.bulkCreate(segurosConId, { transaction });
    }

    // ── 5. Guardar contrato/valor ────────────────────────────
    if (contrato && Object.keys(contrato).length > 0) {
      await ContratoValor.create(
        { ...contrato, afiliadoId: afiliado.id },
        { transaction }
      );
    }

    // ── 6. Emitir recibo de caja si aplica ──────────────────
    //      Solo formas EFECTIVO / TRANSFERENCIA / CORRESPONSAL,
    //      origen ASESOR y asesor con prefijo_recibo configurado.
    //      POSFECHADO se cobra después con cobrarPosfechado().
    try {
      await reciboCajaService.crearReciboParaAfiliacion(afiliado, transaction);
    } catch (errRecibo) {
      // Si falla la generación del consecutivo, abortamos toda la
      // afiliación para mantener la integridad de la serie.
      throw errRecibo;
    }

    await transaction.commit();

    // Recargar con todas las relaciones incluidas
    const result = await Afiliado.findByPk(afiliado.id, {
      include: [
        { model: Beneficiario, as: 'beneficiarios' },
        { model: Seguro, as: 'seguros' },
        { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
        { model: Empresa, as: 'empresa' },
        { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] }
      ]
    });

    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Variante de createAfiliadoWithBeneficiarios para el registro público por
 * invitación de convenio (Task 4, ver afiliado.controller.createPublicoConvenioInvitacion).
 *
 * DUPLICA el bloque transaccional de esa función hermana en vez de
 * extenderla: createAfiliadoWithBeneficiarios la consumen también Veolia
 * (createPublico) y el canal ASESOR (create) — Global Constraint #1 del plan
 * prohíbe cambiar su comportamiento, y agregarle un parámetro/hook
 * transaccional que solo usa este camino nuevo habría significado tocar una
 * función que ellos también invocan. Se prefirió repetir el mismo bloque acá
 * con una única diferencia real: `invitacionService.marcarUsada(token, ...)`
 * se ejecuta DENTRO de la misma transacción que crea el afiliado, justo antes
 * del commit. Si otro submit concurrente con el mismo token ya la consumió,
 * marcarUsada lanza AppError(410) y el catch de abajo hace rollback de TODO
 * (afiliado, beneficiarios, seguros, contrato y recibo de caja incluidos) —
 * así un doble submit no puede generar dos afiliaciones para una invitación
 * de un solo uso.
 *
 * @param {object} data  Mismo payload que createAfiliadoWithBeneficiarios.
 * @param {string} token Token de la invitación, ya resuelto por el controller.
 */
async function createAfiliadoConInvitacion(data, token) {
  const { beneficiarios = [], seguros = [], contrato = {}, ...raw } = data;
  const afiliadoData = nullifyEmpty(raw);

  await convenioService.assertReglasConvenio(
    afiliadoData.convenioId, afiliadoData, beneficiarios
  );

  const transaction = await sequelize.transaction();

  try {
    // ── 1. Resolver empresa por NIT (igual que createAfiliadoWithBeneficiarios) ─
    if (afiliadoData.nit) {
      let empresa = await buscarPorNit(afiliadoData.nit);
      if (!empresa) {
        empresa = await Empresa.create(
          { nit: afiliadoData.nit, nombre: afiliadoData.nombreEmpresa || afiliadoData.nit },
          { transaction }
        );
      }
      afiliadoData.empresaId = empresa.id;
      afiliadoData.nombreEmpresa = empresa.nombre;
    }

    // ── 2. Crear afiliado ────────────────────────────────────
    if (afiliadoData.notificacionRecibo === undefined) afiliadoData.notificacionRecibo = 1;
    afiliadoData.fechaNotificacionRecibo = new Date();
    afiliadoData.estadoRegistro = 0;
    const afiliado = await Afiliado.create(afiliadoData, { transaction });

    // ── 3. Crear beneficiarios ───────────────────────────────
    if (beneficiarios.length > 0) {
      const beneficiariosConId = beneficiarios.map(b => ({ ...b, afiliadoId: afiliado.id }));
      await Beneficiario.bulkCreate(beneficiariosConId, { transaction });
    }

    // ── 4. Crear seguros y calcular primas ───────────────────
    if (seguros.length > 0) {
      const segurosConId = seguros.map(s => ({ ...s, afiliadoId: afiliado.id }));
      await Seguro.bulkCreate(segurosConId, { transaction });
    }

    // ── 5. Guardar contrato/valor ────────────────────────────
    if (contrato && Object.keys(contrato).length > 0) {
      await ContratoValor.create(
        { ...contrato, afiliadoId: afiliado.id },
        { transaction }
      );
    }

    // ── 6. Emitir recibo de caja si aplica ──────────────────
    try {
      await reciboCajaService.crearReciboParaAfiliacion(afiliado, transaction);
    } catch (errRecibo) {
      throw errRecibo;
    }

    // ── 7. Consumir la invitación — la única diferencia real con la función
    //      hermana. Dentro de la misma transacción; ver docstring arriba.
    await invitacionService.marcarUsada(token, afiliado.id, transaction);

    await transaction.commit();

    const result = await Afiliado.findByPk(afiliado.id, {
      include: [
        { model: Beneficiario, as: 'beneficiarios' },
        { model: Seguro, as: 'seguros' },
        { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
        { model: Empresa, as: 'empresa' },
        { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] }
      ]
    });

    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Lista afiliados. Si se pasa `usuario`, se aplica el mismo filtro de asesor
 * que getPendientes/getRechazados (whereConFiltroAsesor), compuesto con
 * whereConFiltroEmpresa (Task 4): un asesor sin permiso ver_todas solo ve las
 * suyas; un usuario con empresa_id nunca ve afiliados de otra empresa.
 */
async function getAllAfiliados(usuario) {
  const where = usuario ? whereConFiltroAsesorYEmpresa({}, usuario) : {};
  return Afiliado.findAll({
    where,
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato' },
      { model: Empresa, as: 'empresa' },
      { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] }
    ],
    order: [['createdAt', 'DESC']]
  });
}

/**
 * Obtiene un afiliado por id. Sin `usuario` (getByHash, OTP de reenvío)
 * conserva el comportamiento previo: findByPk sin ningún filtro — rutas
 * públicas donde el control de acceso es el hash cifrado o el OTP, no el
 * usuario de sesión.
 *
 * Con `usuario` (Task 4, GET /afiliados/:id autenticado) aplica la misma
 * composición asesor+empresa que el resto de consultas: si el afiliado no
 * pasa el filtro, retorna null (el controlador lo traduce en 404).
 */
async function getAfiliadoById(id, usuario) {
  const include = [
    { model: Beneficiario, as: 'beneficiarios' },
    { model: Seguro, as: 'seguros' },
    { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
    { model: Empresa, as: 'empresa' },
    { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] }
  ];
  if (!usuario) {
    return Afiliado.findByPk(id, { include });
  }
  const where = whereConFiltroAsesorYEmpresa({ id }, usuario);
  return Afiliado.findOne({ where, include });
}

/**
 * Afiliaciones pendientes (estadoRegistro=0, no rechazadas)
 * Si el usuario es asesor (ver_propias), solo retorna las propias.
 * Si es aprobador o admin, retorna todas.
 */
async function getPendientes(usuario) {
  const baseWhere = { estadoRegistro: 0, rechazado: { [Op.not]: 1 }, rechazadoParcial: 0 };
  const where = whereConFiltroAsesorYEmpresa(baseWhere, usuario);

  return Afiliado.findAll({
    where,
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' },
      { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] },
      { model: Usuario, as: 'asesor', attributes: ['id', 'nombre', 'apellido'] }
    ],
    order: [['createdAt', 'DESC']]
  });
}

/**
 * Reporte de afiliaciones aprobadas (estadoRegistro=1), filtrable por rango de
 * fecha de registro (createdAt). Para el aprobador y el administrador — el
 * filtro asesor+empresa se conserva por consistencia, pero como estos roles
 * tienen ver_todas devuelven todas las aprobadas. Solo lectura (sin export).
 *
 * @param {object} usuario  Usuario de sesión (req.usuario)
 * @param {object} [params] { desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD' }
 */
async function getAprobados(usuario, params = {}) {
  const baseWhere = { estadoRegistro: 1 };

  // Filtro por rango de fecha de registro (createdAt)
  if (params.desde || params.hasta) {
    const rango = {};
    if (params.desde) rango[Op.gte] = new Date(`${params.desde}T00:00:00`);
    if (params.hasta) rango[Op.lte] = new Date(`${params.hasta}T23:59:59.999`);
    baseWhere.createdAt = rango;
  }

  const where = whereConFiltroAsesorYEmpresa(baseWhere, usuario);

  return Afiliado.findAll({
    where,
    include: [
      { model: Beneficiario, as: 'beneficiarios', attributes: ['id'] },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' },
      { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] },
      { model: Usuario, as: 'asesor', attributes: ['id', 'nombre', 'apellido'] }
    ],
    order: [['createdAt', 'DESC']]
  });
}

async function aprobarAfiliado(id, usuarioId, numeroContrato) {
  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  const cambios = {
    estadoRegistro: 1,
    rechazado: 0,
    motivoRechazo: null
    //notificacionAprobacion: 1,
    //fechaNotificacionAprobacion: new Date()
  };
  // Número de contrato asignado en la aprobación (si se envió).
  if (numeroContrato != null && String(numeroContrato).trim() !== '') {
    cambios.numeroContrato = String(numeroContrato).trim();
  }
  await afiliado.update(cambios);
  // Trazabilidad
  Trazabilidad.create({ afiliadoId: id, tipo: 'APROBACION', usuarioId: usuarioId || null }).catch(() => {});
  return afiliado;
}

async function rechazarAfiliado(id, motivo, usuarioId) {
  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  await afiliado.update({
    rechazado: 1,
    motivoRechazo: motivo || null,
    estadoRegistro: 0
  });
  // Trazabilidad
  Trazabilidad.create({
    afiliadoId: id,
    tipo: 'RECHAZO_TOTAL',
    descripcion: motivo || null,
    usuarioId: usuarioId || null
  }).catch(() => {});
  return afiliado;
}

/**
 * Rechazo parcial: inactiva beneficiarios específicos.
 * El afiliado permanece en estado pendiente.
 */
async function rechazarBeneficiarios(afiliadoId, ids, motivo, usuarioId) {
  const { encodeId } = require('../utils/hashId');
  const afiliado = await Afiliado.findByPk(afiliadoId);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);

  const hash = encodeId(afiliadoId);

  // Obtener nombres de los beneficiarios antes de inactivarlos
  const beneficiariosAInactivar = await Beneficiario.findAll({
    where: { id: ids, afiliadoId },
    attributes: ['primerNombre', 'segundoNombre', 'primerApellido', 'segundoApellido']
  });
  const nombresBenef = beneficiariosAInactivar
    .map(b => [b.primerNombre, b.segundoNombre, b.primerApellido, b.segundoApellido]
      .filter(Boolean).join(' '))
    .join('; ');

  const transaction = await sequelize.transaction();
  try {
    await Beneficiario.update(
      { activo: 0, motivoRechazo: motivo || null },
      { where: { id: ids, afiliadoId }, transaction }
    );
    // Marcar afiliado como rechazado parcialmente y guardar hash de corrección
    await afiliado.update({ rechazadoParcial: 1, hashCorreccion: hash }, { transaction });
    await Trazabilidad.create({
      afiliadoId,
      tipo: 'RECHAZO_PARCIAL',
      descripcion: `Beneficiarios inactivados: ${nombresBenef || ids.join(', ')}. Motivo: ${motivo || ''}`,
      usuarioId: usuarioId || null
    }, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return Afiliado.findByPk(afiliadoId, {
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato' },
      { model: Empresa, as: 'empresa' },
      { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] }
    ]
  });
}

/**
 * Busca el afiliado más reciente por número de documento.
 *
 * Se usa tanto desde la consulta pública (OTP, sin `usuario`, sin filtro —
 * comportamiento sin cambios) como desde la búsqueda interna del asesor
 * (`buscarPorDocumento`, con `usuario`): en ese segundo caso se aplica
 * whereConFiltroAsesor (compuesto con whereConFiltroEmpresa, Task 4) para
 * que un asesor sin permiso ver_todas no vea afiliados de otro asesor, y un
 * usuario con empresa_id no vea afiliados de otra empresa.
 */
async function getAfiliadoByDocumento(numeroDocumento, usuario) {
  const baseWhere = { numeroDocumento };
  const where = usuario ? whereConFiltroAsesorYEmpresa(baseWhere, usuario) : baseWhere;
  return Afiliado.findOne({
    where,
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' },
      { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] }
    ],
    order: [['createdAt', 'DESC']]
  });
}

/**
 * Registra una consulta en la tabla de trazabilidad.
 */
async function registrarConsulta(afiliadoId, usuarioId, descripcion) {
  return Trazabilidad.create({
    afiliadoId,
    tipo: 'CONSULTA',
    descripcion: descripcion || null,
    usuarioId: usuarioId || null
  });
}

/**
 * Actualiza (reemplaza) los beneficiarios de un afiliado desde la vista de consulta pública.
 */
async function actualizarBeneficiariosConsulta(afiliadoId, beneficiarios, usuarioId) {
  const afiliado = await Afiliado.findByPk(afiliadoId);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);

  // Este camino reemplaza el grupo familiar completo desde la consulta pública
  // sin pasar por createAfiliadoWithBeneficiarios, así que necesita su propia
  // verificación de reglas. (Esta ruta además no tiene validación Joi.)
  await convenioService.assertReglasConvenio(
    afiliado.convenioId, afiliado.get({ plain: true }), beneficiarios
  );

  const transaction = await sequelize.transaction();
  try {
    // Mapear documentoUrl previo por numeroDocumento para preservarlo si la
    // corrección no trae uno nuevo (evita borrar archivos ya subidos).
    const prev = await Beneficiario.findAll({ where: { afiliadoId }, transaction });
    const prevDocByNumero = new Map(prev.map(p => [p.numeroDocumento, p.documentoUrl]));
    const prevRevByNumero = new Map(prev.map(p => [p.numeroDocumento, p.documentoReversoUrl]));

    await Beneficiario.destroy({ where: { afiliadoId }, transaction });
    if (beneficiarios.length > 0) {
      const conId = beneficiarios.map(b => {
        // Misma regla que reenviarAfiliacion: reset activo=1, motivoRechazo=null
        const {
          id,
          afiliadoId: _ignore,
          activo: _activoIgnored,
          motivoRechazo: _motivoIgnored,
          ...rest
        } = b;
        return {
          ...rest,
          afiliadoId,
          activo: 1,
          motivoRechazo: null,
          documentoUrl: rest.documentoUrl || prevDocByNumero.get(rest.numeroDocumento) || null,
          documentoReversoUrl: rest.documentoReversoUrl || prevRevByNumero.get(rest.numeroDocumento) || null
        };
      });
      await Beneficiario.bulkCreate(conId, { transaction });
    }
    await Trazabilidad.create({
      afiliadoId,
      tipo: 'ACTUALIZACION_BENEFICIARIOS',
      descripcion: `${beneficiarios.length} beneficiario(s) actualizado(s)`,
      usuarioId: usuarioId || null
    }, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return Afiliado.findByPk(afiliadoId, {
    include: [{ model: Beneficiario, as: 'beneficiarios' }]
  });
}

/**
 * Afiliaciones rechazadas
 * Si el usuario es asesor (ver_propias), solo retorna las propias.
 * Si es aprobador o admin, retorna todas.
 */
async function getRechazados(usuario) {
  const baseWhere = {
    [Op.or]: [
      { rechazado: 1 },
      { rechazadoParcial: 1 }
    ]
  };
  const where = whereConFiltroAsesorYEmpresa(baseWhere, usuario);

  return Afiliado.findAll({
    where,
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' },
      { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] }
    ],
    order: [['updatedAt', 'DESC']]
  });
}

/**
 * Reenviar una afiliación rechazada para nueva revisión.
 * Solo el asesor que la creó o un super_admin puede reenviarla.
 */
async function reenviarAfiliacion(id, data, usuario) {
  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  if (!afiliado.rechazado && !afiliado.rechazadoParcial)
    throw new AppError('La afiliación no está en estado rechazado', 400);

  // Validar ownership: solo el asesor dueño o super_admin pueden reenviar.
  // Si no hay usuario autenticado (ruta pública via hash+OTP), se omite el chequeo
  // porque el hash cifrado + OTP ya actúan como control de acceso.
  if (usuario && !usuario.es_super_admin && afiliado.asesorId !== usuario.id) {
    throw new AppError('No tienes permiso para reenviar esta afiliación', 403);
  }

  const { beneficiarios = [], seguros = [], contrato = {}, otp: _otp, ...afiliadoData } = data;

  // El convenio se toma SIEMPRE de la base, nunca del cuerpo: corregir una
  // afiliación no puede ser una vía para cambiarla de convenio y así esquivar
  // las reglas del original.
  afiliadoData.convenioId = afiliado.convenioId;
  await convenioService.assertReglasConvenio(
    afiliado.convenioId,
    { ...afiliado.get({ plain: true }), ...afiliadoData },
    beneficiarios
  );

  const transaction = await sequelize.transaction();

  try {
    // Resetear rechazo (total y parcial) y actualizar datos
    afiliadoData.rechazado = 0;
    afiliadoData.rechazadoParcial = 0;
    afiliadoData.hashCorreccion = null;
    afiliadoData.motivoRechazo = null;
    afiliadoData.estadoRegistro = 0;

    // Convertir cadenas vacías a null en campos ENUM/nullable (ej: sucursal, novedad)
    const cleanData = nullifyEmpty(afiliadoData);
    await afiliado.update(cleanData, { transaction });

    // Reemplazar beneficiarios — preservando documentoUrl previo y
    // reactivándolos para que entren al pool de revisión del aprobador.
    if (beneficiarios.length > 0) {
      const prev = await Beneficiario.findAll({ where: { afiliadoId: id }, transaction });
      const prevDocByNumero = new Map(prev.map(p => [p.numeroDocumento, p.documentoUrl]));
    const prevRevByNumero = new Map(prev.map(p => [p.numeroDocumento, p.documentoReversoUrl]));

      await Beneficiario.destroy({ where: { afiliadoId: id }, transaction });
      const bConId = beneficiarios.map(b => {
        // Quitar id/afiliadoId/activo/motivoRechazo del payload — vienen
        // del front, pero la corrección debe resetear esos campos siempre
        // a "activo=1, sin motivo" para que el aprobador vuelva a evaluar.
        const {
          id: _idIgnored,
          afiliadoId: _afIgnored,
          activo: _activoIgnored,
          motivoRechazo: _motivoIgnored,
          ...rest
        } = b;
        return {
          ...rest,
          afiliadoId: id,
          activo: 1,
          motivoRechazo: null,
          documentoUrl: rest.documentoUrl || prevDocByNumero.get(rest.numeroDocumento) || null,
          documentoReversoUrl: rest.documentoReversoUrl || prevRevByNumero.get(rest.numeroDocumento) || null
        };
      });
      await Beneficiario.bulkCreate(bConId, { transaction });
    }

    // Reemplazar seguros
    if (seguros.length > 0) {
      await Seguro.destroy({ where: { afiliadoId: id }, transaction });
      const sConId = seguros.map(s => ({ ...s, afiliadoId: id }));
      await Seguro.bulkCreate(sConId, { transaction });
    }

    // Reemplazar contrato
    if (contrato && Object.keys(contrato).length > 0) {
      await ContratoValor.destroy({ where: { afiliadoId: id }, transaction });
      await ContratoValor.create({ ...contrato, afiliadoId: id }, { transaction });
    }

    await transaction.commit();

    return Afiliado.findByPk(id, {
      include: [
        { model: Beneficiario, as: 'beneficiarios' },
        { model: Seguro, as: 'seguros' },
        { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
        { model: Empresa, as: 'empresa' },
        { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] }
      ]
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Actualiza solo los campos de contacto editables por el afiliado.
 * Registra trazabilidad ACTUALIZACION_DATOS.
 */
async function actualizarDatosContacto(id, datos, usuarioId) {
  const camposPermitidos = ['celular', 'celular2', 'email', 'direccion', 'barrio', 'ciudad', 'departamento'];
  const update = {};
  camposPermitidos.forEach(k => {
    if (datos[k] !== undefined) update[k] = datos[k] || null;
  });

  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  await afiliado.update(update);

  Trazabilidad.create({
    afiliadoId: id,
    tipo: 'ACTUALIZACION_DATOS',
    descripcion: `Campos actualizados: ${Object.keys(update).join(', ')}`,
    usuarioId: usuarioId || null
  }).catch(() => {});

  return afiliado;
}

/**
 * Afiliaciones del asesor logueado en un rango de fechas, SIN filtrar
 * por estado de aprobación (devuelve pendientes, aprobadas y rechazadas).
 * Si el usuario es super_admin o tiene ver_todas, no filtra por asesorId.
 *
 * @param {Usuario} usuario
 * @param {object} params  { fecha, fechaDesde, fechaHasta }
 */
async function getMisDelDia(usuario, params = {}) {
  const where = {};
  // Filtro por asesor si no es super_admin / ver_todas
  if (!usuario.es_super_admin) {
    const p = getPermisos(usuario).afiliaciones || {};
    if (!p.ver_todas) where.asesorId = usuario.id;
  }

  // Filtro de fechas sobre createdAt
  if (params.fecha) {
    const ini = new Date(`${params.fecha}T00:00:00`);
    const fin = new Date(`${params.fecha}T23:59:59.999`);
    where.createdAt = { [Op.between]: [ini, fin] };
  } else if (params.fechaDesde || params.fechaHasta) {
    const rango = {};
    if (params.fechaDesde) rango[Op.gte] = new Date(`${params.fechaDesde}T00:00:00`);
    if (params.fechaHasta) rango[Op.lte] = new Date(`${params.fechaHasta}T23:59:59.999`);
    where.createdAt = rango;
  } else {
    // Default: día actual
    const hoy = new Date();
    const ini = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);
    where.createdAt = { [Op.between]: [ini, fin] };
  }

  const { Usuario } = require('../models');
  return Afiliado.findAll({
    where,
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' },
      { model: Convenio, as: 'convenio', attributes: ['id', 'slug', 'nombre'] },
      { model: Usuario, as: 'legalizador', attributes: ['id', 'nombre', 'apellido'] },
      { model: Usuario, as: 'asesor', attributes: ['id', 'nombre', 'apellido'] }
    ],
    order: [['createdAt', 'DESC']]
  });
}

/**
 * Marca un lote de afiliaciones como legalizadas con un número de planilla.
 * Solo el asesor dueño de las afiliaciones puede legalizarlas (o super_admin).
 * Las que ya están legalizadas se ignoran silenciosamente.
 *
 * @param {number[]} afiliadoIds
 * @param {object}   usuario         - Req.usuario con id y es_super_admin
 * @param {string}   numeroPlanilla  - Número de planilla escrito por el asesor
 * @returns {{ legalizados: number, ignorados: number }}
 */
async function legalizarAfiliaciones(afiliadoIds, usuario, numeroPlanilla) {
  if (!numeroPlanilla || !String(numeroPlanilla).trim()) {
    throw new AppError('El número de planilla es obligatorio', 400);
  }
  if (!Array.isArray(afiliadoIds) || afiliadoIds.length === 0) {
    throw new AppError('Debe seleccionar al menos una afiliación', 400);
  }

  // Cargar las afiliaciones solicitadas
  const afiliaciones = await Afiliado.findAll({
    where: { id: { [Op.in]: afiliadoIds } },
    attributes: ['id', 'asesorId', 'legalizado', 'estadoRegistro', 'rechazado', 'rechazadoParcial']
  });

  if (afiliaciones.length === 0) {
    throw new AppError('No se encontraron afiliaciones con los IDs indicados', 404);
  }

  // Validar que todas pertenezcan al asesor (a menos que sea super_admin)
  if (!usuario.es_super_admin) {
    const ajena = afiliaciones.find(a => a.asesorId !== usuario.id);
    if (ajena) {
      throw new AppError('No tienes permisos para legalizar afiliaciones de otro asesor', 403);
    }
  }

  // Solo se pueden legalizar afiliaciones APROBADAS:
  //   estadoRegistro === 1 y sin rechazo (total o parcial)
  const noAprobadas = afiliaciones.filter(a =>
    a.estadoRegistro !== 1 || a.rechazado === 1 || a.rechazadoParcial === 1
  );
  if (noAprobadas.length > 0) {
    const ids = noAprobadas.map(a => a.id).join(', ');
    throw new AppError(
      `Solo se pueden legalizar afiliaciones aprobadas. Las siguientes no cumplen: ${ids}`,
      400
    );
  }

  // Separar las ya legalizadas de las pendientes
  const pendientes = afiliaciones.filter(a => !a.legalizado);
  const ignorados  = afiliaciones.length - pendientes.length;

  if (pendientes.length === 0) {
    return { legalizados: 0, ignorados };
  }

  const pendientesIds = pendientes.map(a => a.id);
  const ahora = new Date();

  const t = await sequelize.transaction();
  try {
    await Afiliado.update(
      {
        legalizado:            1,
        numeroPlanilla:        String(numeroPlanilla).trim(),
        fechaLegalizacion:     ahora,
        legalizacionAsesorId:  usuario.id
      },
      { where: { id: { [Op.in]: pendientesIds } }, transaction: t }
    );

    // Trazabilidad: una entrada por cada afiliación
    const entradas = pendientesIds.map(id => ({
      afiliadoId:  id,
      tipo:        'LEGALIZACION',
      descripcion: `Planilla N° ${String(numeroPlanilla).trim()} — legalizado por ${usuario.nombre || 'asesor'} (id ${usuario.id})`,
      usuarioId:   usuario.id
    }));
    await Trazabilidad.bulkCreate(entradas, { transaction: t });

    await t.commit();
    return { legalizados: pendientesIds.length, ignorados };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Retorna el historial de trazabilidad de un afiliado, ordenado de más reciente a más antiguo.
 *
 * Si se pasa `usuario`, primero se valida que el afiliado exista y pase
 * whereConFiltroAsesor compuesto con whereConFiltroEmpresa (mismo criterio
 * que getPendientes/getRechazados, Task 4). Si no pasa el filtro se retorna
 * `null` — el controlador lo traduce en 404, no 403, para no revelar que el
 * registro existe.
 */
async function getTrazabilidad(afiliadoId, usuario) {
  const { Usuario } = require('../models');
  if (usuario) {
    const where = whereConFiltroAsesorYEmpresa({ id: afiliadoId }, usuario);
    const visible = await Afiliado.findOne({ where, attributes: ['id'] });
    if (!visible) return null;
  }
  return Trazabilidad.findAll({
    where: { afiliadoId },
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'email'] }],
    order: [['createdAt', 'DESC']]
  });
}

/**
 * Carga afiliaciones por IDs y computa los agregados que necesita el PDF
 * de liquidación: productos por grupo, asistencia, seguros por nombre y
 * beneficiarios adicionales.
 *
 * Validaciones:
 *   - Todas las afiliaciones deben pertenecer al asesor (salvo super_admin
 *     o permiso 'afiliaciones.ver_todas').
 *   - Todas deben estar APROBADAS (estadoRegistro === 1, sin rechazo).
 *
 * @param {number[]} afiliadoIds
 * @param {object}   usuario
 * @returns {Promise<{ afiliaciones: object[], totales: object }>}
 */
async function calcularLiquidacion(afiliadoIds, usuario) {
  if (!Array.isArray(afiliadoIds) || afiliadoIds.length === 0) {
    throw new AppError('Debe seleccionar al menos una afiliación', 400);
  }

  const include = [
    { model: Beneficiario,   as: 'beneficiarios' },
    { model: Seguro,         as: 'seguros' },
    { model: ContratoValor,  as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] }
  ];

  const afiliaciones = await Afiliado.findAll({
    where: { id: { [Op.in]: afiliadoIds } },
    include
  });

  if (afiliaciones.length === 0) {
    throw new AppError('No se encontraron afiliaciones con los IDs indicados', 404);
  }

  // Ownership: solo el asesor dueño (o super_admin / ver_todas)
  const permisos = getPermisos(usuario).afiliaciones || {};
  if (!usuario.es_super_admin && !permisos.ver_todas) {
    const ajena = afiliaciones.find(a => a.asesorId !== usuario.id);
    if (ajena) {
      throw new AppError(
        'No tienes permiso para generar liquidación de afiliaciones de otro asesor',
        403
      );
    }
  }

  // Solo aprobadas
  const noAprobadas = afiliaciones.filter(a =>
    a.estadoRegistro !== 1 || a.rechazado === 1 || a.rechazadoParcial === 1
  );
  if (noAprobadas.length > 0) {
    const ids = noAprobadas.map(a => a.id).join(', ');
    throw new AppError(
      `Solo se pueden incluir afiliaciones aprobadas. IDs no aprobados: ${ids}`,
      400
    );
  }

  // ── Agregados ──────────────────────────────────────────────────
  const totales = {
    productosPorGrupo: {}, // { BASICO: { cantidad, min, max, total } }
    asistencia:         { cantidad: 0, min: null, max: null, total: 0 },
    segurosPorNombre:   {}, // { SOLICANASTA: { cantidad, min, max, total } }
    adicionales:        { cantidad: 0, min: null, max: null, total: 0 },
    totalGeneral:       0,
    cantidadAfiliados:  afiliaciones.length
  };

  const upsertMinMax = (slot, valor) => {
    slot.min = slot.min == null ? valor : Math.min(slot.min, valor);
    slot.max = slot.max == null ? valor : Math.max(slot.max, valor);
  };

  for (const a of afiliaciones) {
    const contrato = a.contrato;
    const tarifa   = contrato?.tarifa;
    const valorPlan       = Number(contrato?.valorPlanExequial || 0);
    const valorAsistencia = Number(tarifa?.valorAsistencia || 0);
    const valorAdic       = Number(contrato?.valorAdicionales || 0);
    const valorTotalContr = Number(contrato?.valorTotal || 0);

    // Productos por grupo
    const grupo = a.grupo || '(sin grupo)';
    if (!totales.productosPorGrupo[grupo]) {
      totales.productosPorGrupo[grupo] = { cantidad: 0, min: null, max: null, total: 0 };
    }
    const slotGrupo = totales.productosPorGrupo[grupo];
    slotGrupo.cantidad += 1;
    slotGrupo.total    += valorPlan;
    upsertMinMax(slotGrupo, valorPlan);

    // Asistencia fuera de casa
    if (a.asistenciaFueraDeCasa === 'SI') {
      totales.asistencia.cantidad += 1;
      totales.asistencia.total    += valorAsistencia;
      upsertMinMax(totales.asistencia, valorAsistencia);
    }

    // Seguros agrupados por nombre
    const seguros = Array.isArray(a.seguros) ? a.seguros : [];
    for (const s of seguros) {
      const nombre = s.nombre || '(sin nombre)';
      const prima  = Number(s.prima || 0);
      if (!totales.segurosPorNombre[nombre]) {
        totales.segurosPorNombre[nombre] = { cantidad: 0, min: null, max: null, total: 0 };
      }
      const slotSeg = totales.segurosPorNombre[nombre];
      slotSeg.cantidad += 1;
      slotSeg.total    += prima;
      upsertMinMax(slotSeg, prima);
    }

    // Beneficiarios adicionales
    const beneficiarios = Array.isArray(a.beneficiarios) ? a.beneficiarios : [];
    const cantAdicAfil  = beneficiarios.filter(b => b.tipoBeneficiario === 'ADICIONAL').length;
    if (cantAdicAfil > 0) {
      totales.adicionales.cantidad += cantAdicAfil;
      totales.adicionales.total    += valorAdic;
      // El min/max se mide por afiliación, no por adicional individual
      upsertMinMax(totales.adicionales, valorAdic);
    }

    totales.totalGeneral += valorTotalContr;
  }

  return { afiliaciones, totales };
}

module.exports = {
  createAfiliadoWithBeneficiarios,
  createAfiliadoConInvitacion,
  getAllAfiliados,
  getAfiliadoById,
  getPendientes,
  getAprobados,
  aprobarAfiliado,
  rechazarAfiliado,
  rechazarBeneficiarios,
  getRechazados,
  reenviarAfiliacion,
  getAfiliadoByDocumento,
  registrarConsulta,
  actualizarBeneficiariosConsulta,
  actualizarDatosContacto,
  getTrazabilidad,
  getMisDelDia,
  legalizarAfiliaciones,
  calcularLiquidacion
};
