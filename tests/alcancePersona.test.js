/**
 * Relación de un usuario con una persona (src/sv/utils/alcancePersona.js).
 * El scope se arma con el svAreaGuard real para que la prueba refleje producción.
 */
const { fueraDeAlcancePersona, SIN_RELACION } = require('../src/sv/utils/alcancePersona');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

function scopeDe(user) {
  const req = { user };
  svAreaGuard(req, {}, () => {});
  return req.scope;
}

const P = (asesor, grupo, area) => ({
  prosp_id: 1, prosp_asesor_id: asesor, prosp_grupo_id: grupo, prosp_area_id: area
});

const asesor      = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR' } };
const supervisor  = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], rol: { rol_codigo: 'SUPERVISOR' } };
const adminArea   = { usr_id: 30, usr_area_id: 1, areasExtra: [], rol: { rol_codigo: 'ADMIN_AREA' } };
// JEFE_PAP con usr_grupo_id 1: svAreaGuard le fija grupoId = 3 (PAP).
const jefePap     = { usr_id: 22, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'JEFE_PAP' } };
const gerente     = { usr_id: 2,  usr_area_id: 1, rol: { rol_codigo: 'GERENTE_GENERAL' } };
const desconocido = { usr_id: 50, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'OTRO' } };

const NO = 'Sin prospectos de esta persona en tu alcance';

describe('fueraDeAlcancePersona', () => {
  test('exporta el mensaje del 403', () => {
    expect(SIN_RELACION).toBe(NO);
  });

  test.each([
    ['cross-área sin prospectos',                     gerente,     [],                                      null],
    ['cross-área con prospectos ajenos',              gerente,     [P(99, 9, 9)],                           null],
    ['ASESOR con uno propio entre ajenos',            asesor,      [P(11, 1, 1), P(10, 1, 1), P(30, 2, 2)], null],
    ['ASESOR solo con prospectos ajenos',             asesor,      [P(11, 1, 1), P(30, 2, 2)],              NO],
    ['SUPERVISOR con uno de su grupo',                supervisor,  [P(30, 2, 1), P(11, 1, 1)],              null],
    ['SUPERVISOR solo con prospectos de otro grupo',  supervisor,  [P(30, 2, 1)],                           NO],
    ['ADMIN_AREA con uno de su área',                 adminArea,   [P(40, 7, 3), P(41, 5, 1)],              null],
    ['ADMIN_AREA solo con prospectos de otra área',   adminArea,   [P(40, 7, 3)],                           NO],
    ['JEFE_PAP con uno del grupo PAP',                jefePap,     [P(60, 3, 3)],                           null],
    ['JEFE_PAP fuera de PAP y de su grupo',           jefePap,     [P(60, 4, 2)],                           NO],
    ['lista vacía sin cross-área',                    supervisor,  [],                                      NO],
    ['rol sin alcance definido',                      desconocido, [P(10, 1, 1)],                           NO]
  ])('%s', (_, user, prospectos, esperado) => {
    expect(fueraDeAlcancePersona(user, scopeDe(user), prospectos)).toBe(esperado);
  });

  test('lista null se trata como vacía', () => {
    expect(fueraDeAlcancePersona(asesor, scopeDe(asesor), null)).toBe(NO);
  });

  test('scope ausente falla cerrado', () => {
    expect(fueraDeAlcancePersona(asesor, undefined, [P(10, 1, 1)])).toBe(NO);
  });
});
