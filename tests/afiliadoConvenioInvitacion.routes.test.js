/**
 * Task 4.1/4.2 — POST /afiliados/convenio/invitacion/:token
 * (src/routes/afiliado.routes.js + src/controllers/afiliado.controller.js).
 *
 * Verifica, a nivel de ruta+controller (con afiliadoService/invitacionService/
 * convenioService mockeados — sin BD real):
 *   - La ruta es pública: responde sin header Authorization.
 *   - Caso feliz: delega en afiliadoService.createAfiliadoConInvitacion con el
 *     token de la URL y responde 201.
 *   - La identidad del titular (tipoDocumento/numeroDocumento/primerNombre/
 *     primerApellido) se FUERZA desde el empleado que devuelve
 *     invitacionService.resolverToken, ignorando lo que venga en el body —
 *     el cliente no puede autoafiliar a otra persona con un link ajeno.
 *   - Los datos comerciales (convenioId/nit/canal/producto/grupo) se fuerzan
 *     desde el convenio, igual que en createPublicoConvenio (Parte 1).
 *   - Si el token no es válido (resolverToken rechaza), la ruta responde con
 *     el statusCode del AppError (ej. 410 invitación ya usada) sin llegar a
 *     llamar createAfiliadoConInvitacion.
 */

const express = require('express');
const request = require('supertest');

const mockAfiliado = { count: jest.fn().mockResolvedValue(1) };

jest.mock('../src/models', () => ({
  Afiliado: mockAfiliado,
  ReciboCaja: {},
  Usuario: {}
}));

jest.mock('../src/services/afiliado.service', () => ({
  createAfiliadoConInvitacion: jest.fn()
}));

jest.mock('../src/services/invitacion.service', () => ({
  resolverToken: jest.fn()
}));

jest.mock('../src/services/convenio.service', () => ({
  obtenerPorSlug: jest.fn()
}));

jest.mock('../src/services/whatsappService', () => ({
  sendAceptacion: jest.fn().mockResolvedValue(true),
  sendOTP: jest.fn(),
  sendImagenRecibo: jest.fn(),
  sendTemplateImagenTexto: jest.fn()
}));

jest.mock('../src/services/googleChatService', () => ({
  notificarNuevoVeolia: jest.fn(),
  notificarCorreccionVeolia: jest.fn(),
  notificarNuevoPublico: jest.fn()
}));

jest.mock('../src/services/emailService', () => ({
  enviarNotificacion: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/services/n8nService', () => ({
  notificarCertificadoAfiliacion: jest.fn(),
  notificarFirma: jest.fn()
}));

jest.mock('../src/services/crmSync.service', () => ({
  sincronizarAfiliado: jest.fn()
}));

const afiliadoService = require('../src/services/afiliado.service');
const invitacionService = require('../src/services/invitacion.service');
const convenioService = require('../src/services/convenio.service');
const afiliadoRoutes = require('../src/routes/afiliado.routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/afiliados', afiliadoRoutes);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

// Payload que un cliente malicioso enviaría intentando autoafiliar a "otra
// persona" (documento/nombre distintos a los del empleado de la invitación).
const payloadCliente = {
  tipoDocumento: 'CC',
  numeroDocumento: '99999999',
  primerApellido: 'Impostor',
  primerNombre: 'Falso',
  fechaNacimiento: '1990-01-01',
  edad: 34,
  sexo: 'M',
  estadoCivil: 'SOLTERO',
  celular: '3001112222'
};

const empleadoFalso = {
  tipoDocumento: 'CC',
  numeroDocumento: '123456789',
  primerNombre: 'Ana',
  primerApellido: 'Pérez',
  celular: '3001234567',
  email: 'ana@example.com',
  cargo: 'Auxiliar'
};

const convenioFalso = {
  id: 10,
  slug: 'conyca',
  nombre: 'CONYCA',
  nit: '900123456',
  canal: 'EMPRESARIAL',
  producto: 'VERDE',
  grupo: 'BASICO',
  json: (campo) => (campo === 'contacto' ? {} : campo === 'formulario' ? {} : null)
};

describe('POST /afiliados/convenio/invitacion/:token', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAfiliado.count.mockResolvedValue(1);
    app = buildApp();
  });

  test('ruta pública: responde sin header Authorization', async () => {
    invitacionService.resolverToken.mockResolvedValue({
      convenio: { slug: 'conyca' },
      empleado: empleadoFalso
    });
    convenioService.obtenerPorSlug.mockResolvedValue(convenioFalso);
    afiliadoService.createAfiliadoConInvitacion.mockResolvedValue({
      id: 500, ...empleadoFalso, beneficiarios: []
    });

    const res = await request(app)
      .post('/api/afiliados/convenio/invitacion/tok-valido')
      .send(payloadCliente);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('fuerza tipoDocumento/numeroDocumento/primerNombre/primerApellido desde el empleado, ignorando el body', async () => {
    invitacionService.resolverToken.mockResolvedValue({
      convenio: { slug: 'conyca' },
      empleado: empleadoFalso
    });
    convenioService.obtenerPorSlug.mockResolvedValue(convenioFalso);
    afiliadoService.createAfiliadoConInvitacion.mockResolvedValue({
      id: 500, ...empleadoFalso, beneficiarios: []
    });

    await request(app)
      .post('/api/afiliados/convenio/invitacion/tok-valido')
      .send(payloadCliente);

    expect(afiliadoService.createAfiliadoConInvitacion).toHaveBeenCalledTimes(1);
    const [bodyEnviado, tokenEnviado] = afiliadoService.createAfiliadoConInvitacion.mock.calls[0];

    // Identidad forzada desde el empleado — NO desde payloadCliente.
    expect(bodyEnviado.numeroDocumento).toBe('123456789');
    expect(bodyEnviado.primerNombre).toBe('Ana');
    expect(bodyEnviado.primerApellido).toBe('Pérez');
    expect(bodyEnviado.tipoDocumento).toBe('CC');

    // Datos comerciales forzados desde el convenio (igual que createPublicoConvenio).
    expect(bodyEnviado.convenioId).toBe(10);
    expect(bodyEnviado.nit).toBe('900123456');
    expect(bodyEnviado.canal).toBe('EMPRESARIAL');
    expect(bodyEnviado.producto).toBe('VERDE');
    expect(bodyEnviado.grupo).toBe('BASICO');
    expect(bodyEnviado.origen).toBe('CONVENIO');
    expect(bodyEnviado.asesorId).toBeNull();

    // El token de la URL se pasa tal cual al servicio.
    expect(tokenEnviado).toBe('tok-valido');
  });

  test('token inválido/vencido: resolverToken rechaza y la ruta responde con el statusCode del AppError, sin crear afiliado', async () => {
    const err = new Error('Esta invitación ya fue utilizada');
    err.statusCode = 410;
    invitacionService.resolverToken.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/afiliados/convenio/invitacion/tok-usado')
      .send(payloadCliente);

    expect(res.status).toBe(410);
    expect(res.body).toEqual({ success: false, message: 'Esta invitación ya fue utilizada' });
    expect(convenioService.obtenerPorSlug).not.toHaveBeenCalled();
    expect(afiliadoService.createAfiliadoConInvitacion).not.toHaveBeenCalled();
  });

  test('convenio ya no disponible (obtenerPorSlug devuelve null): 404, sin crear afiliado', async () => {
    invitacionService.resolverToken.mockResolvedValue({
      convenio: { slug: 'conyca' },
      empleado: empleadoFalso
    });
    convenioService.obtenerPorSlug.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/afiliados/convenio/invitacion/tok-valido')
      .send(payloadCliente);

    expect(res.status).toBe(404);
    expect(afiliadoService.createAfiliadoConInvitacion).not.toHaveBeenCalled();
  });
});
