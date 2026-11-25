/**
 * sv/services/presupuestos.service.js
 * Presupuesto mensual por asesor y categoría, frente a lo realizado.
 *  - Solo en áreas con catálogo por tipos (hoy, Prenecesidad).
 *  - Realizado: cantidad × precio de las ventas no anuladas del mes, por categoría del producto
 *    y asesor dueño. Lo vendido por fuera de GenFlow no cuenta.
 *  - Cada quien ve su alcance; cargar es de supervisor, administrador de área y super admin.
 * Los errores llevan `code` y los responde svErrorHandler.
 */
const { Op, QueryTypes, fn, col } = require('sequelize');
const { sequelize, SvUsuario, SvPresupuesto, SvProducto } = require('../models');
const { ROLES } = require('../config/constants');
const { areaIdsAccesibles, grupoIdsAccesibles } = require('../utils/acceso');

const GRUPO_PAP_ID = 3;
const ROLES_POR_GRUPO = [ROLES.SUPERVISOR, ROLES.COORDINADOR_PREVISION];
const ROLES_POR_AREA = [ROLES.ADMIN_AREA, ROLES.DIRECTOR_COMERCIAL, ROLES.GERENTE_GENERAL];
const ROLES_QUE_CARGAN = [ROLES.SUPERVISOR, ROLES.ADMIN_AREA, ROLES.SUPER_ADMIN];

function error(code, mensaje) { return Object.assign(new Error(mensaje), { code }); }

// Los ids pueden llegar como texto.
const numeros = (ids) => (ids || []).map(Number);

/**
 * Filtro `where` de los usuarios que el actor ve en esa área; {} = todos; null = sin acceso.
 */
function alcance(user, areaId) {
  const rol = user?.rol?.rol_codigo;
  if (!rol) return null;
  if (rol === ROLES.SUPER_ADMIN) return {};
  if (rol === ROLES.JEFE_PAP) return { usr_grupo_id: GRUPO_PAP_ID };
  if (ROLES_POR_GRUPO.includes(rol)) {
    const grupos = numeros(grupoIdsAccesibles(user));
    return grupos.length ? { usr_grupo_id: { [Op.in]: grupos } } : null;
  }
  if (ROLES_POR_AREA.includes(rol)) {
    const areas = numeros(areaIdsAccesibles(user));
    return areas.includes(Number(areaId)) ? { usr_area_id: Number(areaId) } : null;
  }
  // ASESOR, AGENTE_SVC y cualquier rol desconocido: solo él.
  return { usr_id: user.usr_id };
}

function puedeCargar(user, areaId) {
  return ROLES_QUE_CARGAN.includes(user?.rol?.rol_codigo) && alcance(user, areaId) !== null;
}

// Categorías del catálogo activo del área, en su orden.
async function categoriasDe(areaId) {
  const filas = await SvProducto.findAll({
    attributes: ['prod_categoria'],
    where: { prod_area_id: areaId, prod_activo: 1, prod_tipo: { [Op.ne]: '' }, prod_categoria: { [Op.ne]: null } },
    group: ['prod_categoria'],
    order: [[fn('MIN', col('prod_orden_display')), 'ASC'], ['prod_categoria', 'ASC']],
    raw: true
  });
  return filas.map((f) => f.prod_categoria);
}

const llave = (usrId, categoria) => `${usrId}|${categoria}`;

// Presupuesto cargado del mes: 'asesor|categoría' → valor.
async function valoresDelMes(areaId, anio, mes, ids) {
  const where = { pre_area_id: areaId, pre_anio: anio, pre_mes: mes };
  if (ids) where.pre_usr_id = { [Op.in]: ids };
  const filas = await SvPresupuesto.findAll({
    attributes: ['pre_usr_id', 'pre_categoria', 'pre_valor'], where, raw: true
  });
  return new Map(filas.map((f) => [llave(f.pre_usr_id, f.pre_categoria), Number(f.pre_valor)]));
}

// Ventas no anuladas del mes: 'asesor|categoría' → valor. Las fechas son días (YYYY-MM-DD).
async function realizadoDelMes(areaId, anio, mes) {
  const mm = String(mes).padStart(2, '0');
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const filas = await sequelize.query(`
    SELECT v.venta_asesor_id AS usr_id, p.prod_categoria AS categoria, SUM(i.vi_cantidad * i.vi_precio_unitario) AS valor
      FROM sv_crm_ventas v
      JOIN sv_crm_ventas_items i ON i.vi_venta_id = v.venta_id
      JOIN sv_cfg_productos p    ON p.prod_id = i.vi_prod_id
     WHERE v.venta_anulada = 0 AND v.venta_area_id = :areaId AND v.venta_fecha BETWEEN :desde AND :hasta
     GROUP BY v.venta_asesor_id, p.prod_categoria`, {
    replacements: { areaId, desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` },
    type: QueryTypes.SELECT
  });
  return new Map(filas.filter((f) => f.categoria).map((f) => [llave(f.usr_id, f.categoria), Number(f.valor)]));
}

function buscarUsuarios(where) {
  return SvUsuario.findAll({
    attributes: ['usr_id', 'usr_nombre', 'usr_apellido', 'usr_grupo_id', 'usr_activo'],
    where,
    include: [
      { association: 'rol', attributes: [] },
      { association: 'grupo', attributes: ['grupo_id', 'grupo_nombre'] }
    ]
  });
}

// Asesores activos del área, dentro del alcance, a quienes se les puede cargar presupuesto.
async function asesoresCargables(user, areaId) {
  const limite = alcance(user, areaId);
  if (!limite) return [];
  return buscarUsuarios({ ...limite, usr_area_id: areaId, usr_activo: 1, '$rol.rol_codigo$': 'ASESOR' });
}

const idsConDatos = (...mapas) => {
  const ids = new Set();
  for (const m of mapas) for (const [k, v] of m) if (v !== 0) ids.add(Number(k.split('|')[0]));
  return [...ids];
};

const nombreDe = (u) => `${u.usr_nombre} ${u.usr_apellido}`.trim();

async function ultimoCambio(areaId, anio, mes, ids) {
  if (!ids.length) return null;
  const f = await SvPresupuesto.findOne({
    where: { pre_area_id: areaId, pre_anio: anio, pre_mes: mes, pre_usr_id: { [Op.in]: ids } },
    include: [{ association: 'editor', attributes: ['usr_nombre', 'usr_apellido'] }],
    order: [['pre_updated_at', 'DESC'], ['pre_id', 'DESC']]
  });
  if (!f) return null;
  return { por: f.editor ? nombreDe(f.editor) : null, en: new Date(f.pre_updated_at).toISOString() };
}

async function consultar({ user, areaId, anio, mes }) {
  const limite = alcance(user, areaId);
  if (!limite) throw error('FORBIDDEN', 'Fuera de tu alcance');
  const catalogo = await categoriasDe(areaId);
  if (!catalogo.length) throw error('VALIDATION_ERROR', 'Esta área no maneja presupuesto por categorías');

  const [presupuesto, realizado] = await Promise.all([
    valoresDelMes(areaId, anio, mes), realizadoDelMes(areaId, anio, mes)
  ]);
  const usuarios = await buscarUsuarios({
    ...limite,
    [Op.or]: [
      { usr_area_id: areaId, usr_activo: 1, '$rol.rol_codigo$': 'ASESOR' },
      { usr_id: { [Op.in]: idsConDatos(presupuesto, realizado) } }
    ]
  });
  usuarios.sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'));
  const ids = usuarios.map((u) => u.usr_id);
  const visibles = new Set(ids.map(Number));
  const deVisibles = (m) => [...m].filter(([k]) => visibles.has(Number(k.split('|')[0])));

  // Categorías con datos que ya no están en el catálogo, al final.
  const fuera = new Set();
  for (const [k] of [...deVisibles(presupuesto), ...deVisibles(realizado)]) {
    const cat = k.slice(k.indexOf('|') + 1);
    if (!catalogo.includes(cat)) fuera.add(cat);
  }
  const categorias = [...catalogo, ...[...fuera].sort((a, b) => a.localeCompare(b, 'es'))];

  const vacio = () => ({ presupuesto: 0, realizado: 0 });
  const total = { presupuesto: 0, realizado: 0, categorias: Object.fromEntries(categorias.map((c) => [c, vacio()])) };
  const asesores = usuarios.map((u) => {
    const a = { usr_id: u.usr_id, nombre: nombreDe(u), grupo_id: u.usr_grupo_id ?? null, activo: !!u.usr_activo, categorias: {}, presupuesto: 0, realizado: 0 };
    for (const c of categorias) {
      const p = presupuesto.get(llave(u.usr_id, c)) || 0;
      const r = realizado.get(llave(u.usr_id, c)) || 0;
      a.categorias[c] = { presupuesto: p, realizado: r };
      a.presupuesto += p; a.realizado += r;
      total.categorias[c].presupuesto += p; total.categorias[c].realizado += r;
    }
    total.presupuesto += a.presupuesto; total.realizado += a.realizado;
    return a;
  });

  const grupos = new Map();
  for (const u of usuarios) if (u.grupo) grupos.set(u.grupo.grupo_id, u.grupo.grupo_nombre);

  return {
    area_id: areaId, anio, mes,
    puede_cargar: puedeCargar(user, areaId),
    categorias,
    grupos: [...grupos].sort(([a], [b]) => a - b).map(([grupo_id, nombre]) => ({ grupo_id, nombre })),
    asesores,
    total,
    actualizado: await ultimoCambio(areaId, anio, mes, ids)
  };
}

module.exports = { alcance, puedeCargar, categoriasDe, asesoresCargables, valoresDelMes, consultar };
