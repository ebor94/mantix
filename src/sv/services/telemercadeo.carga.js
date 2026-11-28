/**
 * sv/services/telemercadeo.carga.js
 * Escribe en GenFlow los clientes de un libro de telemercadeo: una lista por libro y,
 * por cliente, persona + prospecto + productos + gestión en su propia transacción.
 * Sin aplicar solo consulta. Escribe directo con los modelos (no tienen hooks) para que
 * la carga no dispare avisos ni webhooks de los servicios de GenFlow.
 */
const { Op } = require('sequelize');
const M = require('../models');
const { OrgIdentidad } = require('../../identity/models');
const { normalizarAdUsuario } = require('../../identity/services/vinculoAd.service');
const T = require('./telemercadeo.traduccion');

class MigracionError extends Error {}

async function resolverAsesora(asesorCrudo) {
  const ad = normalizarAdUsuario(asesorCrudo);
  if (!ad) throw new MigracionError('Falta --asesor con el usuario de red de la asesora.');
  const area = await M.SvArea.findOne({ where: { area_codigo: 'PRENEC' }, attributes: ['area_id'] });
  if (!area) throw new MigracionError('No existe el área PRENEC.');

  const atributos = ['usr_id', 'usr_nombre', 'usr_apellido', 'usr_area_id', 'usr_grupo_id'];
  const identidades = await OrgIdentidad.findAll({ where: { ad_usuario: ad }, attributes: ['id_identidad'], raw: true });
  let usuarios = identidades.length
    ? await M.SvUsuario.findAll({
      where: { usr_activo: 1, usr_id_identidad: { [Op.in]: identidades.map((i) => i.id_identidad) } },
      attributes: atributos
    })
    : [];
  if (!usuarios.length) {
    const patron = `${ad.replace(/[\\%_]/g, (c) => `\\${c}`)}@%`;
    usuarios = await M.SvUsuario.findAll({ where: { usr_activo: 1, usr_email: { [Op.like]: patron } }, attributes: atributos });
  }

  if (!usuarios.length) throw new MigracionError(`No hay un usuario activo de GenFlow con el usuario de red «${ad}».`);
  if (usuarios.length > 1) {
    throw new MigracionError(`El usuario de red «${ad}» corresponde a ${usuarios.length} usuarios de GenFlow; hay que dejar uno solo.`);
  }
  const u = usuarios[0];
  if (u.usr_area_id !== area.area_id) throw new MigracionError(`«${ad}» no es de Prenecesidad.`);
  if (!u.usr_grupo_id) throw new MigracionError(`«${ad}» no tiene grupo de trabajo.`);
  return { ad, usr_id: u.usr_id, nombre: `${u.usr_nombre} ${u.usr_apellido}`.trim(), grupo_id: u.usr_grupo_id, area_id: area.area_id };
}

async function cargarCatalogos({ area_id, grupo_id }) {
  const [estados, fuentes, puntos, productos] = await Promise.all([
    M.SvEstado.findAll({
      where: { estado_grupo_id: grupo_id, estado_codigo: { [Op.in]: T.CODIGOS_ESTADO }, estado_activo: 1 },
      attributes: ['estado_id', 'estado_codigo']
    }),
    M.SvFuente.findAll({
      where: { fuente_area_id: area_id, fuente_codigo: { [Op.in]: T.CODIGOS_FUENTE }, fuente_activa: 1 },
      attributes: ['fuente_id', 'fuente_codigo']
    }),
    M.SvPunto.findAll({
      where: { punto_codigo: { [Op.in]: T.CODIGOS_PUNTO }, punto_activo: 1 },
      attributes: ['punto_id', 'punto_codigo']
    }),
    M.SvProducto.findAll({
      where: { prod_area_id: area_id, prod_codigo: { [Op.in]: T.CODIGOS_PRODUCTO }, prod_activo: 1 },
      attributes: ['prod_id', 'prod_codigo', 'prod_nombre', 'prod_precio_base', 'prod_es_generico']
    })
  ]);
  const catalogos = {
    estados: new Map(estados.map((e) => [e.estado_codigo, e.estado_id])),
    fuentes: new Map(fuentes.map((f) => [f.fuente_codigo, f.fuente_id])),
    puntos: new Map(puntos.map((p) => [p.punto_codigo, p.punto_id])),
    productos: new Map(productos.map((p) => [p.prod_codigo, {
      prod_id: p.prod_id,
      nombre: p.prod_nombre,
      // Misma regla que prospectos.service (migración 025): genérico o sin precio → null.
      precio: !p.prod_es_generico && Number(p.prod_precio_base) > 0 ? p.prod_precio_base : null
    }]))
  };
  const faltan = [
    ...T.CODIGOS_ESTADO.filter((c) => !catalogos.estados.has(c)).map((c) => `estado ${c}`),
    ...T.CODIGOS_FUENTE.filter((c) => !catalogos.fuentes.has(c)).map((c) => `fuente ${c}`),
    ...T.CODIGOS_PUNTO.filter((c) => !catalogos.puntos.has(c)).map((c) => `punto ${c}`),
    ...T.CODIGOS_PRODUCTO.filter((c) => !catalogos.productos.has(c)).map((c) => `producto ${c}`)
  ];
  if (faltan.length) throw new MigracionError(`Faltan en los catálogos de GenFlow: ${faltan.join(', ')}.`);
  return catalogos;
}

function nombreLista(ad, archivo) {
  return `Telemercadeo ${ad} — ${archivo}`.slice(0, 150);
}

async function motivoOmision(personaId, areaId, lista) {
  const p = await M.SvProspecto.findOne({
    where: { prosp_persona_id: personaId, prosp_area_id: areaId, prosp_activo: 1 },
    attributes: ['prosp_id', 'prosp_lista_id', 'prosp_asesor_id', 'prosp_estado_id']
  });
  if (!p) return null;
  if (lista && p.prosp_lista_id === lista.lista_id) return 'ya cargado por esta lista';
  const [asesor, estado] = await Promise.all([
    p.prosp_asesor_id ? M.SvUsuario.findByPk(p.prosp_asesor_id, { attributes: ['usr_nombre', 'usr_apellido'] }) : null,
    M.SvEstado.findByPk(p.prosp_estado_id, { attributes: ['estado_nombre'] })
  ]);
  const quien = asesor ? `${asesor.usr_nombre} ${asesor.usr_apellido}`.trim() : 'sin asesora';
  return `ya tiene prospecto activo en Prenecesidad (${quien}, ${estado?.estado_nombre ?? 'estado desconocido'})`;
}

async function crearCliente({ plan, persona, asesora, catalogos, lista }) {
  const t = await M.sequelize.transaction();
  try {
    const personaId = persona ? persona.persona_id : (await M.SvPersona.create({
      persona_nombre: plan.persona.nombre,
      persona_telefono_principal: plan.persona.telefono,
      persona_telefono_norm: plan.persona.telefono,
      persona_telefono_alterno: plan.persona.alterno
    }, { transaction: t })).persona_id;
    const estadoId = catalogos.estados.get(plan.estado);
    const prospecto = await M.SvProspecto.create({
      prosp_area_id: asesora.area_id,
      prosp_grupo_id: asesora.grupo_id,
      prosp_persona_id: personaId,
      prosp_asesor_id: asesora.usr_id,
      prosp_estado_id: estadoId,
      prosp_fuente_id: catalogos.fuentes.get(plan.fuente),
      prosp_punto_id: plan.punto ? catalogos.puntos.get(plan.punto) : null,
      prosp_lista_id: lista.lista_id,
      prosp_prox_gestion_fecha: plan.proxima,
      prosp_prioridad: plan.prioridad,
      prosp_nota_inicial: plan.notaInicial,
      prosp_activo: 1
    }, { transaction: t });
    for (const [i, codigo] of plan.productos.entries()) {
      const producto = catalogos.productos.get(codigo);
      await M.SvProspectoProducto.create({
        pp_prosp_id: prospecto.prosp_id,
        pp_prod_id: producto.prod_id,
        pp_es_principal: i === 0 ? 1 : 0,
        pp_precio_ofrecido: producto.precio
      }, { transaction: t });
    }
    await M.SvGestion.create({
      gest_prosp_id: prospecto.prosp_id,
      gest_asesor_id: asesora.usr_id,
      gest_estado_nuevo_id: estadoId,
      gest_canal: 'llamada',
      gest_comentario: plan.gestion.comentario,
      // A las 12:00 para que la zona horaria no la mueva de día.
      gest_fecha_hora: new Date(`${plan.gestion.fecha}T12:00:00`),
      gest_prox_fecha: plan.proxima
    }, { transaction: t });
    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

async function cerrarLista(lista, resultados, avisos) {
  const cuenta = (r) => resultados.filter((x) => x.resultado === r).length;
  const resumen = {
    fecha: new Date().toISOString(),
    leidos: resultados.length,
    creados: cuenta('se crea'),
    omitidos: cuenta('omitido'),
    errores: cuenta('error'),
    avisos: avisos.length
  };
  await lista.update({
    lista_total_registros: resumen.leidos,
    lista_importadas: await M.SvProspecto.count({ where: { prosp_lista_id: lista.lista_id, prosp_activo: 1 } }),
    lista_duplicados_omit: resumen.omitidos,
    lista_errores: resumen.errores,
    lista_estado: 'completada',
    lista_log: resumen
  });
}

async function cargar({ filas, asesora, catalogos, archivo, hoy, aplicar }) {
  const nombre = nombreLista(asesora.ad, archivo);
  let lista = await M.SvLista.findOne({ where: { lista_area_id: asesora.area_id, lista_nombre: nombre, lista_activa: 1 } });
  if (aplicar && !lista) {
    lista = await M.SvLista.create({
      lista_area_id: asesora.area_id,
      lista_grupo_id: asesora.grupo_id,
      lista_fuente_id: catalogos.fuentes.get('LISTA_TELE'),
      lista_cargada_por: asesora.usr_id,
      lista_nombre: nombre,
      lista_estado: 'procesando'
    });
  }

  const resultados = [];
  const avisos = [];
  for (const fila of filas) {
    if (fila.descarte) {
      resultados.push({ fila, plan: null, ...fila.descarte });
      continue;
    }
    const plan = T.traducirFila(fila, { archivo, hoy });
    for (const mensaje of plan.avisos) avisos.push({ hoja: fila.hoja, fila: fila.fila, tipo: 'aviso', mensaje });

    const persona = await M.SvPersona.findOne({ where: { persona_telefono_norm: plan.persona.telefono }, attributes: ['persona_id'] });
    const omision = persona ? await motivoOmision(persona.persona_id, asesora.area_id, lista) : null;
    if (omision) {
      resultados.push({ fila, plan, resultado: 'omitido', detalle: omision });
      continue;
    }
    const detalle = persona ? 'persona existente' : 'persona nueva';
    if (!aplicar) {
      resultados.push({ fila, plan, resultado: 'se crearía', detalle });
      continue;
    }
    try {
      await crearCliente({ plan, persona, asesora, catalogos, lista });
      resultados.push({ fila, plan, resultado: 'se crea', detalle });
    } catch (e) {
      resultados.push({ fila, plan, resultado: 'error', detalle: e.message });
    }
  }
  if (aplicar) await cerrarLista(lista, resultados, avisos);
  return { resultados, avisos, lista };
}

module.exports = { MigracionError, resolverAsesora, cargarCatalogos, nombreLista, cargar };
