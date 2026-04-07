// src/utils/grupoMasivoHelper.js

/**
 * Genera un ID único para agrupar actividades creadas masivamente
 * Formato: ACT-GRUPO-YYYYMMDD-HHMMSS-RANDOM
 * Ejemplo: ACT-GRUPO-20240121-143025-A3F2
 */
const generarGrupoMasivoId = () => {
  const ahora = new Date();
  
  const year = ahora.getFullYear();
  const month = String(ahora.getMonth() + 1).padStart(2, '0');
  const day = String(ahora.getDate()).padStart(2, '0');
  
  const hours = String(ahora.getHours()).padStart(2, '0');
  const minutes = String(ahora.getMinutes()).padStart(2, '0');
  const seconds = String(ahora.getSeconds()).padStart(2, '0');
  
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  return `${year}${month}${day}${hours}${minutes}${seconds}${random}`;
};

module.exports = {
  generarGrupoMasivoId
};