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
const { sequelize, SvUsuario, SvPresupuesto, SvProducto, SvArea } = require('../models');
const { ROLES } = require('../config/constants');
const { areaIdsAccesibles, grupoIdsAccesibles } = require('../utils/acceso');
const { adUsuariosPorIdentidad } = require('./usuariosAd.service');
const excel = require('./presupuestosExcel.service');
const { MAX_FILAS, VALOR_MAXIMO } = require('../validations/presupuestos.validation');

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
    // Sin filtro de usuario: las dos ramas de consultar ya son de esta área, y quien cambió de
    // área sigue saliendo en los meses en que vendió.
    return areas.includes(Number(areaId)) ? {} : null;
  }
  // ASESOR, AGENTE_SVC y cualquier rol desconocido: solo él.
  return { usr_id: user.usr_id };
}

function puedeCargar(user, areaId) {
  return ROLES_QUE_CARGAN.includes(user?.rol?.rol_codigo) && alcance(user, areaId) !== null;
}

// Cargar también exige que haya a quién cargarle: al menos un asesor activo a su alcance.
async function puedeCargarAhora(user, areaId) {
  return puedeCargar(user, areaId) && (await asesoresCargables(user, areaId)).length > 0;
}

// Categorías del catálogo activo del área, en su orden.
async function categoriasDe(areaId) {
  const filas = await SvProducto.findAll({
    attributes: ['prod_categoria'],
    where: { prod_area_id: areaId, prod_activo: 1, prod_tipo: { [Op.ne]: '' }, prod_categoria: { [Op.ne]: '' } },
    group: ['prod_categoria'],
    order: [[fn('MIN', col('prod_orden_display')), 'ASC'], ['prod_categoria', 'ASC']],
    raw: true
  });
  return filas.map((f) => f.prod_categoria);
}

const llave = (usrId, categoria) => `${usrId}|${categoria}`;

// Presupuesto cargado del mes: 'asesor|categoría' → valor.
async function valoresDelMes(areaId, anio, mes, ids, transaction) {
  const where = { pre_area_id: areaId, pre_anio: anio, pre_mes: mes };
  if (ids) where.pre_usr_id = { [Op.in]: ids };
  const filas = await SvPresupuesto.findAll({
    attributes: ['pre_usr_id', 'pre_categoria', 'pre_valor'], where, raw: true, ...(transaction ? { transaction } : {})
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
    attributes: ['usr_id', 'usr_nombre', 'usr_apellido', 'usr_grupo_id', 'usr_activo', 'usr_id_identidad'],
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
  for (const [k, valor] of [...deVisibles(presupuesto), ...deVisibles(realizado)]) {
    if (valor === 0) continue;
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
    puede_cargar: await puedeCargarAhora(user, areaId),
    categorias,
    grupos: [...grupos].sort(([a], [b]) => a - b).map(([grupo_id, nombre]) => ({ grupo_id, nombre })),
    asesores,
    total,
    actualizado: await ultimoCambio(areaId, anio, mes, ids)
  };
}

// ─── Carga: plantilla, revisión y guardado ───

function exigirCarga(user, areaId) {
  if (!puedeCargar(user, areaId)) throw error('FORBIDDEN', 'No puedes cargar el presupuesto de esta área');
}

// Categorías del área y asesores a quienes puede cargar quien pide.
async function contextoDeCarga(user, areaId) {
  exigirCarga(user, areaId);
  const categorias = await categoriasDe(areaId);
  if (!categorias.length) throw error('VALIDATION_ERROR', 'Esta área no maneja presupuesto por categorías');
  return { categorias, asesores: await asesoresCargables(user, areaId) };
}

const porGrupoYNombre = (a, b) => {
  const g = (a.grupo?.grupo_nombre ?? '\uffff').localeCompare(b.grupo?.grupo_nombre ?? '\uffff', 'es');
  return g || nombreDe(a).localeCompare(nombreDe(b), 'es');
};

/** Libro del mes: con lo cargado o, si no hay nada, con lo del mes anterior. */
async function plantilla({ user, areaId, anio, mes }) {
  const { categorias, asesores } = await contextoDeCarga(user, areaId);
  const ids = asesores.map((a) => a.usr_id);
  // Por asesor: los de este mes si tiene alguno; si no, los del mes anterior.
  const delMes = await valoresDelMes(areaId, anio, mes, ids);
  const conMes = new Set([...delMes.keys()].map((k) => Number(k.split('|')[0])));
  let previos = new Map();
  if (ids.some((id) => !conMes.has(Number(id)))) {
    const [anioPrevio, mesPrevio] = mes === 1 ? [anio - 1, 12] : [anio, mes - 1];
    previos = await valoresDelMes(areaId, anioPrevio, mesPrevio, ids);
  }
  const valorDe = (id, c) => (conMes.has(Number(id)) ? delMes : previos).get(llave(id, c)) || 0;
  const area = await SvArea.findByPk(areaId, { attributes: ['area_nombre'] });
  const areaNombre = area?.area_nombre || 'area';
  const redes = await adUsuariosPorIdentidad(asesores.map((a) => a.usr_id_identidad));

  const filas = [...asesores].sort(porGrupoYNombre).map((a) => ({
    usr_id: a.usr_id,
    usuario_red: redes.get(a.usr_id_identidad) || '',
    nombre: nombreDe(a),
    valores: Object.fromEntries(categorias.map((c) => [c, valorDe(a.usr_id, c)]))
  }));
  const buffer = await excel.escribir({
    titulo: `Presupuesto ${areaNombre} — ${excel.nombreMes(mes)} ${anio}`, areaId, anio, mes, categorias, filas
  });
  return { buffer, nombre: excel.nombreArchivo({ areaNombre, anio, mes }) };
}

// Lo guardado de un asesor en categorías que ya no están en el catálogo: al guardar se pone en 0.
function fueraDelCatalogo(guardado, usrId, categorias) {
  const salida = [];
  for (const [k, valor] of guardado) {
    const [id, ...resto] = k.split('|');
    const categoria = resto.join('|');
    if (Number(id) === Number(usrId) && valor !== 0 && !categorias.includes(categoria)) salida.push([categoria, valor]);
  }
  return salida;
}

/** Lee el archivo y dice qué cambiaría. No guarda nada. */
async function revisar({ user, areaId, anio, mes, buffer }) {
  const { categorias, asesores } = await contextoDeCarga(user, areaId);
  let leido;
  try {
    leido = await excel.leer(buffer, {
      areaId, anio, mes, categorias,
      asesores: asesores.map((a) => ({ usr_id: a.usr_id, nombre: nombreDe(a) }))
    });
  } catch (e) {
    // Un error del libro entero se informa como los demás: sin fila ni columna.
    if (e.code !== 'VALIDATION_ERROR') throw e;
    return { filas: [], cambios: [], errores: [{ fila: null, columna: null, mensaje: e.message }] };
  }
  const { filas, errores } = leido;
  if (errores.length) return { filas: [], cambios: [], errores };

  const guardado = await valoresDelMes(areaId, anio, mes, filas.map((f) => f.usr_id));
  const cambios = [];
  for (const f of filas) {
    for (const categoria of categorias) {
      const antes = guardado.get(llave(f.usr_id, categoria)) || 0;
      const despues = f.valores[categoria];
      if (antes !== despues) cambios.push({ usr_id: f.usr_id, nombre: f.nombre, categoria, antes, despues });
    }
    for (const [categoria, antes] of fueraDelCatalogo(guardado, f.usr_id, categorias)) {
      cambios.push({ usr_id: f.usr_id, nombre: f.nombre, categoria, antes, despues: 0 });
    }
  }
  return { filas, cambios, errores };
}

const enteroValido = (v) => Number.isInteger(v) && v >= 0 && v <= VALOR_MAXIMO;

/** Guarda en una sola transacción. Valida de nuevo: no se fía de lo que dijo revisar. */
async function guardar({ user, areaId, anio, mes, filas }) {
  const { categorias, asesores } = await contextoDeCarga(user, areaId);
  if (!Array.isArray(filas) || !filas.length) throw error('VALIDATION_ERROR', 'No hay valores para guardar');
  if (filas.length > MAX_FILAS) throw error('VALIDATION_ERROR', `Son demasiadas filas (máximo ${MAX_FILAS})`);
  const permitidos = new Set(asesores.map((a) => Number(a.usr_id)));

  const vistos = new Set();
  const pedidos = []; // [usr_id, categoría, valor]
  for (const f of filas) {
    const usrId = Number(f?.usr_id);
    if (!permitidos.has(usrId)) throw error('FORBIDDEN', 'Hay asesores fuera de tu alcance o que ya no están activos');
    if (vistos.has(usrId)) throw error('VALIDATION_ERROR', 'Un asesor está repetido');
    vistos.add(usrId);
    const entradas = Object.entries(f.valores || {});
    if (!entradas.length) throw error('VALIDATION_ERROR', 'Una fila no trae valores');
    for (const [categoria, valor] of entradas) {
      if (!categorias.includes(categoria)) throw error('VALIDATION_ERROR', 'Hay una categoría que no es del catálogo');
      if (!enteroValido(valor)) throw error('VALIDATION_ERROR', `Los valores son enteros de 0 a ${VALOR_MAXIMO.toLocaleString('es-CO')}`);
      pedidos.push([usrId, categoria, valor]);
    }
  }

  const t = await sequelize.transaction();
  try {
    // Solo se marca autor y fecha en lo que de verdad cambia.
    const guardado = await valoresDelMes(areaId, anio, mes, [...vistos], t);
    const ahora = new Date();
    const registro = (usrId, categoria, valor) => ({
      pre_usr_id: usrId, pre_area_id: areaId, pre_anio: anio, pre_mes: mes, pre_categoria: categoria,
      pre_valor: valor, pre_created_by: user.usr_id, pre_updated_by: user.usr_id, pre_updated_at: ahora
    });
    // Primero los ceros de lo que salió del catálogo: la llave única no distingue tildes ni mayúsculas
    // y, si el 0 viejo llegara después, borraría el valor de la categoría nueva.
    const registros = [];
    for (const usrId of vistos) {
      for (const [categoria] of fueraDelCatalogo(guardado, usrId, categorias)) registros.push(registro(usrId, categoria, 0));
    }
    // Un 0 sin fila previa también se guarda (para que la plantilla no lo rellene con el mes anterior).
    const pendientes = pedidos.filter(([u, c, v]) => guardado.get(llave(u, c)) !== v);
    pendientes.forEach(([u, c, v]) => registros.push(registro(u, c, v)));
    // Solo cuentan como cambio los valores que de verdad cambian, como en revisar.
    const cambiaron = [
      ...registros.filter((r) => r.pre_valor === 0 && !categorias.includes(r.pre_categoria)),
      ...pendientes.filter(([u, c, v]) => (guardado.get(llave(u, c)) || 0) !== v).map(([u, c, v]) => registro(u, c, v))
    ];
    if (registros.length) {
      await SvPresupuesto.bulkCreate(registros, {
        updateOnDuplicate: ['pre_valor', 'pre_updated_by', 'pre_updated_at', 'pre_categoria'], transaction: t
      });
    }
    await t.commit();
    return { guardados: new Set(cambiaron.map((r) => r.pre_usr_id)).size, cambios: cambiaron.length };
  } catch (e) {
    try { await t.rollback(); } catch { /* el error que importa es el original */ }
    throw e;
  }
}

module.exports = {
  alcance, puedeCargar, categoriasDe, asesoresCargables, valoresDelMes, consultar,
  plantilla, revisar, guardar, ROLES_QUE_CARGAN
};
