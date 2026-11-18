/**
 * sv/services/homenajesSala.repo.js
 * Lectura (solo SELECT) de los homenajes en sala de Homenajes360, que viven en
 * la misma base. El módulo sv nunca escribe en estas tablas.
 */
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

const ESTADO_FINALIZADO = 'FINALIZADO';

const SELECT_HOMENAJE = `
  SELECT h.id, h.estado, h.created_at AS registrado_at,
         sv.nombre AS sala_nombre, s.nombre AS sede_nombre,
         a.codigo AS asistencia_codigo, a.nombre_ser_querido, a.contrato,
         a.nombre_contacto AS contratante_nombre, a.telefono_contacto AS contratante_telefono
    FROM homenajes_sala h
    LEFT JOIN asistencias a     ON a.id  = h.asistencia_id
    LEFT JOIN salas_velacion sv ON sv.id = h.sala_id
    LEFT JOIN sedes s           ON s.id  = sv.sede_id`;

async function listarEnCurso() {
  return sequelize.query(
    `${SELECT_HOMENAJE}
     WHERE h.estado <> :fin
     ORDER BY h.created_at DESC, h.id DESC
     LIMIT 200`,
    { replacements: { fin: ESTADO_FINALIZADO }, type: QueryTypes.SELECT }
  );
}

async function obtener(id) {
  const filas = await sequelize.query(
    `${SELECT_HOMENAJE} WHERE h.id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return filas[0] || null;
}

function estaEnCurso(fila) {
  return !!fila && fila.estado !== ESTADO_FINALIZADO;
}

module.exports = { listarEnCurso, obtener, estaEnCurso };
