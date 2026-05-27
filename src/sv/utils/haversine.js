/**
 * sv/utils/haversine.js
 * Distancia geodésica entre dos puntos (km) y suma de tramos consecutivos.
 * Réplica server-side del util frontend `crm-frontend/src/utils/haversine.js`.
 */
const R_KM = 6371; // radio de la Tierra en km

function toRad(deg) { return (deg * Math.PI) / 180; }

/**
 * Distancia en km entre dos puntos { lat, lng } (acepta también arrays [lat,lng]).
 */
function haversine(a, b) {
  if (!a || !b) return 0;
  const lat1 = Array.isArray(a) ? a[0] : a.lat;
  const lng1 = Array.isArray(a) ? a[1] : a.lng;
  const lat2 = Array.isArray(b) ? b[0] : b.lat;
  const lng2 = Array.isArray(b) ? b[1] : b.lng;
  if ([lat1, lng1, lat2, lng2].some(v => v == null || isNaN(parseFloat(v)))) return 0;
  const dLat = toRad(parseFloat(lat2) - parseFloat(lat1));
  const dLng = toRad(parseFloat(lng2) - parseFloat(lng1));
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(parseFloat(lat1))) * Math.cos(toRad(parseFloat(lat2)))
          * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/**
 * Suma de distancias entre puntos consecutivos.
 * @param {Array<{lat,lng}>} coords  — ordenados cronológicamente
 * @returns {number} km totales
 */
function sumaDistancias(coords = []) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversine(coords[i - 1], coords[i]);
  }
  return total;
}

module.exports = { haversine, sumaDistancias };
