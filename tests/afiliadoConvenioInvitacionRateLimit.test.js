/**
 * Fix 3 (ronda de corrección de revisión, Task 4) — POST
 * /afiliados/convenio/invitacion/:token (src/routes/afiliado.routes.js) no
 * tenía ningún rate limit más allá del limitador global de app.js, mientras
 * que su hermano de solo lectura GET /convenios/invitacion/:token sí lo
 * tiene (strictRateLimit, Task 1) por ser un token de un solo uso. El POST es
 * incluso más sensible: una adivinanza exitosa no solo lee datos, crea un
 * afiliado y consume la invitación de otra persona bajo su identidad.
 *
 * Este test verifica, por INTROSPECCIÓN del stack de la ruta (sin disparar
 * peticiones HTTP reales), que `strictRateLimit` está montado como el PRIMER
 * middleware de la ruta — mismo criterio y misma instancia de
 * src/middleware/strictRateLimit.js que usan las demás rutas rate-limited de
 * este archivo (consulta/solicitar-otp, consulta/verificar-otp,
 * :id/solicitar-otp-reenvio) y que Task 1 ya probó exhaustivamente a nivel
 * de comportamiento HTTP en tests/strictRateLimit.test.js.
 *
 * Se prefiere introspección de stack en vez de disparar N peticiones HTTP
 * como en tests/strictRateLimit.test.js porque `strictRateLimit` es una
 * ÚNICA instancia de rate limiter compartida (por referencia) entre TODAS
 * las rutas de afiliado.routes.js que la usan — disparar aquí suficientes
 * peticiones para forzar un 429 consumiría el mismo contador compartido que
 * usan tests/afiliadoConvenioInvitacion.routes.test.js en el mismo proceso
 * de Jest, con riesgo de interferencia entre archivos de test.
 */

// Mocks mínimos para poder cargar afiliado.routes.js -> afiliado.controller.js
// -> afiliado.service.js sin conexión real a BD (mismo patrón que
// tests/afiliadoConvenioInvitacion.routes.test.js).
jest.mock('../src/models', () => ({
  Afiliado: {}, ReciboCaja: {}, Usuario: {}
}));
jest.mock('../src/services/whatsappService', () => ({
  sendAceptacion: jest.fn(), sendOTP: jest.fn(), sendImagenRecibo: jest.fn(), sendTemplateImagenTexto: jest.fn()
}));
jest.mock('../src/services/googleChatService', () => ({
  notificarNuevoVeolia: jest.fn(), notificarCorreccionVeolia: jest.fn(), notificarNuevoPublico: jest.fn()
}));
jest.mock('../src/services/convenio.service', () => ({}));
jest.mock('../src/services/invitacion.service', () => ({}));
jest.mock('../src/services/emailService', () => ({ enviarNotificacion: jest.fn() }));
jest.mock('../src/services/n8nService', () => ({
  notificarCertificadoAfiliacion: jest.fn(), notificarFirma: jest.fn()
}));
jest.mock('../src/services/pdfService', () => ({}));
jest.mock('../src/services/excelService', () => ({}));
jest.mock('../src/services/crmSync.service', () => ({ sincronizarAfiliado: jest.fn() }));

const strictRateLimit = require('../src/middleware/strictRateLimit');
const afiliadoRoutes = require('../src/routes/afiliado.routes');

describe('POST /afiliados/convenio/invitacion/:token — rate limit estricto (Fix 3)', () => {
  test('la ruta tiene montado strictRateLimit como PRIMER middleware de la cadena', () => {
    const layer = afiliadoRoutes.stack.find(
      (l) => l.route && l.route.path === '/convenio/invitacion/:token' && l.route.methods.post
    );
    expect(layer).toBeDefined();

    const handlers = layer.route.stack.map((s) => s.handle);
    expect(handlers[0]).toBe(strictRateLimit);
  });

  test('las demás rutas rate-limited de este archivo comparten la misma instancia de strictRateLimit (consistencia con Task 1)', () => {
    const rutasEsperadas = [
      { path: '/consulta/solicitar-otp', method: 'post' },
      { path: '/consulta/verificar-otp', method: 'post' },
      { path: '/:id/solicitar-otp-reenvio', method: 'post' }
    ];

    for (const { path, method } of rutasEsperadas) {
      const layer = afiliadoRoutes.stack.find(
        (l) => l.route && l.route.path === path && l.route.methods[method]
      );
      expect(layer).toBeDefined();
      const handlers = layer.route.stack.map((s) => s.handle);
      expect(handlers[0]).toBe(strictRateLimit);
    }
  });
});
