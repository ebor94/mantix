/**
 * sv/services/ventas.service.js
 * Lo que se vendió al cerrar un contrato: productos, cantidades y precios.
 *  - Solo en áreas con catálogo por tipos (hoy, Prenecesidad).
 *  - Se guarda en la misma transacción que la gestión que cierra el contrato.
 *  - Suma al asesor dueño del cliente, aunque la registre otra persona.
 *  - El total y el precio ofrecido los pone el servidor; nunca llegan del cliente.
 *  - Cada venta lleva la clave de su formulario: reenviarlo no la registra dos veces.
 * Los errores llevan `code` y los responde svErrorHandler.
 */
const { Op, QueryTypes } = require('sequelize');
const {
  sequelize, SvVenta, SvVentaItem, SvVentaCambio, SvProducto, SvProspectoProducto, SvUsuario
} = require('../models');
const { hoyBogotaISO } = require('../utils/fechas');

const TOTAL_MAXIMO = 999999999999; // venta_total es DECIMAL(14,2)

function error(code, mensaje) { return Object.assign(new Error(mensaje), { code }); }
const invalida = (mensaje) => error('VALIDATION_ERROR', mensaje);

async function areaRegistraVentas(areaId, transaction) {
  // prod_tipo <> '' deja por fuera también los NULL.
  const p = await SvProducto.findOne({
    where: { prod_area_id: areaId, prod_activo: 1, prod_tipo: { [Op.ne]: '' } },
    attributes: ['prod_id'],
    transaction
  });
  return !!p;
}

// Devuelve los productos por id y el total. Un producto que ya está en la venta se acepta
// aunque lo hayan desactivado después.
async function validarItems(items, areaId, transaction, yaVendidos = new Set()) {
  if (!Array.isArray(items) || !items.length) throw invalida('Registra al menos un producto vendido');
  const ids = items.map((i) => i.prod_id);
  if (new Set(ids).size !== ids.length) throw invalida('Un producto aparece dos veces en la venta');

  const productos = await SvProducto.findAll({
    where: { prod_id: { [Op.in]: ids }, prod_area_id: areaId }, transaction
  });
  const porId = new Map(productos.map((p) => [p.prod_id, p]));
  for (const i of items) {
    const p = porId.get(i.prod_id);
    if (!p || (!p.prod_activo && !yaVendidos.has(i.prod_id))) {
      throw invalida('Uno de los productos ya no está disponible. Recarga la página y vuelve a elegirlo');
    }
    if (p.prod_es_generico) throw invalida(`"${p.prod_nombre}" está por definir: elige el producto exacto`);
  }
  const total = items.reduce((suma, i) => suma + i.cantidad * i.precio_unitario, 0);
  if (total > TOTAL_MAXIMO) throw invalida('El total de la venta es demasiado alto');
  return { porId, total };
}

// Precio ofrecido de cada producto: el del interés del cliente o, si no lo tenía, el vigente.
async function preciosOfrecidos(prospId, porId, transaction) {
  const intereses = await SvProspectoProducto.findAll({
    where: { pp_prosp_id: prospId, pp_prod_id: { [Op.in]: [...porId.keys()] } }, transaction
  });
  const ofrecidos = new Map(intereses.map((pp) => [pp.pp_prod_id, pp.pp_precio_ofrecido]));
  return (prodId) => {
    if (ofrecidos.get(prodId) != null) return ofrecidos.get(prodId);
    const vigente = porId.get(prodId).prod_precio_base;
    return Number(vigente) > 0 ? vigente : null;
  };
}

function filasDe(ventaId, items, ofrecido) {
  return items.map((i) => ({
    vi_venta_id: ventaId,
    vi_prod_id: i.prod_id,
    vi_cantidad: i.cantidad,
    vi_precio_ofrecido: ofrecido(i.prod_id),
    vi_precio_unitario: i.precio_unitario
  }));
}

// La gestión es nueva en esta transacción, así que de las llaves únicas solo puede chocar la
// clave: la persona reenvió un formulario que ya se había guardado.
async function crearUnaVez(datos, transaction) {
  try {
    return await SvVenta.create(datos, { transaction });
  } catch (e) {
    if (e.name !== 'SequelizeUniqueConstraintError') throw e;
    throw error('CONFLICT', 'Esta venta ya quedó registrada. Recarga la ficha para verla');
  }
}

async function registrarAlCerrar({ prospecto, gestId, estadoNuevo, venta, usuarioId, transaction }) {
  const aplica = !!prospecto && !!estadoNuevo?.estado_es_ganado
    && await areaRegistraVentas(prospecto.prosp_area_id, transaction);
  if (!aplica) {
    if (venta) throw invalida('La venta solo se registra al cerrar el contrato');
    return null;
  }
  if (!venta) {
    throw invalida('Para cerrar el contrato registra los productos vendidos. Si no ves esa sección, recarga GenFlow');
  }

  const { porId, total } = await validarItems(venta.items, prospecto.prosp_area_id, transaction);
  const ofrecido = await preciosOfrecidos(prospecto.prosp_id, porId, transaction);
  const v = await crearUnaVez({
    venta_prosp_id: prospecto.prosp_id,
    venta_gest_id: gestId,
    venta_clave: venta.clave,
    venta_asesor_id: prospecto.prosp_asesor_id || usuarioId,
    venta_area_id: prospecto.prosp_area_id,
    venta_fecha: hoyBogotaISO(),
    venta_total: total,
    venta_created_by: usuarioId
  }, transaction);
  await SvVentaItem.bulkCreate(filasDe(v.venta_id, venta.items, ofrecido), { transaction });
  return v;
}

const DETALLE = [
  { model: SvVentaItem, as: 'items', include: [{ model: SvProducto, as: 'producto', attributes: ['prod_id', 'prod_nombre', 'prod_activo'] }] },
  { model: SvUsuario, as: 'asesor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] },
  { model: SvVentaCambio, as: 'cambios', include: [{ model: SvUsuario, as: 'usuario', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }] }
];

// Productos como se registraron; cambios, del más reciente al más antiguo.
const ORDEN_DETALLE = [
  [{ model: SvVentaItem, as: 'items' }, 'vi_id', 'ASC'],
  [{ model: SvVentaCambio, as: 'cambios' }, 'vc_id', 'DESC']
];

async function listarDeProspecto(prospId) {
  return SvVenta.findAll({
    where: { venta_prosp_id: prospId },
    include: DETALLE,
    order: [['venta_fecha', 'DESC'], ['venta_id', 'DESC'], ...ORDEN_DETALLE]
  });
}

async function obtener(ventaId) {
  return SvVenta.findByPk(ventaId, { include: DETALLE, order: ORDEN_DETALLE });
}

// Bloquea la venta y comprueba que siga como la vio quien la está cambiando.
async function bloquear(ventaId, cambiosVistos, transaction) {
  const venta = await SvVenta.findByPk(ventaId, { transaction, lock: true });
  if (!venta) throw error('NOT_FOUND', 'Venta no encontrada');
  if (venta.venta_anulada) throw error('CONFLICT', 'Esta venta ya está anulada');
  const cambios = await SvVentaCambio.count({ where: { vc_venta_id: ventaId }, transaction });
  if (cambios !== cambiosVistos) {
    throw error('CONFLICT', 'Otra persona cambió esta venta. Recarga la ficha y revisa antes de seguir');
  }
  return venta;
}

async function enTransaccion(fn) {
  const t = await sequelize.transaction();
  try {
    const r = await fn(t);
    await t.commit();
    return r;
  } catch (e) {
    try { await t.rollback(); } catch { /* el error que importa es el original */ }
    throw e;
  }
}

const resumen = (filas) => filas.map((f) => ({
  prod_id: f.vi_prod_id,
  cantidad: f.vi_cantidad,
  precio_unitario: Number(f.vi_precio_unitario),
  precio_ofrecido: f.vi_precio_ofrecido == null ? null : Number(f.vi_precio_ofrecido)
}));

async function corregir(ventaId, { items, motivo, cambios_vistos: vistos }, usuarioId) {
  await enTransaccion(async (t) => {
    const venta = await bloquear(ventaId, vistos, t);
    const antes = await SvVentaItem.findAll({ where: { vi_venta_id: ventaId }, transaction: t });
    const anteriores = new Map(antes.map((f) => [f.vi_prod_id, f]));
    const { porId, total } = await validarItems(items, venta.venta_area_id, t, new Set(anteriores.keys()));

    const igual = items.length === antes.length && items.every((i) => {
      const f = anteriores.get(i.prod_id);
      return f && f.vi_cantidad === i.cantidad && Number(f.vi_precio_unitario) === i.precio_unitario;
    });
    if (igual) throw invalida('No hay cambios para guardar');

    const nuevo = await preciosOfrecidos(venta.venta_prosp_id, porId, t);
    const ofrecido = (id) => (anteriores.has(id) ? anteriores.get(id).vi_precio_ofrecido : nuevo(id));
    const despues = filasDe(ventaId, items, ofrecido);
    await SvVentaItem.destroy({ where: { vi_venta_id: ventaId }, transaction: t });
    await SvVentaItem.bulkCreate(despues, { transaction: t });
    await SvVentaCambio.create({
      vc_venta_id: ventaId, vc_usr_id: usuarioId, vc_accion: 'corregir', vc_motivo: motivo,
      vc_total_antes: venta.venta_total, vc_total_despues: total,
      vc_detalle: { antes: resumen(antes), despues: resumen(despues) }
    }, { transaction: t });
    await venta.update({ venta_total: total }, { transaction: t });
  });
  return obtener(ventaId);
}

async function anular(ventaId, { motivo, cambios_vistos: vistos }, usuarioId) {
  await enTransaccion(async (t) => {
    const venta = await bloquear(ventaId, vistos, t);
    await SvVentaCambio.create({
      vc_venta_id: ventaId, vc_usr_id: usuarioId, vc_accion: 'anular', vc_motivo: motivo,
      vc_total_antes: venta.venta_total, vc_total_despues: 0
    }, { transaction: t });
    await venta.update({ venta_anulada: 1 }, { transaction: t });
  });
  return obtener(ventaId);
}

/**
 * Contratos y valor vendido por asesor entre dos días (YYYY-MM-DD, ambos incluidos).
 * Un contrato es una venta activa del asesor dueño. Los cierres sin venta (otras áreas, o
 * anteriores a la migración 027) se cuentan como siempre: por la gestión de quien cerró.
 */
async function metricasPorAsesor(asesorIds, desde, hasta) {
  if (!asesorIds.length) return new Map();
  const filas = await sequelize.query(`
    SELECT asesor, SUM(contratos) AS contratos, SUM(valor) AS valor FROM (
      SELECT v.venta_asesor_id AS asesor, COUNT(*) AS contratos, SUM(v.venta_total) AS valor
        FROM sv_crm_ventas v
       WHERE v.venta_anulada = 0 AND v.venta_asesor_id IN (:ids) AND v.venta_fecha BETWEEN :desde AND :hasta
       GROUP BY v.venta_asesor_id
      UNION ALL
      SELECT g.gest_asesor_id, COUNT(DISTINCT g.gest_prosp_id, DATE(g.gest_fecha_hora)), 0
        FROM sv_crm_gestiones g
        JOIN sv_cfg_estados_gestion e ON e.estado_id = g.gest_estado_nuevo_id AND e.estado_es_ganado = 1
       WHERE g.gest_asesor_id IN (:ids) AND g.gest_fecha_hora BETWEEN :inicio AND :fin
         AND NOT EXISTS (SELECT 1 FROM sv_crm_ventas v WHERE v.venta_gest_id = g.gest_id)
       GROUP BY g.gest_asesor_id
    ) x GROUP BY asesor`, {
    replacements: { ids: asesorIds, desde, hasta, inicio: `${desde} 00:00:00`, fin: `${hasta} 23:59:59` },
    type: QueryTypes.SELECT
  });
  return new Map(filas.map((f) => [Number(f.asesor), { contratos: Number(f.contratos), valor: Number(f.valor) }]));
}

module.exports = {
  areaRegistraVentas, registrarAlCerrar, listarDeProspecto, obtener, corregir, anular, metricasPorAsesor
};
