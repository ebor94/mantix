/**
 * Fix 2 (ronda de corrección de revisión, Task 4) — el permiso
 * `empresa.ver_afiliaciones` (sembrado para el rol EMPRESA_RRHH en
 * src/scripts/apply-convenio-nomina.js) quedaba huérfano: nada en el código
 * lo leía (`grep -rn "ver_afiliaciones"` solo encontraba el script de
 * migración que lo escribe).
 *
 * Investigando el punto real de bloqueo: las rutas GET /afiliados,
 * /afiliados/pendientes y /afiliados/rechazados (src/routes/afiliado.routes.js)
 * NO tienen ningún `requirePermiso` — solo exigen `auth` — así que un usuario
 * RRHH ya las alcanza hoy a nivel de ruta. Pero había DOS bloqueos reales, no
 * uno solo:
 *
 *   1. En el controller de GET /afiliados/:id
 *      (src/controllers/afiliado.controller.js#getById): un chequeo manual
 *      de ownership por asesorId que SIEMPRE rechazaba con 403 a cualquier
 *      usuario que no fuera super_admin, no tuviera `afiliaciones.ver_todas`,
 *      Y no fuera el asesor dueño (`asesorId === usuario.id`) — condición
 *      que un usuario RRHH nunca cumple porque no es un asesor. Ese chequeo
 *      ahora también exime a quien tenga `empresa.ver_afiliaciones`.
 *
 *   2. Más profundo, en la composición del WHERE
 *      (whereConFiltroAsesorYEmpresa, src/services/afiliado.service.js):
 *      whereConFiltroAsesor SIEMPRE agrega `asesorId = usuario.id` salvo
 *      super_admin/ver_todas — así que, incluso arreglado el punto 1, el
 *      propio `Afiliado.findOne`/`findAll` nunca habría encontrado una fila
 *      para un RRHH puro (el WHERE real exigía asesorId Y empresaId, y
 *      ningún afiliado tiene el id de un RRHH como asesorId). Este archivo
 *      mockea el servicio, así que NO expone ese bug — se cubre aparte con
 *      tests dedicados a nivel de servicio en
 *      tests/afiliadoScopeEmpresa.test.js ("REGRESIÓN (Fix 2)"), que
 *      verifican que whereConFiltroAsesorYEmpresa ahora aplica SOLO
 *      whereConFiltroEmpresa para un usuario con `empresa.ver_afiliaciones`.
 *
 * Este archivo verifica, con el controller real y afiliado.service mockeado
 * (mismo patrón que tests/afiliadoConvenioInvitacion.routes.test.js), que el
 * punto 1 (el gate del controller) quedó resuelto:
 *   - getAll / getPendientes / getRechazados: un usuario RRHH-shaped
 *     (empresa_id seteado, permisos { empresa: { ver_afiliaciones: true } },
 *     SIN ninguna clave bajo `afiliaciones`) los invoca sin ser bloqueado.
 *   - getById: REGRESIÓN — ese mismo usuario ya NO recibe 403 al pedir el
 *     detalle de un afiliado de su propia empresa.
 *   - getById: CONTROL — un usuario sin ver_todas, sin
 *     empresa.ver_afiliaciones y sin ser el asesor dueño SIGUE recibiendo
 *     403 (el fix no abrió un hueco nuevo).
 */

jest.mock('../src/models', () => ({
  Afiliado: {},
  ReciboCaja: {},
  Usuario: {}
}));

jest.mock('../src/services/afiliado.service');

jest.mock('../src/services/whatsappService', () => ({
  sendAceptacion: jest.fn(),
  sendOTP: jest.fn(),
  sendImagenRecibo: jest.fn(),
  sendTemplateImagenTexto: jest.fn()
}));

jest.mock('../src/services/googleChatService', () => ({
  notificarNuevoVeolia: jest.fn(),
  notificarCorreccionVeolia: jest.fn(),
  notificarNuevoPublico: jest.fn()
}));

jest.mock('../src/services/convenio.service', () => ({}));
jest.mock('../src/services/invitacion.service', () => ({}));
jest.mock('../src/services/emailService', () => ({ enviarNotificacion: jest.fn() }));
jest.mock('../src/services/n8nService', () => ({
  notificarCertificadoAfiliacion: jest.fn(),
  notificarFirma: jest.fn()
}));
jest.mock('../src/services/pdfService', () => ({}));
jest.mock('../src/services/excelService', () => ({}));
jest.mock('../src/services/crmSync.service', () => ({ sincronizarAfiliado: jest.fn() }));

const afiliadoService = require('../src/services/afiliado.service');
const controller = require('../src/controllers/afiliado.controller');

function buildRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Usuario RRHH-shaped: empresa_id seteado, SOLO permisos bajo `empresa`,
// nunca bajo `afiliaciones` (así es como llega EMPRESA_RRHH según
// apply-convenio-nomina.js).
const rrhh = {
  id: 50,
  es_super_admin: false,
  empresa_id: 3,
  rol: { permisos: { empresa: { ver: true, gestionar_empleados: true, invitar: true, ver_afiliaciones: true } } }
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Fix 2 — empresa.ver_afiliaciones deja de ser un permiso huérfano', () => {
  test('getAll: usuario RRHH invoca la ruta sin ser bloqueado (solo exige auth; el scope real lo aplica whereConFiltroEmpresa/Fix 1)', async () => {
    const data = [{ id: 1, empresaId: 3 }, { id: 2, empresaId: 3 }];
    afiliadoService.getAllAfiliados.mockResolvedValue(data);
    const req = { usuario: rrhh };
    const res = buildRes();
    const next = jest.fn();

    await controller.getAll(req, res, next);

    expect(afiliadoService.getAllAfiliados).toHaveBeenCalledWith(rrhh);
    expect(res.json).toHaveBeenCalledWith({ success: true, data });
    expect(next).not.toHaveBeenCalled();
  });

  test('getPendientes: usuario RRHH invoca la ruta sin ser bloqueado', async () => {
    const data = [{ id: 4, empresaId: 3 }];
    afiliadoService.getPendientes.mockResolvedValue(data);
    const req = { usuario: rrhh };
    const res = buildRes();
    const next = jest.fn();

    await controller.getPendientes(req, res, next);

    expect(afiliadoService.getPendientes).toHaveBeenCalledWith(rrhh);
    expect(res.json).toHaveBeenCalledWith({ success: true, data });
    expect(next).not.toHaveBeenCalled();
  });

  test('getRechazados: usuario RRHH invoca la ruta sin ser bloqueado', async () => {
    const afiliadoRechazado = {
      id: 6,
      empresaId: 3,
      rechazado: 1,
      hashCorreccion: null,
      toJSON() { return { id: 6, empresaId: 3, rechazado: 1 }; }
    };
    afiliadoService.getRechazados.mockResolvedValue([afiliadoRechazado]);
    const req = { usuario: rrhh };
    const res = buildRes();
    const next = jest.fn();

    await controller.getRechazados(req, res, next);

    expect(afiliadoService.getRechazados).toHaveBeenCalledWith(rrhh);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [expect.objectContaining({ id: 6, empresaId: 3 })]
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('REGRESIÓN — getById: usuario RRHH (empresa.ver_afiliaciones, sin afiliaciones.ver_todas, no es el asesor dueño) ya NO recibe 403', async () => {
    // Antes del fix: como afiliado.asesorId !== usuario.id (RRHH no es
    // asesor) y pAfil.ver_todas era undefined, el controller SIEMPRE
    // lanzaba 403 para cualquier RRHH — incluso viendo un afiliado de su
    // propia empresa, ya correctamente acotado por whereConFiltroEmpresa
    // en la consulta del servicio (mockeada acá para aislar el controller).
    const afiliadoDeSuEmpresa = { id: 77, empresaId: 3, asesorId: 999 }; // el dueño real es OTRO asesor
    afiliadoService.getAfiliadoById.mockResolvedValue(afiliadoDeSuEmpresa);
    const req = { usuario: rrhh, params: { id: '77' } };
    const res = buildRes();
    const next = jest.fn();

    await controller.getById(req, res, next);

    expect(afiliadoService.getAfiliadoById).toHaveBeenCalledWith('77', rrhh);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: afiliadoDeSuEmpresa });
    expect(next).not.toHaveBeenCalled();
  });

  test('CONTROL — getById: usuario sin ver_todas, sin empresa.ver_afiliaciones y sin ser el asesor dueño SIGUE recibiendo 403', async () => {
    const afiliadoAjeno = { id: 77, empresaId: 3, asesorId: 999 };
    afiliadoService.getAfiliadoById.mockResolvedValue(afiliadoAjeno);
    const otroUsuario = { id: 50, es_super_admin: false, rol: { permisos: { afiliaciones: {} } } };
    const req = { usuario: otroUsuario, params: { id: '77' } };
    const res = buildRes();
    const next = jest.fn();

    await controller.getById(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(res.json).not.toHaveBeenCalled();
  });
});
