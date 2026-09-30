/**
 * Plantillas de reglas por defecto para los planes del canal empresarial
 * (Subsistema A — datos y administración).
 *
 * Formato = exactamente el que consume `src/rules/convenioRules.js`
 * (`parseReglas` / `validarConjunto`), el mismo que usa la columna
 * `convenios.reglas`. Ver `src/seeds/convenios/conyca.json` como ejemplo
 * real en producción.
 *
 * Llaves reales del motor usadas aquí (NO inventar otras):
 *   - reglas.titular            { edadMin, edadMax, etiqueta }
 *   - reglas.grupos             { NOMBRE: [parentescos o "@OTRO_GRUPO"] }
 *   - reglas.parentescosPermitidos  array de refs ("@GRUPO" o literal)
 *   - reglas.limites            { beneficiarios, deLey, adicionales } — topes
 *     GLOBALES por tipoBeneficiario. Los caps "máximo N de ley" / "máximo N
 *     adicionales" que pedirá el frontend viven en limites.deLey y
 *     limites.adicionales.
 *   - reglas.reglas             array de reglas declarativas (tipo: 'edad',
 *     'cupo', 'cupoPorParentesco', 'cupoCondicional', 'cupoPorRangoEdad',
 *     'requerido'), cada una con aplicaA (refs de grupos/parentescos/"*") y,
 *     opcionalmente, filtro.tipoBeneficiario para acotarla a DE_LEY o
 *     ADICIONAL.
 *
 * Son defaults EDITABLES por plan desde la administración: su fidelidad
 * exacta a la política comercial no es crítica, lo que importa es que
 * `parseReglas` las entienda sin lanzar.
 */

const VERSION = 1;

const GRUPOS_ESTANDAR = {
  CONYUGE: ['CONYUGE', 'COMPAÑERO (A)'],
  PADRES: ['PADRE', 'MADRE'],
  SUEGROS: ['SUEGRO (A)', 'SUEGRASTRO'],
  HIJOS: ['HIJO (A)', 'HIJO ADOPTIVO', 'HIJASTRO (A)'],
  HERMANOS: ['HERMANO (A)', 'HERMANASTRO (A)']
};

// UNIPERSONAL: solo el titular, sin beneficiarios de ley. Adicionales
// permitidos por defecto (editable por el admin desde la plantilla).
const UNIPERSONAL = {
  version: VERSION,
  titular: { edadMin: null, edadMax: 64, etiqueta: 'menor de 65 años' },
  grupos: {},
  limites: { beneficiarios: null, deLey: 0, adicionales: 5 },
  reglas: [
    {
      id: 'edad_adicionales',
      tipo: 'edad',
      aplicaA: ['*'],
      filtro: { tipoBeneficiario: 'ADICIONAL' },
      edadMax: 64,
      etiqueta: 'menores de 65 años',
      mensaje: 'Los beneficiarios adicionales deben ser {etiqueta} (edad registrada: {edad}).'
    }
  ]
};

// BASICO: titular <65; cónyuge <65; padres/suegros <75; hijos/hermanos <30;
// tope de 6 de ley y 5 adicionales <65.
const BASICO = {
  version: VERSION,
  titular: { edadMin: null, edadMax: 64, etiqueta: 'menor de 65 años' },
  grupos: GRUPOS_ESTANDAR,
  parentescosPermitidos: ['@CONYUGE', '@PADRES', '@SUEGROS', '@HIJOS', '@HERMANOS'],
  limites: { beneficiarios: null, deLey: 6, adicionales: 5 },
  reglas: [
    {
      id: 'edad_conyuge',
      tipo: 'edad',
      aplicaA: ['@CONYUGE'],
      edadMax: 64,
      etiqueta: 'menor de 65 años',
      mensaje: 'El cónyuge / compañero(a) debe ser {etiqueta} (edad registrada: {edad}).'
    },
    {
      id: 'edad_padres_suegros',
      tipo: 'edad',
      aplicaA: ['@PADRES', '@SUEGROS'],
      edadMax: 74,
      etiqueta: 'menores de 75 años',
      mensaje: 'Los padres y suegros deben ser {etiqueta} (edad registrada: {edad}).'
    },
    {
      id: 'edad_hijos_hermanos',
      tipo: 'edad',
      aplicaA: ['@HIJOS', '@HERMANOS'],
      edadMax: 29,
      etiqueta: 'menores de 30 años',
      mensaje: 'Los hijos y hermanos deben ser {etiqueta} (edad registrada: {edad}).'
    },
    {
      id: 'edad_adicionales',
      tipo: 'edad',
      aplicaA: ['*'],
      filtro: { tipoBeneficiario: 'ADICIONAL' },
      edadMax: 64,
      etiqueta: 'menores de 65 años',
      mensaje: 'Los beneficiarios adicionales deben ser {etiqueta} (edad registrada: {edad}).'
    }
  ]
};

// UNIFAMILIAR: máx 6 de ley, de ley <=75, máx 2 de ley en rango 60-75,
// adicionales <65 (tope 5).
const UNIFAMILIAR = {
  version: VERSION,
  titular: { edadMin: null, edadMax: 64, etiqueta: 'menor de 65 años' },
  grupos: GRUPOS_ESTANDAR,
  parentescosPermitidos: ['@CONYUGE', '@PADRES', '@HIJOS', '@HERMANOS'],
  limites: { beneficiarios: null, deLey: 6, adicionales: 5 },
  reglas: [
    {
      id: 'edad_de_ley',
      tipo: 'edad',
      aplicaA: ['*'],
      filtro: { tipoBeneficiario: 'DE_LEY' },
      edadMax: 75,
      etiqueta: 'menores o iguales a 75 años',
      mensaje: 'Los beneficiarios de ley deben ser {etiqueta} (edad registrada: {edad}).'
    },
    {
      id: 'cupo_de_ley_60_75',
      tipo: 'cupoPorRangoEdad',
      aplicaA: ['*'],
      filtro: { tipoBeneficiario: 'DE_LEY' },
      edadMin: 60,
      edadMax: 75,
      max: 2,
      etiqueta: 'entre 60 y 75 años',
      mensaje: 'Solo puede incluir {max} beneficiario(s) de ley {etiqueta} (ya registró {usado}).'
    },
    {
      id: 'edad_adicionales',
      tipo: 'edad',
      aplicaA: ['*'],
      filtro: { tipoBeneficiario: 'ADICIONAL' },
      edadMax: 64,
      etiqueta: 'menores de 65 años',
      mensaje: 'Los beneficiarios adicionales deben ser {etiqueta} (edad registrada: {edad}).'
    }
  ]
};

const TEMPLATES = { UNIPERSONAL, BASICO, UNIFAMILIAR };

/**
 * Devuelve una copia profunda de la plantilla de reglas por defecto para el
 * `planTipo` dado, en el formato que consume `convenioRules.parseReglas`.
 * Lanza si el tipo no es uno de los soportados.
 */
function plantillaReglas(planTipo) {
  const t = TEMPLATES[planTipo];
  if (!t) throw new Error(`planTipo desconocido: ${planTipo}`);
  return JSON.parse(JSON.stringify(t));
}

module.exports = { plantillaReglas, TEMPLATES };
