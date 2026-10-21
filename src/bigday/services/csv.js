// Exportación CSV (RFC 4180) con BOM UTF-8 para Excel en español.
// Solo se serializan las columnas listadas aquí: ip_hash, ua_hash, uuid o id jamás salen, aunque la fila las traiga.
const { labelFor } = require('../shared/survey.config.cjs');

const BOM = '﻿';
const CRLF = '\r\n';

// Orden y nombres de columnas (legibles, en español).
const ENCABEZADOS = [
  'Fecha',
  'P1 Conocimiento previo',
  'P2 Percepción antes',
  'P3 Percepción después',
  'P3 Otro',
  'P4 Lo que más llamó la atención',
  'P4 Otro',
  'P5 Aprendizaje',
  'P6 Recomendación (1-10)',
  'P7 Frase',
  'Origen',
  'Duración (s)',
];

/** Protección contra inyección de fórmulas en hojas de cálculo: texto libre que empieza por = + - @ TAB CR. */
function protegerFormula(valor) {
  if (valor === null || valor === undefined) return valor;
  const texto = String(valor);
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
}

/** Campo CSV: entre comillas si contiene coma, comilla o salto de línea; comillas duplicadas. */
function escaparCampo(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const fechaIso = (v) => (v === null || v === undefined ? '' : new Date(v).toISOString());

function filaCsv(f) {
  return [
    fechaIso(f.created_at),
    labelFor('p1', f.p1),
    labelFor('p2', f.p2),
    labelFor('p3', f.p3),
    protegerFormula(f.p3_otro),
    labelFor('p4', f.p4),
    protegerFormula(f.p4_otro),
    labelFor('p5', f.p5),
    f.p6,
    protegerFormula(f.p7),
    protegerFormula(f.origen),
    f.duracion_seg,
  ].map(escaparCampo).join(',');
}

/** Devuelve el CSV completo (BOM + encabezado + una línea por respuesta, todas terminadas en CRLF). */
function construirCsv(filas) {
  return BOM + [ENCABEZADOS.join(','), ...filas.map(filaCsv)].map((l) => l + CRLF).join('');
}

module.exports = { construirCsv, escaparCampo, protegerFormula, ENCABEZADOS };
