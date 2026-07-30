/**
 * Fix 3 (ronda de corrección de revisión, Task 4) — POST
 * /afiliados/convenio/invitacion/:token (src/routes/afiliado.routes.js) no
 * tenía ningún rate limit más allá del limitador global de app.js, mientras
 * que su hermano de solo lectura GET /convenios/invitacion/:token sí lo
 * tiene (Task 1) por ser un token de un solo uso. El POST es incluso más
 * sensible: una adivinanza exitosa no solo lee datos, crea un afiliado y
 * consume la invitación de otra persona bajo su identidad.
 *
 * Fix 4 (ronda de revisión posterior): originalmente este POST montaba
 * `strictRateLimit` — la MISMA instancia (mismo budget de 10 req/15min) que
 * login/OTP/búsqueda de NIT. Como el flujo de invitaciones está pensado
 * para uso masivo desde una sola IP corporativa (muchos empleados detrás
 * del mismo NAT de oficina), compartir ese budget bloqueaba login/OTP de
 * esa misma IP tras solo un puñado de autoafiliaciones. Por eso esta ruta
 * ahora monta `invitacionRateLimit` — una instancia SEPARADA y más
 * permisiva, exportada junto a `strictRateLimit` desde
 * src/middleware/strictRateLimit.js — mientras que sus rutas hermanas
 * (consulta/solicitar-otp, consulta/verificar-otp,
 * :id/solicitar-otp-reenvio) siguen en `strictRateLimit`, sin cambios.
 *
 * Este test verifica, por INTROSPECCIÓN del stack de la ruta (sin disparar
 * peticiones HTTP reales), que cada ruta tiene montado el limiter que le
 * corresponde como PRIMER middleware — comportamiento HTTP de cada limiter
 * ya probado exhaustivamente en tests/strictRateLimit.test.js.
 *
 * Se prefiere introspección de stack en vez de disparar N peticiones HTTP
 * como en tests/strictRateLimit.test.js porque `strictRateLimit` e
 * `invitacionRateLimit` son instancias ÚNICAS de rate limiter compartidas
 * (por referencia) entre TODAS las rutas que las usan — disparar aquí
 * suficientes peticiones para forzar un 429 consumiría el mismo contador
 * compartido que usan otros archivos de test en el mismo proceso de Jest,
 * con riesgo de interferencia entre archivos de test.
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

const { strictRateLimit, invitacionRateLimit } = require('../src/middleware/strictRateLimit');
const afiliadoRoutes = require('../src/routes/afiliado.routes');

describe('POST /afiliados/convenio/invitacion/:token — rate limit propio del flujo de invitaciones (Fix 3 + Fix 4)', () => {
  test('la ruta tiene montado invitacionRateLimit (NO strictRateLimit) como PRIMER middleware de la cadena', () => {
    const layer = afiliadoRoutes.stack.find(
      (l) => l.route && l.route.path === '/convenio/invitacion/:token' && l.route.methods.post
    );
    expect(layer).toBeDefined();

    const handlers = layer.route.stack.map((s) => s.handle);
    expect(handlers[0]).toBe(invitacionRateLimit);
    expect(handlers[0]).not.toBe(strictRateLimit);
  });

  test('las demás rutas rate-limited de este archivo (login/OTP) siguen compartiendo la misma instancia de strictRateLimit, sin cambios (Fix 4 no las tocó)', () => {
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
