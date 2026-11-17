/**
 * sv/controllers/auth.controller.js
 * Perfil del usuario de ventas (me + preferencias). El login es del SSO de
 * identidad contra el directorio activo (/api/identidad/login).
 */
const { SvUsuario } = require('../models');
const { ok } = require('../utils/response');
const { adUsuariosPorIdentidad } = require('../services/usuariosAd.service');

function publicUser(u) {
  return {
    usr_id:        u.usr_id,
    usr_email:     u.usr_email,
    usr_nombre:    u.usr_nombre,
    usr_apellido:  u.usr_apellido,
    usr_telefono:  u.usr_telefono,
    usr_area_id:   u.usr_area_id,
    usr_grupo_id:  u.usr_grupo_id,
    usr_punto_id:  u.usr_punto_id,
    usr_preferencias: u.usr_preferencias || null,
    // Fase 7: tracking GPS
    usr_consentimiento_geo_at: u.usr_consentimiento_geo_at || null,
    usr_horario_laboral:       u.usr_horario_laboral || null,
    rol:   u.rol   ? { rol_id: u.rol.rol_id, rol_codigo: u.rol.rol_codigo, rol_nombre: u.rol.rol_nombre, rol_nivel: u.rol.rol_nivel, rol_permisos: u.rol.rol_permisos } : null,
    area:  u.area  ? { area_id: u.area.area_id, area_codigo: u.area.area_codigo, area_nombre: u.area.area_nombre, area_color_hex: u.area.area_color_hex, area_icono: u.area.area_icono } : null,
    grupo: u.grupo ? { grupo_id: u.grupo.grupo_id, grupo_codigo: u.grupo.grupo_codigo, grupo_nombre: u.grupo.grupo_nombre } : null,
    punto: u.punto ? { punto_id: u.punto.punto_id, punto_codigo: u.punto.punto_codigo, punto_nombre: u.punto.punto_nombre } : null,
    // Grupos supervisados: combina grupo principal + grupos extra (multi-grupo)
    grupos_supervisados: gruposSupervisados(u),
    // Áreas accesibles: combina área principal + áreas extra (multi-área)
    areas_accesibles: areasAccesibles(u)
  };
}

/**
 * Combina el área principal (usr_area_id) con las áreas extra (belongsToMany).
 * Devuelve array deduplicado de { area_id, area_codigo, area_nombre, area_color_hex, area_icono }.
 */
function areasAccesibles(u) {
  const lista = [];
  const ids = new Set();
  if (u.area) {
    ids.add(u.area.area_id);
    lista.push({
      area_id:        u.area.area_id,
      area_codigo:    u.area.area_codigo,
      area_nombre:    u.area.area_nombre,
      area_color_hex: u.area.area_color_hex,
      area_icono:     u.area.area_icono,
      principal:      true
    });
  }
  for (const a of (u.areasExtra || [])) {
    if (ids.has(a.area_id)) continue;
    ids.add(a.area_id);
    lista.push({
      area_id:        a.area_id,
      area_codigo:    a.area_codigo,
      area_nombre:    a.area_nombre,
      area_color_hex: a.area_color_hex,
      area_icono:     a.area_icono,
      principal:      false
    });
  }
  return lista;
}

/**
 * Combina el grupo principal (usr_grupo_id) con los grupos extra (belongsToMany).
 * Devuelve array deduplicado de { grupo_id, grupo_codigo, grupo_nombre, grupo_area_id }.
 */
function gruposSupervisados(u) {
  const lista = [];
  const ids = new Set();
  if (u.grupo) {
    ids.add(u.grupo.grupo_id);
    lista.push({
      grupo_id:      u.grupo.grupo_id,
      grupo_codigo:  u.grupo.grupo_codigo,
      grupo_nombre:  u.grupo.grupo_nombre,
      grupo_area_id: u.grupo.grupo_area_id || u.usr_area_id
    });
  }
  for (const g of (u.gruposExtra || [])) {
    if (ids.has(g.grupo_id)) continue;
    ids.add(g.grupo_id);
    lista.push({
      grupo_id:      g.grupo_id,
      grupo_codigo:  g.grupo_codigo,
      grupo_nombre:  g.grupo_nombre,
      grupo_area_id: g.grupo_area_id
    });
  }
  return lista;
}

async function me(req, res, next) {
  try {
    const mapa = await adUsuariosPorIdentidad([req.user.usr_id_identidad]);
    return ok(res, { ...publicUser(req.user), ad_usuario: mapa.get(req.user.usr_id_identidad) ?? null });
  } catch (e) { return next(e); }
}

async function updatePreferencias(req, res, next) {
  try {
    const prefs = req.body || {};
    await SvUsuario.update({ usr_preferencias: prefs }, { where: { usr_id: req.user.usr_id } });
    return ok(res, { usr_preferencias: prefs });
  } catch (e) { return next(e); }
}

module.exports = { me, updatePreferencias };
