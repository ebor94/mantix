/**
 * sv/services/listas.service.js
 * Carga masiva CSV de prospectos.
 * Columnas esperadas (case-insensitive): nombre, apellido, telefono, telefono_alterno, email, direccion, barrio.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Op } = require('sequelize');
const { SvLista, SvPersona, SvProspecto, SvEstado } = require('../models');
const personas = require('./personas.service');

const MAX_FILAS = 5000;
const ENCODING_DEFAULT = 'utf-8';

async function listar({ scope, page = 1, limit = 20 }) {
  const where = { lista_activa: 1 };
  if (scope?.areaId) where.lista_area_id = scope.areaId;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows, count } = await SvLista.findAndCountAll({
    where,
    include: ['area', 'grupo', 'fuente', { association: 'cargadaPor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }],
    order: [['lista_fecha_carga', 'DESC'], ['lista_id', 'DESC']],
    limit: parseInt(limit),
    offset
  });
  return { items: rows, total: count, page: parseInt(page), limit: parseInt(limit) };
}

async function cargarDesdeArchivo({ filePath, originalName, areaId, grupoId, fuenteId, asesorId, nombreLista, usuarioId }) {
  // Crear registro de lista en estado 'procesando'
  const lista = await SvLista.create({
    lista_area_id:     areaId,
    lista_grupo_id:    grupoId,
    lista_fuente_id:   fuenteId,
    lista_cargada_por: usuarioId,
    lista_nombre:      nombreLista || originalName,
    lista_estado:      'procesando',
    lista_archivo_url: `/uploads/sv/${path.basename(filePath)}`
  });

  // Estado inicial del grupo (codigo 'NUEVO' o el primero)
  const estadoInicial = await SvEstado.findOne({
    where: { estado_grupo_id: grupoId, estado_activo: 1 },
    order: [['estado_orden', 'ASC']]
  });
  if (!estadoInicial) {
    await lista.update({ lista_estado: 'fallida', lista_log: { error: 'No hay estados para el grupo' } });
    throw new Error('No hay estados activos configurados para el grupo');
  }

  // Leer y parsear CSV
  let raw;
  try { raw = fs.readFileSync(filePath, ENCODING_DEFAULT); }
  catch (e) { await lista.update({ lista_estado: 'fallida', lista_log: { error: e.message } }); throw e; }

  let records;
  try {
    records = parse(raw, { columns: (header) => header.map(h => h.trim().toLowerCase()), skip_empty_lines: true, trim: true });
  } catch (e) {
    await lista.update({ lista_estado: 'fallida', lista_log: { error: 'CSV inválido: ' + e.message } });
    throw e;
  }

  if (records.length > MAX_FILAS) {
    await lista.update({ lista_estado: 'fallida', lista_log: { error: `Máximo ${MAX_FILAS} filas por carga.` } });
    const e = new Error(`Máximo ${MAX_FILAS} filas`); e.code = 'VALIDATION_ERROR'; throw e;
  }

  let importadas = 0, duplicados = 0, errores = 0;
  const errLog = [];

  for (let i = 0; i < records.length; i++) {
    const fila = records[i];
    try {
      const nombre = (fila.nombre || fila.nombres || '').toString().trim();
      const telefono = (fila.telefono || fila.celular || fila.movil || '').toString().trim();
      if (!nombre || !telefono) {
        errores++; errLog.push({ linea: i + 2, error: 'Nombre o teléfono vacío' });
        continue;
      }

      // Crear o reutilizar persona
      let persona;
      try {
        persona = await personas.crear({
          persona_nombre:             nombre,
          persona_apellido:           (fila.apellido || fila.apellidos || '').toString().trim() || null,
          persona_telefono_principal: telefono,
          persona_telefono_alterno:   (fila.telefono_alterno || fila.alterno || '').toString().trim() || null,
          persona_email:              (fila.email || fila.correo || '').toString().trim() || null,
          persona_direccion:          (fila.direccion || '').toString().trim() || null,
          persona_barrio:             (fila.barrio || '').toString().trim() || null
        });
      } catch (e) {
        if (e.code === 'DUPLICATE_PHONE') {
          duplicados++;
          persona = e.persona;
        } else {
          errores++; errLog.push({ linea: i + 2, error: e.message });
          continue;
        }
      }

      // Crear prospecto enlazado a esta lista (si no existe ya uno activo para el mismo asesor)
      const yaExiste = await SvProspecto.findOne({
        where: { prosp_persona_id: persona.persona_id, prosp_asesor_id: asesorId, prosp_activo: 1 }
      });
      if (yaExiste) { duplicados++; continue; }

      await SvProspecto.create({
        prosp_area_id:   areaId,
        prosp_grupo_id:  grupoId,
        prosp_persona_id: persona.persona_id,
        prosp_asesor_id: asesorId,
        prosp_estado_id: estadoInicial.estado_id,
        prosp_fuente_id: fuenteId,
        prosp_lista_id:  lista.lista_id
      });
      importadas++;
    } catch (e) {
      errores++; errLog.push({ linea: i + 2, error: e.message });
    }
  }

  await lista.update({
    lista_total_registros: records.length,
    lista_importadas:      importadas,
    lista_duplicados_omit: duplicados,
    lista_errores:         errores,
    lista_estado:          'completada',
    lista_log:             { errores: errLog.slice(0, 100) }  // máx 100 errores en log
  });

  // Borrar archivo procesado (opcional)
  try { fs.unlinkSync(filePath); } catch {}

  return lista;
}

async function prospectosDeLista(listaId, { page = 1, limit = 20 }) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows, count } = await SvProspecto.findAndCountAll({
    where: { prosp_lista_id: listaId },
    include: ['persona', 'estado', { association: 'asesor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }],
    limit: parseInt(limit), offset
  });
  return { items: rows, total: count, page: parseInt(page), limit: parseInt(limit) };
}

module.exports = { listar, cargarDesdeArchivo, prospectosDeLista };
