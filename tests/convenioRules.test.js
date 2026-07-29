/**
 * Tests del motor de reglas de convenios.
 *
 * Los casos NO están en este archivo: viven en
 * src/rules/__fixtures__/convenio-casos.json, que es el contrato.
 *
 * Se corren dos veces:
 *   1. contra la implementación canónica (src/rules/convenioRules.js)
 *   2. contra el espejo del frontend (afiliacion-frontend/src/utils/convenioRules.js)
 *
 * El segundo bloque es el que detecta la deriva entre los dos archivos. Se
 * evalúa el espejo en un contexto de vm quitándole los `export`, para no tener
 * que meter Babel ni configurar ESM en jest solo para esto. Si el espejo no
 * existe todavía, el bloque se salta con un aviso en vez de fallar.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const fixtures = require('../src/rules/__fixtures__/convenio-casos.json');
const motorCanonico = require('../src/rules/convenioRules');

const RUTA_ESPEJO = path.resolve(
  __dirname,
  '../../afiliacion-frontend/src/utils/convenioRules.js'
);

/** Carga el espejo ESM del frontend como si fuera CommonJS. */
function cargarEspejo() {
  if (!fs.existsSync(RUTA_ESPEJO)) return null;
  const fuente = fs.readFileSync(RUTA_ESPEJO, 'utf8');
  // `export function foo` → `function foo`; `export const X` → `const X`.
  // El espejo debe declarar sus exports inline, sin bloque `export { ... }`.
  const comoCjs = fuente
    .replace(/^export\s+default\s+/gm, 'const __default__ = ')
    .replace(/^export\s+/gm, '');
  const sandbox = { console, module: { exports: {} }, exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(
    comoCjs +
      '\n;module.exports = { ENGINE_VERSION, CODIGOS, validarConjunto, validarCandidato, calcularEdad };',
    sandbox,
    { filename: RUTA_ESPEJO }
  );
  return sandbox.module.exports;
}

const fechaReferencia = new Date(fixtures.fechaReferencia);

/**
 * Los rulesets de convenios reales NO se copian al fixture: se cargan desde
 * src/seeds/convenios/*.json, que es exactamente lo que la migración inserta en
 * la columna `convenios.reglas`. Así, si alguien edita el seed y rompe una de
 * las condiciones pactadas con el cliente, estos tests fallan.
 * Los rulesets inline del fixture son solo casos sintéticos para ejercitar
 * tipos de regla que ningún convenio usa todavía.
 */
const rulesets = Object.assign({}, fixtures.rulesets);
Object.keys(fixtures.rulesetsDesdeSeed || {}).forEach(alias => {
  const rutaSeed = path.resolve(
    __dirname, '../src/seeds', fixtures.rulesetsDesdeSeed[alias]
  );
  rulesets[alias] = JSON.parse(fs.readFileSync(rutaSeed, 'utf8')).reglas;
});

function resolverCaso(caso) {
  const reglas = rulesets[caso.reglas];
  const titular = fixtures.titulares[caso.titular];
  if (!reglas) throw new Error(`Ruleset inexistente en el fixture: ${caso.reglas}`);
  if (!titular) throw new Error(`Titular inexistente en el fixture: ${caso.titular}`);
  return { reglas, titular };
}

/** Ejecuta la batería completa de fixtures contra un motor dado. */
function correrBateria(nombreMotor, motor) {
  describe(`${nombreMotor} — casos del contrato`, () => {
    fixtures.casos.forEach(caso => {
      test(caso.nombre, () => {
        const { reglas, titular } = resolverCaso(caso);

        const resultado = motor.validarConjunto(
          reglas,
          { titular, beneficiarios: caso.beneficiarios },
          { fechaReferencia }
        );

        const detalle = () =>
          `\nErrores devueltos:\n` +
          JSON.stringify(resultado.errores, null, 2);

        // ── validez ──
        if (resultado.valido !== caso.esperado.valido) {
          throw new Error(
            `Se esperaba valido=${caso.esperado.valido} y se obtuvo ` +
              `${resultado.valido}.${detalle()}`
          );
        }

        // ── códigos de error, en orden ──
        if (caso.esperado.codigos) {
          expect(resultado.errores.map(e => e.codigo)).toEqual(caso.esperado.codigos);
        }

        // ── índices señalados por el primer error ──
        if (caso.esperado.indices) {
          expect(resultado.errores.length).toBeGreaterThan(0);
          expect(resultado.errores[0].indices).toEqual(caso.esperado.indices);
        }

        // ── cupos calculados ──
        if (caso.esperado.cupos) {
          Object.keys(caso.esperado.cupos).forEach(idRegla => {
            const esperado = caso.esperado.cupos[idRegla];
            const real = resultado.cupos[idRegla];
            expect(real).toBeDefined();
            Object.keys(esperado).forEach(clave => {
              expect({ [clave]: real[clave] }).toEqual({ [clave]: esperado[clave] });
            });
          });
        }

        // Todo error debe traer un mensaje utilizable en la UI.
        resultado.errores.forEach(e => {
          expect(typeof e.mensaje).toBe('string');
          expect(e.mensaje.length).toBeGreaterThan(0);
          expect(e.mensaje).not.toMatch(/\{[a-z]+\}/i); // sin placeholders sin sustituir
        });
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

correrBateria('motor canónico (backend)', motorCanonico);

describe('motor canónico — comportamiento del evaluador', () => {
  const reglas = rulesets.conyca;
  const titular = fixtures.titulares.casado40;
  const opts = { fechaReferencia };

  test('reglas nulas o corruptas invalidan en vez de dejar pasar', () => {
    [null, undefined, '', 'no-es-json', 42].forEach(entrada => {
      const r = motorCanonico.validarConjunto(entrada, { titular, beneficiarios: [] }, opts);
      expect(r.valido).toBe(false);
      expect(r.errores[0].codigo).toBe('REGLAS_INVALIDAS');
    });
  });

  test('acepta las reglas como string JSON (como las devuelve MySQL)', () => {
    const comoString = JSON.stringify(reglas);
    const r = motorCanonico.validarConjunto(
      comoString,
      { titular, beneficiarios: [{ parentesco: 'PADRE', fechaNacimiento: '1938-01-01' }] },
      opts
    );
    expect(r.valido).toBe(true);
  });

  test('validarCandidato atribuye el error a la fila nueva', () => {
    const beneficiarios = [
      { parentesco: 'PADRE', fechaNacimiento: '1966-01-01' },
      { parentesco: 'MADRE', fechaNacimiento: '1968-01-01' }
    ];
    const r = motorCanonico.validarCandidato(
      reglas,
      { titular, beneficiarios },
      { parentesco: 'SUEGRO (A)', fechaNacimiento: '1956-01-01' },
      opts
    );
    expect(r.valido).toBe(false);
    expect(r.indiceCandidato).toBe(2);
    expect(r.erroresDelCandidato).toHaveLength(1);
    expect(r.erroresDelCandidato[0].codigo).toBe('CUPO_EXCEDIDO');
  });

  test('validarCandidato en modo edición no cuenta dos veces la fila editada', () => {
    const beneficiarios = [
      { parentesco: 'PADRE', fechaNacimiento: '1966-01-01' },
      { parentesco: 'MADRE', fechaNacimiento: '1968-01-01' }
    ];
    // Se edita la MADRE (índice 1) y se la reemplaza por un suegro: sigue
    // habiendo 2 en el cupo, así que debe pasar.
    const r = motorCanonico.validarCandidato(
      reglas,
      { titular, beneficiarios },
      { parentesco: 'SUEGRO (A)', fechaNacimiento: '1956-01-01' },
      Object.assign({ indiceEditado: 1 }, opts)
    );
    expect(r.valido).toBe(true);
  });

  test('validarCandidato detecta que el candidato invalida filas ya cargadas', () => {
    // 4 sobrinos son válidos con el núcleo vacío; agregar un hijo baja la
    // cuota a 2 y deja dos sobrinos por fuera. El error NO es del candidato,
    // pero el conjunto debe quedar inválido igual.
    const beneficiarios = [
      { parentesco: 'SOBRINO (A)', fechaNacimiento: '1996-01-01' },
      { parentesco: 'SOBRINO (A)', fechaNacimiento: '1997-01-01' },
      { parentesco: 'SOBRINO (A)', fechaNacimiento: '1998-01-01' },
      { parentesco: 'SOBRINO (A)', fechaNacimiento: '1999-01-01' }
    ];
    const r = motorCanonico.validarCandidato(
      reglas,
      { titular, beneficiarios },
      { parentesco: 'HIJO (A)', fechaNacimiento: '2016-01-01' },
      opts
    );
    expect(r.valido).toBe(false);
    expect(r.erroresDelCandidato).toHaveLength(0);
    expect(r.errores[0].codigo).toBe('CUPO_CONDICIONAL_EXCEDIDO');
    expect(r.errores[0].indices).toEqual([2, 3]);
  });

  test('la salida es determinista para la misma entrada', () => {
    const beneficiarios = [
      { parentesco: 'SUEGRO (A)', fechaNacimiento: '1950-01-01' },
      { parentesco: 'HIJO (A)', fechaNacimiento: '1995-01-01' },
      { parentesco: 'CONYUGE', fechaNacimiento: '1960-01-01' }
    ];
    const a = motorCanonico.validarConjunto(reglas, { titular, beneficiarios }, opts);
    const b = motorCanonico.validarConjunto(reglas, { titular, beneficiarios }, opts);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    // ordenados por índice de beneficiario
    expect(a.errores.map(e => e.indices[0])).toEqual([0, 1, 2]);
  });

  test('parentescosPermitidos se devuelve resuelto y plano', () => {
    const r = motorCanonico.validarConjunto(reglas, { titular, beneficiarios: [] }, opts);
    expect(r.parentescosPermitidos).toContain('SUEGRO (A)');
    expect(r.parentescosPermitidos).toContain('TIO (A)');
    expect(r.parentescosPermitidos).not.toContain('YERNO/NUERA');
    expect(r.parentescosPermitidos.some(p => p.startsWith('@'))).toBe(false);
  });

  test('calcularEdad respeta el borde del cumpleaños', () => {
    const ref = new Date('2026-07-29T00:00:00');
    expect(motorCanonico.calcularEdad('1986-07-29', ref)).toBe(40); // cumple hoy
    expect(motorCanonico.calcularEdad('1986-07-30', ref)).toBe(39); // cumple mañana
    expect(motorCanonico.calcularEdad('1986-07-28', ref)).toBe(40);
    expect(motorCanonico.calcularEdad(null, ref)).toBeNull();
    expect(motorCanonico.calcularEdad('no-es-fecha', ref)).toBeNull();
    // Acepta el ISO con hora que devuelve Sequelize para las DATEONLY
    expect(motorCanonico.calcularEdad('1986-01-01T00:00:00.000Z', ref)).toBe(40);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const espejo = cargarEspejo();

if (espejo) {
  correrBateria('espejo del frontend', espejo);

  describe('sincronía entre los dos motores', () => {
    test('ENGINE_VERSION coincide', () => {
      expect(espejo.ENGINE_VERSION).toBe(motorCanonico.ENGINE_VERSION);
    });

    test('ambos motores producen exactamente la misma salida', () => {
      fixtures.casos.forEach(caso => {
        const { reglas, titular } = resolverCaso(caso);
        const ctx = { titular, beneficiarios: caso.beneficiarios };
        const a = motorCanonico.validarConjunto(reglas, ctx, { fechaReferencia });
        const b = espejo.validarConjunto(reglas, ctx, { fechaReferencia });
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          throw new Error(
            `Los motores divergen en el caso "${caso.nombre}".\n` +
              `canónico: ${JSON.stringify(a, null, 2)}\n` +
              `espejo:   ${JSON.stringify(b, null, 2)}`
          );
        }
      });
    });
  });
} else {
  describe('espejo del frontend', () => {
    test.skip(`no encontrado en ${RUTA_ESPEJO} — se omite la verificación de deriva`, () => {});
  });
}
