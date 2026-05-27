/**
 * sv/services/fidelizacion.service.js
 *
 * Lógica de negocio del módulo Fidelización Empresas (Fase 6).
 *
 * Funciones:
 *   - listarContactosEmpresa(empresaId)
 *   - crearContacto({empresaId, persona, cargo, ..., fechasEspeciales}, asesorId)
 *   - actualizarContacto(cfId, payload)
 *   - eliminarContactoSoft(cfId)
 *   - agregarFecha(cfId, payload)        — agrega fecha extra a un contacto existente
 *   - eliminarFecha(feId)
 *   - proximosCumpleanos({dias=3, asesorId=null})
 *   - calendarioMes({anio, mes})
 *   - registrarEnvio(payload, agenteId)
 *   - actualizarEnvio(envId, {estado, evidencia_url, comentario})
 *   - historialEnviosPersona(personaId)
 *   - metricasFidelizacion({agenteId, desde, hasta})
 */

const { Op, fn, col, literal, where: whereFn } = require('sequelize');
const {
  sequelize,
  SvContactoFideliz, SvFechaEspecial, SvEnvio,
  SvPersona, SvEmpresa, SvUsuario, SvProspecto, SvEstado, SvGrupo
} = require('../models');
const personas = require('./personas.service');
const { aISO, hoyISO } = require('../utils/fechas');
const {
  diaMadre, diaPadre, fechasDerivadas, proximaOcurrencia,
  TIPOS_FECHA, ESTADOS_ENVIO
} = require('../utils/fechasEspeciales');

class FidelizError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

// =====================================================================
// Contactos por empresa
// =====================================================================

/**
 * Lista TODOS los contactos activos de fidelización con su empresa y fechas.
 * Incluye conteo de envíos y último envío por contacto.
 * Usado en la vista "Mis Contactos" del agente/supervisor.
 */
async function listarTodosContactos({ q = null } = {}) {
  const where = { cf_activo: 1 };

  const contactos = await SvContactoFideliz.findAll({
    where,
    include: [
      {
        model: SvPersona, as: 'persona',
        include: [{ model: SvFechaEspecial, as: 'fechasEspeciales', where: { fe_activa: 1 }, required: false }]
      },
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id', 'empresa_razon_social', 'empresa_nit', 'empresa_sector'] }
    ],
    order: [['cf_es_titular', 'DESC'], ['cf_created_at', 'DESC']]
  });

  // Enriquecer con conteo de envíos y último envío
  const personaIds = contactos.map(c => c.cf_persona_id);
  let mapEnvios = new Map();
  if (personaIds.length) {
    const envios = await SvEnvio.findAll({
      where: { env_persona_id: personaIds },
      attributes: [
        'env_persona_id',
        [fn('COUNT', col('env_id')), 'total'],
        [fn('MAX', col('env_fecha_envio')), 'ultimo']
      ],
      group: ['env_persona_id'],
      raw: true
    });
    mapEnvios = new Map(envios.map(e => [e.env_persona_id, { total: parseInt(e.total), ultimo: e.ultimo }]));
  }

  let list = contactos.map(c => {
    const j = c.toJSON();
    const stats = mapEnvios.get(c.cf_persona_id);
    j.envios_total = stats?.total || 0;
    j.ultimo_envio = stats?.ultimo || null;
    return j;
  });

  // Filtro de búsqueda libre
  if (q?.trim()) {
    const t = q.toLowerCase();
    list = list.filter(c =>
      (c.persona?.persona_nombre || '').toLowerCase().includes(t)
      || (c.persona?.persona_apellido || '').toLowerCase().includes(t)
      || (c.empresa?.empresa_razon_social || '').toLowerCase().includes(t)
      || (c.cf_cargo || '').toLowerCase().includes(t)
    );
  }

  return list;
}

async function listarContactosEmpresa(empresaId) {
  const contactos = await SvContactoFideliz.findAll({
    where: { cf_empresa_id: empresaId, cf_activo: 1 },
    include: [
      {
        model: SvPersona,
        as: 'persona',
        include: [{ model: SvFechaEspecial, as: 'fechasEspeciales', where: { fe_activa: 1 }, required: false }]
      },
      { model: SvUsuario, as: 'capturadoPor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
    ],
    order: [['cf_es_titular', 'DESC'], ['cf_created_at', 'DESC']]
  });

  // Enriquecer con último envío por contacto
  const personaIds = contactos.map(c => c.cf_persona_id);
  let ultimosPorPersona = new Map();
  if (personaIds.length) {
    const ultimos = await SvEnvio.findAll({
      where: { env_persona_id: personaIds },
      attributes: ['env_persona_id', [fn('MAX', col('env_fecha_envio')), 'ultimo']],
      group: ['env_persona_id'],
      raw: true
    });
    ultimosPorPersona = new Map(ultimos.map(u => [u.env_persona_id, u.ultimo]));
  }
  return contactos.map(c => {
    const j = c.toJSON();
    j.ultimo_envio = ultimosPorPersona.get(c.cf_persona_id) || null;
    return j;
  });
}

/**
 * Crea contacto. Si la persona no existe (por teléfono) la crea, si existe
 * reusa. Inserta fechas especiales asociadas en la misma transacción.
 *
 * payload = {
 *   empresa_id, cargo, departamento, fecha_ingreso, es_titular, observaciones,
 *   persona: { nombre, apellido, telefono_principal, email, fecha_nacimiento, genero, ... },
 *   fechas_especiales: [{ tipo, fecha, descripcion }]
 * }
 */
async function crearContacto(payload, asesorId) {
  const empresa = await SvEmpresa.findByPk(payload.empresa_id);
  if (!empresa) throw new FidelizError('NOT_FOUND', 'Empresa no encontrada');

  const personaPayload = payload.persona;
  if (!personaPayload?.persona_telefono_principal && !personaPayload?.persona_nombre) {
    throw new FidelizError('VALIDATION_ERROR', 'Datos de persona requeridos');
  }

  const t = await sequelize.transaction();
  try {
    // 1) Persona: reusar si ya existe por teléfono, sino crear
    let persona;
    try {
      persona = await personas.crear(personaPayload);
    } catch (e) {
      if (e.code === 'DUPLICATE_PHONE') {
        // Reusar persona existente y actualizar campos vacíos
        persona = e.persona;
        const patch = {};
        if (personaPayload.persona_fecha_nacimiento && !persona.persona_fecha_nacimiento) {
          patch.persona_fecha_nacimiento = personaPayload.persona_fecha_nacimiento;
        }
        if (personaPayload.persona_genero && !persona.persona_genero) {
          patch.persona_genero = personaPayload.persona_genero;
        }
        if (personaPayload.persona_email && !persona.persona_email) {
          patch.persona_email = personaPayload.persona_email;
        }
        if (Object.keys(patch).length) await persona.update(patch, { transaction: t });
      } else throw e;
    }

    // 2) Contacto (UNIQUE empresa+persona)
    const yaExiste = await SvContactoFideliz.findOne({
      where: { cf_empresa_id: payload.empresa_id, cf_persona_id: persona.persona_id },
      transaction: t
    });
    if (yaExiste) {
      if (yaExiste.cf_activo) {
        throw new FidelizError('DUPLICATE_CONTACTO', 'Esta persona ya está registrada como contacto de la empresa');
      }
      // Reactivar
      await yaExiste.update({
        cf_activo: 1,
        cf_cargo: payload.cargo || yaExiste.cf_cargo,
        cf_departamento: payload.departamento || yaExiste.cf_departamento,
        cf_fecha_ingreso: payload.fecha_ingreso || yaExiste.cf_fecha_ingreso,
        cf_es_titular: payload.es_titular ?? yaExiste.cf_es_titular,
        cf_observaciones: payload.observaciones || yaExiste.cf_observaciones,
        cf_capturado_por: asesorId
      }, { transaction: t });
      await t.commit();
      return yaExiste;
    }

    const contacto = await SvContactoFideliz.create({
      cf_empresa_id:    payload.empresa_id,
      cf_persona_id:    persona.persona_id,
      cf_cargo:         payload.cargo || null,
      cf_departamento:  payload.departamento || null,
      cf_fecha_ingreso: payload.fecha_ingreso || null,
      cf_es_titular:    payload.es_titular ? 1 : 0,
      cf_observaciones: payload.observaciones || null,
      cf_capturado_por: asesorId
    }, { transaction: t });

    // 3) Fechas especiales
    const fechas = payload.fechas_especiales || [];
    for (const f of fechas) {
      if (!f.fecha || !f.tipo) continue;
      if (!TIPOS_FECHA.includes(f.tipo)) {
        throw new FidelizError('VALIDATION_ERROR', `Tipo de fecha inválido: ${f.tipo}`);
      }
      // dia_madre/dia_padre se derivan, no se insertan manualmente
      if (f.tipo === 'dia_madre' || f.tipo === 'dia_padre') continue;
      await SvFechaEspecial.create({
        fe_persona_id:  persona.persona_id,
        fe_tipo:        f.tipo,
        fe_fecha:       aISO(f.fecha),
        fe_descripcion: f.descripcion || null
      }, { transaction: t });
    }

    await t.commit();
    return contacto;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

async function actualizarContacto(cfId, payload) {
  const c = await SvContactoFideliz.findByPk(cfId);
  if (!c) throw new FidelizError('NOT_FOUND', 'Contacto no encontrado');
  const allowed = ['cf_cargo', 'cf_departamento', 'cf_fecha_ingreso', 'cf_es_titular', 'cf_observaciones'];
  const patch = {};
  for (const k of allowed) if (payload[k] !== undefined) patch[k] = payload[k];
  await c.update(patch);
  return c;
}

async function eliminarContactoSoft(cfId) {
  const c = await SvContactoFideliz.findByPk(cfId);
  if (!c) throw new FidelizError('NOT_FOUND', 'Contacto no encontrado');
  await c.update({ cf_activo: 0 });
  return { ok: true };
}

async function agregarFecha(personaId, payload) {
  if (!TIPOS_FECHA.includes(payload.tipo)) {
    throw new FidelizError('VALIDATION_ERROR', `Tipo inválido: ${payload.tipo}`);
  }
  if (payload.tipo === 'dia_madre' || payload.tipo === 'dia_padre') {
    throw new FidelizError('VALIDATION_ERROR', 'Día madre/padre se derivan del género, no se almacenan.');
  }
  return SvFechaEspecial.create({
    fe_persona_id:  personaId,
    fe_tipo:        payload.tipo,
    fe_fecha:       aISO(payload.fecha),
    fe_descripcion: payload.descripcion || null
  });
}

async function eliminarFecha(feId) {
  const f = await SvFechaEspecial.findByPk(feId);
  if (!f) throw new FidelizError('NOT_FOUND', 'Fecha no encontrada');
  await f.update({ fe_activa: 0 });
  return { ok: true };
}

// =====================================================================
// Próximos cumpleaños / fechas especiales
// =====================================================================

/**
 * Devuelve contactos cuya próxima fecha especial (de cualquier tipo, incluyendo
 * derivadas madre/padre) cae en los próximos `dias` días (default 3).
 *
 * Estrategia:
 *  1) Cargamos TODOS los contactos activos de empresas con prospecto ganado.
 *     (Si el equipo crece, se puede optimizar a SQL puro con MONTH/DAY.)
 *  2) Por cada contacto generamos sus eventos del año (fechas almacenadas
 *     + derivadas por género) y calculamos diasRestantes.
 *  3) Filtramos diasRestantes ≤ dias y ordenamos asc.
 */
async function proximosCumpleanos({ dias = 3 } = {}) {
  const contactos = await SvContactoFideliz.findAll({
    where: { cf_activo: 1 },
    include: [
      {
        model: SvPersona,
        as: 'persona',
        include: [{ model: SvFechaEspecial, as: 'fechasEspeciales', where: { fe_activa: 1 }, required: false }]
      },
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id', 'empresa_razon_social', 'empresa_nit'] }
    ]
  });

  const anioActual = new Date().getUTCFullYear();
  const eventos = [];
  for (const c of contactos) {
    const p = c.persona;
    if (!p) continue;

    // Fechas almacenadas
    for (const f of (p.fechasEspeciales || [])) {
      const px = proximaOcurrencia(f.fe_fecha);
      if (!px) continue;
      eventos.push({
        cf_id:         c.cf_id,
        persona_id:    p.persona_id,
        persona:       { persona_id: p.persona_id, persona_nombre: p.persona_nombre, persona_apellido: p.persona_apellido, persona_telefono_principal: p.persona_telefono_principal, persona_genero: p.persona_genero },
        empresa:       c.empresa,
        cargo:         c.cf_cargo,
        tipo:          f.fe_tipo,
        descripcion:   f.fe_descripcion || null,
        fecha_origen:  f.fe_fecha,
        fecha_evento:  px.proxima,
        evento_anio:   px.anio,
        dias_restantes: px.diasRestantes,
        fecha_especial_id: f.fe_id
      });
    }

    // Fecha nacimiento como evento (también si está en persona.persona_fecha_nacimiento)
    if (p.persona_fecha_nacimiento) {
      const yaTieneNac = (p.fechasEspeciales || []).some(f => f.fe_tipo === 'nacimiento');
      if (!yaTieneNac) {
        const px = proximaOcurrencia(p.persona_fecha_nacimiento);
        if (px) {
          eventos.push({
            cf_id:         c.cf_id,
            persona_id:    p.persona_id,
            persona:       { persona_id: p.persona_id, persona_nombre: p.persona_nombre, persona_apellido: p.persona_apellido, persona_telefono_principal: p.persona_telefono_principal, persona_genero: p.persona_genero },
            empresa:       c.empresa,
            cargo:         c.cf_cargo,
            tipo:          'nacimiento',
            descripcion:   'Cumpleaños',
            fecha_origen:  p.persona_fecha_nacimiento,
            fecha_evento:  px.proxima,
            evento_anio:   px.anio,
            dias_restantes: px.diasRestantes,
            fecha_especial_id: null
          });
        }
      }
    }

    // Derivadas por género (este año + próximo)
    for (const anio of [anioActual, anioActual + 1]) {
      const derivadas = fechasDerivadas(p.persona_genero, anio);
      for (const d of derivadas) {
        const px = proximaOcurrencia(d.fecha);
        if (!px) continue;
        eventos.push({
          cf_id:         c.cf_id,
          persona_id:    p.persona_id,
          persona:       { persona_id: p.persona_id, persona_nombre: p.persona_nombre, persona_apellido: p.persona_apellido, persona_telefono_principal: p.persona_telefono_principal, persona_genero: p.persona_genero },
          empresa:       c.empresa,
          cargo:         c.cf_cargo,
          tipo:          d.tipo,
          descripcion:   d.descripcion,
          fecha_origen:  d.fecha,
          fecha_evento:  px.proxima,
          evento_anio:   px.anio,
          dias_restantes: px.diasRestantes,
          fecha_especial_id: null
        });
      }
    }
  }

  // Filtrar por ventana y deduplicar (cada persona+tipo+anio una sola fila)
  const seen = new Set();
  const filtrados = eventos.filter(e => {
    if (e.dias_restantes < 0 || e.dias_restantes > dias) return false;
    const key = `${e.persona_id}|${e.tipo}|${e.evento_anio}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Enriquecer con último envío del año vigente
  if (filtrados.length) {
    const ids = [...new Set(filtrados.map(e => e.persona_id))];
    const envios = await SvEnvio.findAll({
      where: {
        env_persona_id: ids,
        env_evento_anio: { [Op.in]: [...new Set(filtrados.map(e => e.evento_anio))] }
      },
      attributes: ['env_persona_id', 'env_evento_tipo', 'env_evento_anio', 'env_id', 'env_estado', 'env_fecha_envio'],
      raw: true
    });
    const map = new Map(envios.map(e => [`${e.env_persona_id}|${e.env_evento_tipo}|${e.env_evento_anio}`, e]));
    for (const e of filtrados) {
      const key = `${e.persona_id}|${e.tipo}|${e.evento_anio}`;
      e.envio_existente = map.get(key) || null;
    }
  }

  filtrados.sort((a, b) => a.dias_restantes - b.dias_restantes);
  return filtrados;
}

/**
 * Devuelve eventos del mes (almacenados + derivados) agrupados por fecha.
 * Format: [{ fecha: 'YYYY-MM-DD', total: N, tipos: ['nacimiento','dia_madre',...] }]
 */
async function calendarioMes({ anio, mes }) {
  // Cargamos contactos activos con fechas
  const contactos = await SvContactoFideliz.findAll({
    where: { cf_activo: 1 },
    include: [{
      model: SvPersona, as: 'persona',
      include: [{ model: SvFechaEspecial, as: 'fechasEspeciales', where: { fe_activa: 1 }, required: false }]
    }]
  });

  const map = new Map();
  function push(fechaISO, tipo) {
    if (!fechaISO) return;
    if (!fechaISO.startsWith(`${anio}-${String(mes).padStart(2, '0')}`)) return;
    if (!map.has(fechaISO)) map.set(fechaISO, { fecha: fechaISO, total: 0, tipos: [] });
    const e = map.get(fechaISO);
    e.total += 1;
    if (!e.tipos.includes(tipo)) e.tipos.push(tipo);
  }

  for (const c of contactos) {
    const p = c.persona;
    if (!p) continue;
    // Fechas almacenadas: trasladar a mismo día del año pedido
    for (const f of (p.fechasEspeciales || [])) {
      const iso = aISO(f.fe_fecha);
      const m = iso && iso.match(/^\d{4}-(\d{2})-(\d{2})/);
      if (!m) continue;
      const trasladada = `${anio}-${m[1]}-${m[2]}`;
      push(trasladada, f.fe_tipo);
    }
    if (p.persona_fecha_nacimiento) {
      const iso = aISO(p.persona_fecha_nacimiento);
      const m = iso && iso.match(/^\d{4}-(\d{2})-(\d{2})/);
      if (m) {
        const yaTiene = (p.fechasEspeciales || []).some(f => f.fe_tipo === 'nacimiento');
        if (!yaTiene) push(`${anio}-${m[1]}-${m[2]}`, 'nacimiento');
      }
    }
    // Derivadas
    const derivadas = fechasDerivadas(p.persona_genero, anio);
    for (const d of derivadas) push(d.fecha, d.tipo);
  }

  return [...map.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// =====================================================================
// Envíos (gestiones inmutables)
// =====================================================================

async function registrarEnvio(payload, agenteId) {
  const {
    persona_id, empresa_id, fecha_especial_id = null,
    evento_anio, evento_tipo, tipo_detalle, direccion_entrega,
    estado = 'enviado', evidencia_url, comentario
  } = payload;

  if (!persona_id || !empresa_id || !evento_anio || !evento_tipo) {
    throw new FidelizError('VALIDATION_ERROR', 'persona_id, empresa_id, evento_anio y evento_tipo requeridos');
  }
  if (!ESTADOS_ENVIO.includes(estado)) {
    throw new FidelizError('VALIDATION_ERROR', `Estado inválido: ${estado}`);
  }

  // UNIQUE (persona, evento_tipo, evento_anio, fecha_especial_id) — verificar
  const ya = await SvEnvio.findOne({
    where: {
      env_persona_id:        persona_id,
      env_evento_tipo:       evento_tipo,
      env_evento_anio:       evento_anio,
      env_fecha_especial_id: fecha_especial_id
    }
  });
  if (ya) {
    throw new FidelizError('DUPLICATE_ENVIO', 'Ya existe un envío para este contacto/evento/año');
  }

  return SvEnvio.create({
    env_persona_id:        persona_id,
    env_empresa_id:        empresa_id,
    env_fecha_especial_id: fecha_especial_id,
    env_evento_anio:       evento_anio,
    env_evento_tipo:       evento_tipo,
    env_agente_id:         agenteId,
    env_tipo_detalle:      tipo_detalle || null,
    env_direccion_entrega: direccion_entrega || null,
    env_estado:            estado,
    env_evidencia_url:     evidencia_url || null,
    env_comentario:        comentario || null
  });
}

/** Permite cambiar SOLO estado/evidencia_url/comentario (hook del modelo bloquea el resto). */
async function actualizarEnvio(envId, { estado, evidencia_url, comentario }) {
  const e = await SvEnvio.findByPk(envId);
  if (!e) throw new FidelizError('NOT_FOUND', 'Envío no encontrado');
  if (estado !== undefined && !ESTADOS_ENVIO.includes(estado)) {
    throw new FidelizError('VALIDATION_ERROR', `Estado inválido: ${estado}`);
  }
  const patch = {};
  if (estado !== undefined)         patch.env_estado = estado;
  if (evidencia_url !== undefined)  patch.env_evidencia_url = evidencia_url;
  if (comentario !== undefined)     patch.env_comentario = comentario;
  await e.update(patch);
  return e;
}

async function historialEnviosPersona(personaId) {
  return SvEnvio.findAll({
    where: { env_persona_id: personaId },
    include: [
      { model: SvUsuario, as: 'agente',  attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] },
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id', 'empresa_razon_social'] }
    ],
    order: [['env_fecha_envio', 'DESC']]
  });
}

/**
 * Timeline de TODOS los envíos hechos a una empresa (across contactos).
 * Devuelve también stats agregadas para el header (total, por estado, por tipo, por contacto).
 */
async function historialEnviosEmpresa(empresaId) {
  const envios = await SvEnvio.findAll({
    where: { env_empresa_id: empresaId },
    include: [
      { model: SvUsuario, as: 'agente',  attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] },
      { model: SvPersona, as: 'persona', attributes: ['persona_id', 'persona_nombre', 'persona_apellido', 'persona_telefono_principal'] }
    ],
    order: [['env_fecha_envio', 'DESC']]
  });

  // Stats
  const stats = {
    total:        envios.length,
    enviados:     envios.filter(e => e.env_estado === 'enviado').length,
    confirmados:  envios.filter(e => e.env_estado === 'confirmado').length,
    devueltos:    envios.filter(e => e.env_estado === 'devuelto').length,
    porcentaje_confirmados: envios.length
      ? Math.round((envios.filter(e => e.env_estado === 'confirmado').length / envios.length) * 1000) / 10
      : 0
  };

  // Conteo por tipo
  const porTipo = {};
  for (const e of envios) {
    porTipo[e.env_evento_tipo] = (porTipo[e.env_evento_tipo] || 0) + 1;
  }
  stats.por_tipo = Object.entries(porTipo).map(([tipo, total]) => ({ tipo, total }));

  // Conteo por contacto (persona)
  const porContacto = new Map();
  for (const e of envios) {
    const key = e.env_persona_id;
    if (!porContacto.has(key)) {
      porContacto.set(key, {
        persona_id: key,
        persona_nombre: e.persona?.persona_nombre,
        persona_apellido: e.persona?.persona_apellido,
        total: 0
      });
    }
    porContacto.get(key).total += 1;
  }
  stats.por_contacto = [...porContacto.values()].sort((a, b) => b.total - a.total);

  return { envios, stats };
}

/**
 * Lista de empresas que tienen al menos un contacto de fidelización registrado.
 * Incluye conteo de contactos + total y último envío.
 */
async function listarEmpresasConFideliz() {
  // IDs de empresas con contacto fideliz activo (query directo para evitar issues de include)
  const idsRows = await SvContactoFideliz.findAll({
    where: { cf_activo: 1 },
    attributes: [[fn('DISTINCT', col('cf_empresa_id')), 'empresa_id']],
    raw: true
  });
  const empresaIds = idsRows.map(r => r.empresa_id);
  if (!empresaIds.length) return [];

  const empresas = await SvEmpresa.findAll({
    where: { empresa_id: empresaIds, empresa_activa: 1 },
    order: [['empresa_razon_social', 'ASC']]
  });

  // Conteo de contactos por empresa
  const contactosCount = await SvContactoFideliz.findAll({
    where: { cf_empresa_id: empresaIds, cf_activo: 1 },
    attributes: ['cf_empresa_id', [fn('COUNT', col('cf_id')), 'total']],
    group: ['cf_empresa_id'], raw: true
  });
  const mapContactos = new Map(contactosCount.map(r => [r.cf_empresa_id, parseInt(r.total)]));

  // Conteo de envíos por empresa + último envío
  const enviosAgg = await SvEnvio.findAll({
    where: { env_empresa_id: empresaIds },
    attributes: [
      'env_empresa_id',
      [fn('COUNT', col('env_id')), 'total_envios'],
      [fn('MAX', col('env_fecha_envio')), 'ultimo_envio']
    ],
    group: ['env_empresa_id'], raw: true
  });
  const mapEnvios = new Map(enviosAgg.map(r => [r.env_empresa_id, {
    total: parseInt(r.total_envios), ultimo: r.ultimo_envio
  }]));

  return empresas.map(e => ({
    empresa_id:        e.empresa_id,
    empresa_razon_social: e.empresa_razon_social,
    empresa_nombre_comercial: e.empresa_nombre_comercial,
    empresa_nit:       e.empresa_nit,
    empresa_sector:    e.empresa_sector,
    contactos_total:   mapContactos.get(e.empresa_id) || 0,
    envios_total:      mapEnvios.get(e.empresa_id)?.total || 0,
    ultimo_envio:      mapEnvios.get(e.empresa_id)?.ultimo || null
  }));
}

async function obtenerContacto(cfId) {
  return SvContactoFideliz.findByPk(cfId, {
    include: [
      {
        model: SvPersona, as: 'persona',
        include: [{ model: SvFechaEspecial, as: 'fechasEspeciales', where: { fe_activa: 1 }, required: false }]
      },
      { model: SvEmpresa, as: 'empresa' },
      { model: SvUsuario, as: 'capturadoPor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
    ]
  });
}

async function metricasFidelizacion({ agenteId = null, desde = null, hasta = null } = {}) {
  const where = {};
  if (agenteId) where.env_agente_id = agenteId;
  if (desde) where.env_fecha_envio = { ...(where.env_fecha_envio || {}), [Op.gte]: `${aISO(desde)} 00:00:00` };
  if (hasta) where.env_fecha_envio = { ...(where.env_fecha_envio || {}), [Op.lte]: `${aISO(hasta)} 23:59:59` };

  const total      = await SvEnvio.count({ where });
  const confirmados = await SvEnvio.count({ where: { ...where, env_estado: 'confirmado' } });
  const devueltos   = await SvEnvio.count({ where: { ...where, env_estado: 'devuelto' } });
  const enviados    = await SvEnvio.count({ where: { ...where, env_estado: 'enviado' } });

  const porTipo = await SvEnvio.findAll({
    where,
    attributes: ['env_evento_tipo', [fn('COUNT', col('env_id')), 'total']],
    group: ['env_evento_tipo'],
    raw: true
  });

  return {
    total,
    confirmados,
    devueltos,
    enviados_pendientes: enviados,
    porcentaje_confirmados: total ? Math.round((confirmados / total) * 1000) / 10 : 0,
    por_tipo: porTipo.map(r => ({ tipo: r.env_evento_tipo, total: parseInt(r.total) }))
  };
}

// =====================================================================
// Helper: empresa tiene convenio firmado (prospecto ganado en grupo Empresariales)
// =====================================================================

async function empresaTieneConvenio(empresaId) {
  const count = await SvProspecto.count({
    where: { prosp_empresa_id: empresaId },
    include: [{
      model: SvEstado, as: 'estado',
      where: { estado_es_ganado: 1 }, required: true, attributes: []
    }]
  });
  return count > 0;
}

module.exports = {
  FidelizError,
  listarTodosContactos,
  listarContactosEmpresa, crearContacto, actualizarContacto, eliminarContactoSoft,
  agregarFecha, eliminarFecha,
  proximosCumpleanos, calendarioMes,
  registrarEnvio, actualizarEnvio,
  historialEnviosPersona, historialEnviosEmpresa, listarEmpresasConFideliz,
  obtenerContacto, metricasFidelizacion,
  empresaTieneConvenio
};
