// Correo y calendario vía el webhook de n8n: contrato con el flujo "Masajes — avisos" (nada sale a la red).
const nock = require('nock');
const { crearClienteN8n, crearCorreoN8n, crearCalendarioN8n } = require('../adapters/n8n');
const { crearAdaptadoresReales } = require('../adapters');

const BASE = 'http://n8n.interno:5678';
const RUTA = '/webhook/masajes-avisos';
const SECRETO = 's'.repeat(40);
const cita = { id: 7, inicio: new Date('2026-11-26T14:00:00Z'), fin: new Date('2026-11-26T15:00:00Z') };
const beneficiario = { nombre: 'Ana Perez', cargo: 'Guía', celular: '573152884079', correo: 'ana@losolivos.co' };
const spa = { nombre: 'SPA', direccion: 'Hotel', email: 'spa@losolivos.co', enEvento: false };
const datos = { cita, beneficiario, spa, appUrl: 'https://losolivoscucuta.com/AgendaPromax' };
const cliente = () => crearClienteN8n({ url: BASE + RUTA, secreto: SECRETO });
const webhook = () => nock(BASE, { reqheaders: { 'x-masajes-clave': SECRETO } }).post(RUTA);

afterEach(() => nock.cleanAll());
beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());

describe('correo vía n8n', () => {
  const correo = () => crearCorreoN8n({ cliente: cliente() });

  test('POST { accion: correo, para, asunto, html, texto } con el secreto en la cabecera; devuelve el id', async () => {
    const s = webhook().reply(200, function (uri, body) {
      expect(body).toEqual({ accion: 'correo', para: 'spa@losolivos.co', asunto: 'Nueva cita', html: '<p>x</p>', texto: 'x' });
      return { id: 'msg-1' };
    });
    await expect(correo().enviar('spa@losolivos.co', { asunto: 'Nueva\r\ncita', html: '<p>x</p>', texto: 'x' })).resolves.toBe('msg-1');
    s.done();
  });

  test('el secreto nunca va en la URL ni en el cuerpo', async () => {
    let uriVista; let cuerpo;
    nock(BASE).post(/.*/).reply(function (uri, body) { uriVista = uri; cuerpo = body; return [200, {}]; });
    await correo().enviar('spa@losolivos.co', { asunto: 'a', html: 'h', texto: 't' });
    expect(uriVista).toBe(RUTA);
    expect(JSON.stringify(cuerpo)).not.toContain(SECRETO);
  });

  test('destinatario inválido (p. ej. con coma) no llega a n8n', async () => {
    await expect(correo().enviar('spa@losolivos.co,', { asunto: 'a', html: 'h' })).rejects.toThrow('CORREO_DESTINATARIO_INVALIDO');
  });

  test.each([[403, false], [401, false], [400, false], [404, true], [500, true], [502, true]])('HTTP %i del webhook → reintentable=%p, sin el secreto', async (status, reintentable) => {
    webhook().reply(status, { mensaje: 'algo' });
    const err = await correo().enviar('spa@losolivos.co', { asunto: 'a', html: 'h' }).catch((e) => e);
    expect(err).toMatchObject({ name: 'ErrorN8n', status, reintentable });
    expect(JSON.stringify(err) + err.message).not.toContain(SECRETO);
  });

  test('sin red → reintentable y sin la config de axios', async () => {
    const http = { post: jest.fn(async () => { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED', config: { headers: { 'X-Masajes-Clave': SECRETO } } }); }) };
    const c = crearCorreoN8n({ cliente: crearClienteN8n({ url: BASE + RUTA, secreto: SECRETO, http }) });
    const err = await c.enviar('spa@losolivos.co', { asunto: 'a', html: 'h' }).catch((e) => e);
    expect(err).toMatchObject({ name: 'ErrorN8n', reintentable: true, message: 'n8n no respondió (ECONNREFUSED)' });
    expect(err.config).toBeUndefined();
    expect(JSON.stringify(err) + err.message).not.toContain(SECRETO);
  });
});

describe('calendario vía n8n', () => {
  const cal = () => crearCalendarioN8n({ cliente: cliente() });

  test('sin evento previo → cal_insertar con el evento de Google y devuelve el id', async () => {
    const s = webhook().reply(200, function (uri, body) {
      expect(body.accion).toBe('cal_insertar');
      expect(body.evento).toMatchObject({ summary: 'Masaje — Ana Perez', visibility: 'private', start: { dateTime: '2026-11-26T14:00:00.000Z' }, attendees: [{ email: 'ana@losolivos.co' }] });
      expect(JSON.stringify(body)).not.toContain('573152884079'); // sin celular en el evento
      return { origen: 'google', id: 'abc123' };
    });
    await expect(cal().upsert({ ...datos, googleEventId: null })).resolves.toBe('abc123');
    s.done();
  });

  test('con evento → cal_actualizar; si Google dice 404 se crea de nuevo', async () => {
    const s = webhook().reply(404, { origen: 'google', mensaje: 'Not Found' })
      .post(RUTA, (b) => b.accion === 'cal_insertar').reply(200, { origen: 'google', id: 'nuevo1' });
    await expect(cal().upsert({ ...datos, googleEventId: 'viejo1' })).resolves.toBe('nuevo1');
    s.done();
  });

  test('404 de n8n (webhook inactivo, sin origen google) NO crea un duplicado: falla reintentable', async () => {
    webhook().reply(404, { message: 'The requested webhook is not registered' });
    await expect(cal().upsert({ ...datos, googleEventId: 'viejo1' })).rejects.toMatchObject({ status: 404, reintentable: true });
  });

  test('insertar sin id en la respuesta → error reintentable', async () => {
    webhook().reply(200, { origen: 'google' });
    await expect(cal().upsert({ ...datos, googleEventId: null })).rejects.toMatchObject({ reintentable: true });
  });

  test('eliminar: 204 y 404/410 de Google son éxito; un id raro no llega a n8n', async () => {
    webhook().reply(204);
    await expect(cal().eliminar('abc')).resolves.toBeUndefined();
    webhook().reply(410, { origen: 'google' });
    await expect(cal().eliminar('abc')).resolves.toBeUndefined();
    await expect(cal().eliminar('../calendars/otro')).resolves.toBeUndefined();
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('eliminar con 500 de Google → error reintentable', async () => {
    webhook().reply(500, { origen: 'google' });
    await expect(cal().eliminar('abc')).rejects.toMatchObject({ status: 500, reintentable: true });
  });
});

test('crearAdaptadoresReales usa n8n para correo y calendario cuando integ.n8n existe', () => {
  const a = crearAdaptadoresReales({ n8n: { url: BASE + RUTA, secreto: SECRETO }, google: null, hablame: { url: 'https://www.hablame.co/x', apiKey: 'k' } }, {});
  expect(Object.keys(a).sort()).toEqual(['calendario', 'correo', 'sms']);
});
