// Nombres de las fotos dentro del ZIP del homenaje: cedula_orden_nombre-companero.jpg
const slug = (texto) => String(texto)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'companero';

const nombreFotoZip = ({ cedula, orden, nombre }) => `${cedula}_${orden}_${slug(nombre)}.jpg`;

module.exports = { slug, nombreFotoZip };
