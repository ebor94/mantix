// ============================================
// src/utils/helpers.js - Funciones Auxiliares
// ============================================
const moment = require('moment');
const crypto = require('crypto');

module.exports = {
  // Generar código único
  generarCodigo(prefijo, numero) {
    const anio = moment().format('YYYY');
    const num = String(numero).padStart(5, '0');
    return `${prefijo}-${anio}-${num}`;
  },

  // Formatear fecha
  formatearFecha(fecha, formato = 'DD/MM/YYYY') {
    return moment(fecha).format(formato);
  },

  // Calcular diferencia en días
  diasEntre(fechaInicio, fechaFin) {
    return moment(fechaFin).diff(moment(fechaInicio), 'days');
  },

  // Calcular diferencia en horas
  horasEntre(fechaInicio, fechaFin) {
    return moment(fechaFin).diff(moment(fechaInicio), 'hours', true);
  },

  // Generar token aleatorio
  generarToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  },

  // Sanitizar nombre de archivo
  sanitizarNombreArchivo(nombre) {
    return nombre
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9.-]/g, '')
      .substring(0, 100);
  },

  // Paginar resultados
  paginar(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    return { limit: parseInt(limit), offset };
  },

  // Formatear respuesta paginada
  formatearRespuestaPaginada(data, page, limit, total) {
    return {
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  // Calcular porcentaje
  calcularPorcentaje(parte, total) {
    if (total === 0) return 0;
    return parseFloat(((parte / total) * 100).toFixed(2));
  },

  // Validar email
  esEmailValido(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  },

  // Validar teléfono colombiano
  esTelefonoValido(telefono) {
    const regex = /^(\+57)?[0-9]{10}$/;
    return regex.test(telefono.replace(/\s|-/g, ''));
  }
};