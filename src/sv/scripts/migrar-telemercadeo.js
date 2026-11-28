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
 * Códigos de salida: 0 si leyó el libro, aunque haya clientes omitidos o con error.
 * 1 si se detuvo antes de leer, o si falló después de empezar a escribir.
 * Tras un fallo con --aplicar: volver a correr el mismo comando es seguro.
 * Para deshacer una carga: el SQL está en el spec, en la sección "Deshacer una carga".
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
const { diaBogotaISO } = require('../utils/fechas');

const REPO = path.resolve(__dirname, '../../..');

function argumentos(argv) {
  const valor = (nombre) => {
    const i = argv.indexOf(nombre);
    const v = i >= 0 ? argv[i + 1] : null;
    return v && !v.startsWith('--') ? v : null;
  };
  return { archivo: valor('--archivo'), asesor: valor('--asesor'), aplicar: argv.includes('--aplicar') };
}

async function ejecutar(argv, { log = console.log, error = console.error, ahora = new Date() } = {}) {
  const { archivo, asesor, aplicar } = argumentos(argv);
  let escribiendo = false;
  let guardandoReporte = false;
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
    escribiendo = aplicar;
    const { resultados, avisos } = await cargar({
      filas, asesora, catalogos, archivo: path.basename(ruta, path.extname(ruta)), hoy: diaBogotaISO(ahora), aplicar
    });

    const todas = [...incidencias, ...avisos];
    const cuenta = (r) => resultados.filter((x) => x.resultado === r).length;
    log(`Asesora: ${asesora.nombre} (${asesora.ad})`);
    log(`Leídos: ${resultados.length} · ${aplicar ? `Creados: ${cuenta('se crea')}` : `Se crearían: ${cuenta('se crearía')}`}`
      + ` · Omitidos: ${cuenta('omitido')} · Errores: ${cuenta('error')} · Avisos: ${todas.filter((i) => i.tipo === 'aviso').length}`);
    const sinCargar = todas.filter((i) => i.tipo === 'error' && i.fila == null);
    if (sinCargar.length) {
      log(`Hojas sin cargar: ${sinCargar.length}`);
      for (const h of sinCargar) log(`  · ${h.hoja}: ${h.mensaje}`);
    }

    const salida = rutaReporte(ruta, aplicar, ahora);
    guardandoReporte = true;
    await escribirReporte(salida, { resultados, incidencias: todas, catalogos });
    log(`Reporte: ${salida}`);
    return 0;
  } catch (e) {
    error(`\nERROR: ${guardandoReporte ? 'no se pudo guardar el reporte: ' : ''}${e.message}`);
    if (escribiendo) {
      error('Puede que una parte ya se haya cargado. Volver a correr con --aplicar es seguro: omite los clientes ya creados y cierra la lista.');
    }
    return 1;
  }
}

module.exports = { ejecutar, argumentos };

if (require.main === module) {
  ejecutar(process.argv.slice(2))
    .then((codigo) => { process.exitCode = codigo; })
    .finally(() => sequelize.close());
}
