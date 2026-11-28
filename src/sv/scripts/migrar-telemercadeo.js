/**
 * src/sv/scripts/migrar-telemercadeo.js
 *
 * Carga en GenFlow el libro de telemercadeo de una asesora de Prenecesidad.
 * Por defecto SOLO SIMULA y deja un reporte .xlsx junto al libro. Con --aplicar escribe.
 *
 * Uso (en el servidor, desde ~/apps/mantix/mantix-backend):
 *   node src/sv/scripts/migrar-telemercadeo.js --archivo ~/migracion-telemercadeo/<libro>.xlsx --asesor carmencontreras
 *   node src/sv/scripts/migrar-telemercadeo.js --archivo ~/migracion-telemercadeo/<libro>.xlsx --asesor carmencontreras --aplicar
 *
 * El libro y el reporte tienen datos personales: van fuera de www y del repositorio,
 * y se borran cuando termina la carga.
 * Diseño: crm-frontend docs/superpowers/specs/2026-11-27-migracion-telemercadeo-design.md
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sequelize } = require('../models');
const { leerLibro } = require('../services/telemercadeo.lector');
const { resolverAsesora, cargarCatalogos, cargar } = require('../services/telemercadeo.carga');
const { rutaReporte, escribirReporte } = require('../services/telemercadeo.reporte');

const REPO = path.resolve(__dirname, '../../..');
const dos = (n) => String(n).padStart(2, '0');

function argumentos(argv) {
  const valor = (nombre) => {
    const i = argv.indexOf(nombre);
    const v = i >= 0 ? argv[i + 1] : null;
    return v && !v.startsWith('--') ? v : null;
  };
  return { archivo: valor('--archivo'), asesor: valor('--asesor'), aplicar: argv.includes('--aplicar') };
}

const hoyLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

async function ejecutar(argv, { log = console.log, error = console.error, ahora = new Date() } = {}) {
  const { archivo, asesor, aplicar } = argumentos(argv);
  try {
    if (!archivo || !asesor) throw new Error('Uso: --archivo <libro.xlsx> --asesor <usuario de red> [--aplicar]');
    const ruta = path.resolve(archivo.replace(/^~(?=$|\/)/, os.homedir()));
    if (ruta === REPO || ruta.startsWith(REPO + path.sep)) {
      throw new Error('El libro está dentro del repositorio: muévelo a ~/migracion-telemercadeo/ para que nunca termine en git.');
    }
    if (!fs.existsSync(ruta)) throw new Error(`No existe el archivo ${ruta}`);

    log(aplicar ? '=== MODO APLICAR ===' : '=== SIMULACIÓN (no escribe nada) ===');
    const asesora = await resolverAsesora(asesor);
    const catalogos = await cargarCatalogos(asesora);
    const { filas, incidencias } = await leerLibro(ruta, path.basename(ruta));
    const { resultados, avisos } = await cargar({
      filas, asesora, catalogos, archivo: path.basename(ruta, path.extname(ruta)), hoy: hoyLocal(ahora), aplicar
    });

    const todas = [...incidencias, ...avisos];
    const salida = rutaReporte(ruta, aplicar, ahora);
    await escribirReporte(salida, { resultados, incidencias: todas, catalogos });

    const cuenta = (r) => resultados.filter((x) => x.resultado === r).length;
    log(`Asesora: ${asesora.nombre} (${asesora.ad})`);
    log(`Leídos: ${resultados.length} · ${aplicar ? `Creados: ${cuenta('se crea')}` : `Se crearían: ${cuenta('se crearía')}`}`
      + ` · Omitidos: ${cuenta('omitido')} · Errores: ${cuenta('error')} · Avisos: ${todas.filter((i) => i.tipo === 'aviso').length}`);
    log(`Reporte: ${salida}`);
    return 0;
  } catch (e) {
    error(`\nERROR: ${e.message}`);
    return 1;
  }
}

module.exports = { ejecutar, argumentos };

if (require.main === module) {
  ejecutar(process.argv.slice(2))
    .then((codigo) => { process.exitCode = codigo; })
    .finally(() => sequelize.close());
}
