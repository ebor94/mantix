const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, CONFIG, ORIGEN } = require('../testing/appPrueba');
const DueloError = require('../utils/DueloError');
const logger = require('../../utils/logger');

// El 500 de la prueba correspondiente registra un error a propósito; se captura aquí para no ensuciar la salida.
jest.mock('../../utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

afterEach(cerrarServidores);

const RUTA = '/api/duelo/v1/inscripciones';
const enviar = async (app, { origen = ORIGEN, campos = {}, fotos = {} } = {}) => {
  let peticion = request(await servir(app)).post(RUTA);
  if (origen) peticion = peticion.set('Origin', origen);
  peticion = peticion.field('nombre_completo', 'Ana Pérez');
  for (const [k, v] of Object.entries(campos)) peticion = peticion.field(k, v);
  for (const [k, v] of Object.entries(fotos)) peticion = peticion.attach(k, v, { filename: `${k}.jpg`, contentType: 'image/jpeg' });
  return peticion;
};

test('GET /estado informa apertura y versión de la política', async () => {
  const { app } = crearAppPrueba();
  const r = await request(await servir(app)).get('/api/duelo/v1/estado');
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ success: true, data: { abiertas: true, versionPolitica: 'borrador' } });
});

test('POST válido responde 201, entrega campos y fotos al servicio y dispara el correo', async () => {
  const { app, deps } = crearAppPrueba();
  deps.servicio.inscribir.mockResolvedValue({ id: 9, datos: { correo: 'a@b.co' } });
  const r = await enviar(app, { campos: { cedula: '1090000001' }, fotos: { foto_2: Buffer.from('jpg-2') } });
  expect(r.status).toBe(201);
  expect(r.body).toEqual({ success: true });
  const llamada = deps.servicio.inscribir.mock.calls[0][0];
  expect(llamada.cuerpo).toMatchObject({ nombre_completo: 'Ana Pérez', cedula: '1090000001' });
  expect(Object.keys(llamada.archivos)).toEqual(['2']);
  expect(llamada.archivos[2].toString()).toBe('jpg-2');
  expect(deps.servicio.notificarInscripcion).toHaveBeenCalledWith(9, { correo: 'a@b.co' });
});

test('sin Origin o con un origen ajeno responde 403', async () => {
  const { app, deps } = crearAppPrueba();
  expect((await enviar(app, { origen: null })).status).toBe(403);
  expect((await enviar(app, { origen: 'https://otro.com' })).status).toBe(403);
  expect(deps.servicio.inscribir).not.toHaveBeenCalled();
});

test('honeypot diligenciado: 201 sin guardar', async () => {
  const { app, deps } = crearAppPrueba();
  const r = await enviar(app, { campos: { sitio_web: 'http://spam' } });
  expect(r.status).toBe(201);
  expect(deps.servicio.inscribir).not.toHaveBeenCalled();
});

test('los errores del servicio salen con el contrato del módulo', async () => {
  const { app, deps } = crearAppPrueba();
  deps.servicio.inscribir.mockRejectedValue(new DueloError(422, 'VALIDACION', 'Revisa', { cedula: 'mal' }));
  const r = await enviar(app);
  expect(r.status).toBe(422);
  expect(r.body).toEqual({ success: false, motivo: 'VALIDACION', message: 'Revisa', errores: { cedula: 'mal' } });
});

test('un error inesperado responde 500 genérico', async () => {
  const { app, deps } = crearAppPrueba();
  deps.servicio.inscribir.mockRejectedValue(new Error("Duplicate entry '1090000001'"));
  const r = await enviar(app);
  expect(r.status).toBe(500);
  expect(JSON.stringify(r.body)).not.toContain('1090000001');
  expect(logger.error).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(logger.error.mock.calls)).not.toContain('1090000001');
});

test('foto de más de 10 MB: 413 en el campo de esa foto', async () => {
  const { app } = crearAppPrueba();
  const r = await enviar(app, { fotos: { foto_1: Buffer.alloc(10 * 1024 * 1024 + 1) } });
  expect(r.status).toBe(413);
  expect(r.body.errores).toEqual({ companero_1_foto: expect.stringContaining('10 MB') });
});

test('supera el límite de envíos por IP: 429', async () => {
  const { app } = crearAppPrueba({ obtenerConfig: () => ({ ...CONFIG, limiteInscripciones: 2 }) });
  expect((await enviar(app)).status).toBe(201);
  expect((await enviar(app)).status).toBe(201);
  const r = await enviar(app);
  expect(r.status).toBe(429);
  expect(r.body.motivo).toBe('DEMASIADOS_INTENTOS');
});

test('Turnstile configurado: exige y verifica el token', async () => {
  const http = { post: jest.fn(async () => ({ data: { success: false } })) };
  const { app, deps } = crearAppPrueba({ http, obtenerConfig: () => ({ ...CONFIG, turnstileSecret: 'ts' }) });
  const rechazo = await enviar(app, { campos: { turnstile_token: 'malo' } });
  expect(rechazo.status).toBe(422);
  expect(rechazo.body.errores.turnstile).toBeTruthy();
  expect(deps.servicio.inscribir).not.toHaveBeenCalled();

  http.post.mockResolvedValue({ data: { success: true } });
  expect((await enviar(app, { campos: { turnstile_token: 'bueno' } })).status).toBe(201);
  expect(http.post.mock.calls[1][0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
});

test('ruta desconocida responde 404 en JSON', async () => {
  const { app } = crearAppPrueba();
  const r = await request(await servir(app)).get('/api/duelo/v1/no-existe');
  expect(r.status).toBe(404);
  expect(r.body.success).toBe(false);
});

test('petición no multipart sin parser de cuerpo: no es 500 y el servicio recibe un objeto', async () => {
  const { app, deps } = crearAppPrueba({}, { sinJson: true });
  const r = await request(await servir(app)).post(RUTA).set('Origin', ORIGEN)
    .set('Content-Type', 'text/plain').send('hola');
  expect(r.status).not.toBe(500);
  expect(deps.servicio.inscribir).toHaveBeenCalledTimes(1);
  const { cuerpo } = deps.servicio.inscribir.mock.calls[0][0];
  expect(typeof cuerpo).toBe('object');
  expect(cuerpo).not.toBeNull();
});

describe('fallos del correo posteriores a la respuesta', () => {
  beforeEach(() => { logger.error.mockClear(); });
  const PERSONAL = ['Ana', 'ana@correo.com', '1090000001', 'smtp rechazó ana@correo.com'];
  const sinDatosPersonales = () => {
    const texto = JSON.stringify(logger.error.mock.calls);
    for (const dato of PERSONAL) expect(texto).not.toContain(dato);
  };
  const inscribirOk = (deps) => deps.servicio.inscribir.mockResolvedValue({
    id: 7, datos: { nombre_completo: 'Ana', correo: 'ana@correo.com', cedula: '1090000001' },
  });
  const esperarLog = () => new Promise((ok) => { setImmediate(ok); });

  test('rechazo asíncrono: sigue el 201 y se registra una línea sin datos personales', async () => {
    const { app, deps } = crearAppPrueba();
    inscribirOk(deps);
    const error = Object.assign(new Error('smtp rechazó ana@correo.com'), { code: 'EENVELOPE' });
    deps.servicio.notificarInscripcion.mockRejectedValue(error);
    const r = await enviar(app);
    await esperarLog();
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ success: true });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][1]).toEqual({ inscripcion: 7, nombre: 'Error', codigo: 'EENVELOPE' });
    sinDatosPersonales();
  });

  test('excepción síncrona: sigue el 201 y se registra una línea sin datos personales', async () => {
    const { app, deps } = crearAppPrueba();
    inscribirOk(deps);
    deps.servicio.notificarInscripcion.mockImplementation(() => { throw new TypeError('smtp rechazó ana@correo.com'); });
    const r = await enviar(app);
    await esperarLog();
    expect(r.status).toBe(201);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.error.mock.calls)).toContain('TypeError');
    sinDatosPersonales();
  });
});
