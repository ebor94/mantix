/**
 * Regresión de prospectos.controller.getOne sobre utils/alcanceProspecto.
 */
jest.mock('../src/sv/services/prospectos.service', () => ({ obtenerCompleto: jest.fn() }));

const prospectos = require('../src/sv/services/prospectos.service');
const ctrl = require('../src/sv/controllers/prospectos.controller');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

function reqDe(user, id) {
  const req = { user, params: { id: String(id) }, query: {}, body: {} };
  svAreaGuard(req, {}, () => {});
  return req;
}
function resFalso() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const ASESOR     = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR' } };
const SUPERVISOR = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'SUPERVISOR' } };
const JEFE_PAP   = { usr_id: 22, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'JEFE_PAP' } };

const PROPIO      = { prosp_id: 100, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 };
const AJENO       = { prosp_id: 101, prosp_asesor_id: 11, prosp_grupo_id: 1, prosp_area_id: 1 };
const OTRO_GRUPO  = { prosp_id: 200, prosp_asesor_id: 30, prosp_grupo_id: 2, prosp_area_id: 1 };
const PAP         = { prosp_id: 300, prosp_asesor_id: 40, prosp_grupo_id: 3, prosp_area_id: 3 };

beforeEach(() => jest.clearAllMocks());

describe('prospectos.controller.getOne', () => {
  test('asesor sobre su prospecto → 200', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(PROPIO);
    const res = resFalso();
    await ctrl.getOne(reqDe(ASESOR, 100), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: PROPIO });
  });

  test('asesor sobre prospecto ajeno → 403 Fuera de tu alcance', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(AJENO);
    const res = resFalso();
    await ctrl.getOne(reqDe(ASESOR, 101), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
  });

  test('supervisor sobre prospecto de otro grupo → 403 Fuera de tu grupo', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(OTRO_GRUPO);
    const res = resFalso();
    await ctrl.getOne(reqDe(SUPERVISOR, 200), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu grupo' });
  });

  test('JEFE_PAP con usr_grupo_id ≠ PAP sobre prospecto PAP → 200', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(PAP);
    const res = resFalso();
    await ctrl.getOne(reqDe(JEFE_PAP, 300), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('prospecto inexistente → 404', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(null);
    const res = resFalso();
    await ctrl.getOne(reqDe(ASESOR, 999), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'NOT_FOUND', message: 'Prospecto no encontrado' });
  });

  test('error del servicio → la promesa se resuelve y next recibe el error', async () => {
    const err = new Error('ER_LOCK_WAIT_TIMEOUT');
    prospectos.obtenerCompleto.mockRejectedValue(err);
    const next = jest.fn();
    await expect(ctrl.getOne(reqDe(ASESOR, 100), resFalso(), next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledWith(err);
  });
});
