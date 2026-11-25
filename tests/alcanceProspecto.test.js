/**
 * Regla única de alcance sobre un prospecto (src/sv/utils/alcanceProspecto.js).
 * El scope se arma con el svAreaGuard real para que la prueba refleje producción.
 */
const { fueraDeAlcance, fueraDeAlcanceVentas } = require('../src/sv/utils/alcanceProspecto');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

function scopeDe(user) {
  const req = { user };
  svAreaGuard(req, {}, () => {});
  return req.scope;
}

const P = (asesor, grupo, area) => ({
  prosp_id: 1, prosp_asesor_id: asesor, prosp_grupo_id: grupo, prosp_area_id: area
});

const asesor       = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [{ grupo_id: 2 }], rol: { rol_codigo: 'ASESOR' } };
const agente       = { usr_id: 12, usr_area_id: 4, usr_grupo_id: 6, rol: { rol_codigo: 'AGENTE_SVC' } };
const supervisor   = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [{ grupo_id: 2 }], rol: { rol_codigo: 'SUPERVISOR' } };
const coordinador  = { usr_id: 21, usr_area_id: 2, usr_grupo_id: 5, rol: { rol_codigo: 'COORDINADOR_PREVISION' } };
// JEFE_PAP con usr_grupo_id distinto del grupo PAP (3): svAreaGuard le fija grupoId = 3.
const jefePap      = { usr_id: 22, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'JEFE_PAP' } };
const adminArea    = { usr_id: 30, usr_area_id: 1, areasExtra: [{ area_id: 2 }], rol: { rol_codigo: 'ADMIN_AREA' } };
const adminSinArea = { usr_id: 31, usr_area_id: null, rol: { rol_codigo: 'ADMIN_AREA' } };
const superAdmin   = { usr_id: 1,  usr_area_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } };
const gerente      = { usr_id: 2,  usr_area_id: 1, rol: { rol_codigo: 'GERENTE_GENERAL' } };
const director     = { usr_id: 3,  usr_area_id: 1, rol: { rol_codigo: 'DIRECTOR_COMERCIAL' } };
const desconocido  = { usr_id: 50, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'OTRO' } };

const TABLA = [
  ['ASESOR, prospecto propio',                         asesor,       P(10, 1, 1),   null],
  ['ASESOR, prospecto de otro asesor de su grupo',     asesor,       P(11, 1, 1),   'Fuera de tu alcance'],
  ['ASESOR, prospecto ajeno en un grupo extra',        asesor,       P(11, 2, 1),   'Fuera de tu alcance'],
  ['ASESOR, prospecto sin asignar',                    asesor,       P(null, 1, 1), 'Fuera de tu alcance'],
  ['AGENTE_SVC, prospecto propio',                     agente,       P(12, 6, 4),   null],
  ['AGENTE_SVC, prospecto ajeno',                      agente,       P(13, 6, 4),   'Fuera de tu alcance'],
  ['SUPERVISOR, prospecto de su grupo',                supervisor,   P(11, 1, 1),   null],
  ['SUPERVISOR, prospecto sin asignar de su grupo',    supervisor,   P(null, 1, 1), null],
  ['SUPERVISOR, prospecto de un grupo extra',          supervisor,   P(11, 2, 1),   null],
  ['SUPERVISOR, prospecto de otro grupo',              supervisor,   P(11, 9, 1),   'Fuera de tu grupo'],
  ['COORDINADOR_PREVISION, prospecto de su grupo',     coordinador,  P(11, 5, 2),   null],
  ['COORDINADOR_PREVISION, prospecto de otro grupo',   coordinador,  P(11, 1, 1),   'Fuera de tu grupo'],
  ['JEFE_PAP con usr_grupo_id ≠ PAP, prospecto PAP',   jefePap,      P(11, 3, 3),   null],
  ['JEFE_PAP, prospecto de otro grupo',                jefePap,      P(11, 9, 2),   'Fuera de tu grupo'],
  ['ADMIN_AREA, prospecto de su área',                 adminArea,    P(11, 9, 1),   null],
  ['ADMIN_AREA, prospecto de un área extra',           adminArea,    P(11, 9, 2),   null],
  ['ADMIN_AREA, prospecto de otra área',               adminArea,    P(11, 9, 4),   'Fuera de tu área'],
  ['ADMIN_AREA sin área asignada',                     adminSinArea, P(11, 9, 1),   'Sin alcance definido'],
  ['SUPER_ADMIN',                                      superAdmin,   P(11, 9, 4),   null],
  ['GERENTE_GENERAL (cross-área)',                     gerente,      P(11, 9, 4),   null],
  ['DIRECTOR_COMERCIAL (cross-área)',                  director,     P(11, 9, 4),   null],
  ['rol desconocido',                                  desconocido,  P(10, 1, 1),   'Sin alcance definido']
];

describe('fueraDeAlcance', () => {
  test.each(TABLA)('%s', (_, user, prospecto, esperado) => {
    expect(fueraDeAlcance(user, scopeDe(user), prospecto)).toBe(esperado);
  });

  test('compara ids aunque lleguen como texto', () => {
    expect(fueraDeAlcance(supervisor, scopeDe(supervisor), P('11', '1', '1'))).toBeNull();
    expect(fueraDeAlcance(asesor, scopeDe(asesor), P('10', '1', '1'))).toBeNull();
  });

  test('sin scope → Sin alcance definido', () => {
    expect(fueraDeAlcance(asesor, undefined, P(10, 1, 1))).toBe('Sin alcance definido');
  });
});

describe('fueraDeAlcanceVentas', () => {
  const ventasDe = (user, prospecto) => fueraDeAlcanceVentas(user, scopeDe(user), prospecto);
  const gerenteExtras = { usr_id: 2, usr_area_id: 1, areasExtra: [{ area_id: 2 }, { area_id: 3 }, { area_id: 4 }], rol: { rol_codigo: 'GERENTE_GENERAL' } };
  const directorExtras = { usr_id: 3, usr_area_id: 2, areasExtra: [{ area_id: 3 }, { area_id: 4 }], rol: { rol_codigo: 'DIRECTOR_COMERCIAL' } };
  const directorSinAreas = { usr_id: 4, usr_area_id: null, rol: { rol_codigo: 'DIRECTOR_COMERCIAL' } };
  const superSinArea = { usr_id: 1, usr_area_id: null, rol: { rol_codigo: 'SUPER_ADMIN' } };

  test('SUPER_ADMIN llega a cualquier área, aunque no tenga la suya ni el prospecto', () => {
    expect(ventasDe(superAdmin, P(11, 9, 4))).toBeNull();
    expect(ventasDe(superSinArea, P(11, 9, 4))).toBeNull();
    expect(ventasDe(superSinArea, P(11, 9, null))).toBeNull();
  });

  test('GERENTE_GENERAL solo llega a sus áreas', () => {
    expect(ventasDe(gerenteExtras, P(11, 9, 4))).toBeNull();
    expect(ventasDe(gerente, P(11, 9, 4))).toBe('Fuera de tu área');
  });

  test('DIRECTOR_COMERCIAL solo llega a sus áreas', () => {
    expect(ventasDe(directorExtras, P(11, 9, 3))).toBeNull();
    expect(ventasDe(directorExtras, P(11, 9, 1))).toBe('Fuera de tu área');
    expect(ventasDe(directorExtras, P(11, 9, null))).toBe('Fuera de tu área');
  });

  test('DIRECTOR_COMERCIAL sin áreas no llega a ninguna', () => {
    expect(ventasDe(directorSinAreas, P(11, 9, 1))).toBe('Fuera de tu área');
  });

  test('compara ids aunque lleguen como texto', () => {
    const u = { usr_id: 3, usr_area_id: '2', areasExtra: [{ area_id: '3' }], rol: { rol_codigo: 'DIRECTOR_COMERCIAL' } };
    expect(ventasDe(u, P(11, 9, '3'))).toBeNull();
    expect(ventasDe(u, P(11, 9, '2'))).toBeNull();
  });

  test.each(TABLA.filter(([, user]) => ![superAdmin, gerente, director].includes(user)))('%s: igual que fueraDeAlcance', (_, user, prospecto, esperado) => {
    expect(ventasDe(user, prospecto)).toBe(esperado);
  });
});
