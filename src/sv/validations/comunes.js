/** sv/validations/comunes.js — piezas Joi que comparten los schemas. */
const Joi = require('joi');

const diaBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });

/**
 * Día sin hora, como texto 'YYYY-MM-DD', para columnas DATEONLY. Joi.date() lo entrega como
 * medianoche UTC y Sequelize lo escribiría en la hora del servidor (Colombia): el día anterior.
 * Si llega con hora, es el día de Colombia.
 */
const diaISO = Joi.date().iso().custom((valor, { original }) =>
  (/T|\s/.test(String(original)) ? diaBogota.format(valor) : valor.toISOString().slice(0, 10)));

module.exports = { diaISO };
