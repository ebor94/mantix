// ============================================
// src/services/borrador.service.js
// ============================================
const { Borrador } = require('../models');
const AppError = require('../utils/AppError');

/**
 * Extrae campos resumen del payload para guardar en columnas indexadas
 * (evita deserializar el JSON completo en el listado).
 */
function extractSummary(payload) {
  const a = payload.afiliado || {};
  const partes = [a.primerNombre, a.segundoNombre, a.primerApellido, a.segundoApellido]
    .filter(Boolean);
  return {
    nombreCompleto:  partes.join(' ').trim() || null,
    numeroDocumento: a.numeroDocumento || null,
    canal:           a.canal           || null,
    grupo:           a.grupo           || null
  };
}

/**
 * Crea un nuevo borrador para el asesor autenticado.
 */
async function crear(asesorId, payload) {
  const summary  = extractSummary(payload);
  const borrador = await Borrador.create({
    asesorId,
    ...summary,
    datos: payload
  });
  return { id: borrador.id, ...summary, creadoAt: borrador.createdAt, actualizadoAt: borrador.updatedAt };
}

/**
 * Actualiza un borrador existente (solo si pertenece al asesor).
 */
async function actualizar(id, asesorId, payload) {
  const borrador = await Borrador.findOne({ where: { id, asesorId } });
  if (!borrador) throw new AppError('Borrador no encontrado o no autorizado', 404);

  const summary = extractSummary(payload);
  await borrador.update({ ...summary, datos: payload });
  return { id: borrador.id, ...summary, actualizadoAt: borrador.updatedAt };
}

/**
 * Lista los borradores del asesor (solo campos resumen, sin los datos completos).
 */
async function listar(asesorId) {
  const rows = await Borrador.findAll({
    where: { asesorId },
    attributes: ['id', 'nombreCompleto', 'numeroDocumento', 'canal', 'grupo', 'createdAt', 'updatedAt'],
    order: [['updatedAt', 'DESC']]
  });

  // Renombrar timestamps a español para el frontend
  return rows.map(r => ({
    id:              r.id,
    nombreCompleto:  r.nombreCompleto,
    numeroDocumento: r.numeroDocumento,
    canal:           r.canal,
    grupo:           r.grupo,
    creadoAt:        r.createdAt,
    actualizadoAt:   r.updatedAt
  }));
}

/**
 * Obtiene un borrador completo, expandiendo `datos` al nivel raíz
 * para que el frontend pueda leerlo directamente con cargarBorrador(data).
 */
async function getOne(id, asesorId) {
  const borrador = await Borrador.findOne({ where: { id, asesorId } });
  if (!borrador) throw new AppError('Borrador no encontrado', 404);

  // Spreadeamos datos al nivel raíz para compatibilidad con store.cargarBorrador()
  return {
    id:           borrador.id,
    ...(borrador.datos || {}),   // afiliado, beneficiarios, seguros, contrato
    creadoAt:     borrador.createdAt,
    actualizadoAt: borrador.updatedAt
  };
}

/**
 * Elimina un borrador (solo si pertenece al asesor).
 */
async function eliminar(id, asesorId) {
  const borrador = await Borrador.findOne({ where: { id, asesorId } });
  if (!borrador) throw new AppError('Borrador no encontrado o no autorizado', 404);
  await borrador.destroy();
}

module.exports = { crear, actualizar, listar, getOne, eliminar };
