/**
 * sv/validations/ventas.validation.js — venta al cerrar el contrato y sus correcciones.
 * El total no se recibe: lo calcula el servidor.
 */
const Joi = require('joi');

const items = Joi.array().items(Joi.object({
  prod_id:         Joi.number().integer().positive().required(),
  cantidad:        Joi.number().integer().min(1).max(999).required(),
  precio_unitario: Joi.number().integer().min(1).max(9999999999).required()
})).min(1).max(50).unique('prod_id').required();

const motivo = Joi.string().trim().min(3).max(250).required();
// Correcciones que el supervisor vio al abrir la ventana: si hay más, otra persona cambió la venta.
const cambios_vistos = Joi.number().integer().min(0).required();

module.exports = {
  venta:    Joi.object({ items }),
  corregir: Joi.object({ items, motivo, cambios_vistos }),
  anular:   Joi.object({ motivo, cambios_vistos })
};
