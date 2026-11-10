// Zip mínimo armado a mano para pruebas: entradas "stored" (sin comprimir) con el tamaño descomprimido
// que se quiera declarar, para simular zip bombs sin crear archivos gigantes.
function zipFalso(entradas) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const { nombre, datos = Buffer.alloc(0), declarado = datos.length } of entradas) {
    const n = Buffer.from(nombre);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4);
    loc.writeUInt32LE(datos.length, 18); loc.writeUInt32LE(declarado, 22); loc.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt32LE(datos.length, 20); cen.writeUInt32LE(declarado, 24);
    cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42);
    locales.push(loc, n, datos);
    centrales.push(cen, n);
    offset += 30 + n.length + datos.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, dir, fin]);
}

module.exports = { zipFalso };
