#!/usr/bin/env node
/**
 * Genera el espejo ESM del motor de reglas para el frontend a partir de la
 * implementación canónica de este repo.
 *
 *   node src/rules/sync-espejo.js            # escribe el espejo
 *   node src/rules/sync-espejo.js --check    # solo verifica que esté al día
 *
 * Por qué existe: el motor tiene que correr en el navegador (validación en vivo
 * mientras el usuario agrega beneficiarios) y en el servidor (validación
 * autoritativa). No hay monorepo ni registro npm privado para compartir un
 * paquete, así que la alternativa era copiar el archivo a mano y confiar en que
 * nadie olvide sincronizarlo. Este script lo deriva mecánicamente, y
 * tests/convenioRules.test.js corre los mismos fixtures contra los dos motores
 * para confirmarlo.
 *
 * La transformación es puramente sintáctica: quita el bloque module.exports y
 * antepone `export` a las declaraciones exportadas. El cuerpo no se toca.
 */

const fs = require('fs');
const path = require('path');

const ORIGEN = path.resolve(__dirname, 'convenioRules.js');
const DESTINO = path.resolve(
  __dirname,
  '../../../afiliacion-frontend/src/utils/convenioRules.js'
);

const EXPORTADOS = [
  'ENGINE_VERSION',
  'CODIGOS',
  'validarConjunto',
  'validarCandidato',
  'calcularEdad',
  'parseReglas',
  'expandirRefs',
  'resolverParentescosPermitidos'
];

const CABECERA = `/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  ARCHIVO GENERADO — NO EDITAR A MANO                                      │
 * │                                                                           │
 * │  Espejo del motor de reglas de convenios. La fuente de verdad es:         │
 * │    mantix-backend/src/rules/convenioRules.js                              │
 * │                                                                           │
 * │  Para regenerarlo, desde el backend:                                      │
 * │    node src/rules/sync-espejo.js                                          │
 * │                                                                           │
 * │  Cualquier cambio hecho aquí se pierde en la próxima sincronización, y    │
 * │  además rompe \`npm test\` en el backend, que corre los mismos fixtures     │
 * │  contra los dos motores.                                                  │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

`;

function transformar(fuente) {
  let salida = fuente;

  // 1. Quitar el bloque module.exports = { ... }; del final.
  salida = salida.replace(/\nmodule\.exports\s*=\s*\{[\s\S]*?\};\s*$/m, '\n');

  // 2. Anteponer `export` a cada declaración exportada (solo de nivel superior:
  //    el ancla ^ sin indentación evita tocar declaraciones internas).
  for (const nombre of EXPORTADOS) {
    const declaracion = new RegExp(
      `^(function ${nombre}\\(|const ${nombre} =)`,
      'm'
    );
    if (!declaracion.test(salida)) {
      throw new Error(
        `No se encontró la declaración de nivel superior de "${nombre}" en ${ORIGEN}. ` +
          `Si se renombró o se movió, actualizar EXPORTADOS en este script.`
      );
    }
    salida = salida.replace(declaracion, 'export $1');
  }

  return CABECERA + salida.trimEnd() + '\n';
}

function main() {
  const soloVerificar = process.argv.includes('--check');

  if (!fs.existsSync(ORIGEN)) {
    console.error(`✖ No existe el motor canónico: ${ORIGEN}`);
    process.exit(1);
  }

  const generado = transformar(fs.readFileSync(ORIGEN, 'utf8'));
  const destinoDir = path.dirname(DESTINO);

  if (!fs.existsSync(destinoDir)) {
    console.error(
      `✖ No existe el directorio destino: ${destinoDir}\n` +
        `  ¿Está el repo afiliacion-frontend junto a mantix-backend?`
    );
    process.exit(1);
  }

  const actual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : null;

  if (actual === generado) {
    console.log('✔ El espejo del frontend ya está al día.');
    return;
  }

  if (soloVerificar) {
    console.error(
      '✖ El espejo del frontend está desactualizado.\n' +
        '  Correr: node src/rules/sync-espejo.js'
    );
    process.exit(1);
  }

  fs.writeFileSync(DESTINO, generado, 'utf8');
  console.log(`✔ Espejo escrito en ${DESTINO}`);
}

main();
