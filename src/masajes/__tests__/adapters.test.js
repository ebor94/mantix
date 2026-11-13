const nock = require('nock');
const { crearClienteHablame } = require('../adapters/hablameSms');
const { crearCalendario, eventoDe, SCOPE } = require('../adapters/googleCalendar');
const { crearCorreo } = require('../adapters/correo');
const { CORREOS, SMS, recordatorioSms, confirmacionSms, reprogramacionSms, esc } = require('../plantillas');
const { redactar } = require('../utils/redactar');

const URL = 'https://www.hablame.co/api/sms/v5/send';
const KEY = 'clave-super-secreta-123';
const cita = { id: 7, inicio: new Date('2026-11-26T14:00:00Z'), fin: new Date('2026-11-26T15:00:00Z') };
const beneficiario = { nombre: 'Ana Perez', cargo: 'Guía', celular: '573152884079', correo: 'ana@losolivos.co' };
const spa = { nombre: 'Spa Armonía', direccion: 'Av. 0 # 12-34, Cúcuta', email: 'spa@ejemplo.co', enEvento: false };
const appUrl = 'https://mantix.losolivos.co/masajes';
const OK = { statusCode: 200, statusMessage: 'OK', payLoad: { messages: [{ id: 'fb640ade-cc11-48d1-a45f-39578c509373', statusId: 102 }] } };

afterEach(() => nock.cleanAll());
beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());

describe('Háblame (contrato v5)', () => {
  const cliente = () => crearClienteHablame({ url: URL, apiKey: KEY });

  test('POST con la key en la cabecera X-Hablame-Key y { priority, messages: [{ to, text }] }; devuelve el id', async () => {
    const s = nock('https://www.hablame.co', { reqheaders: { 'x-hablame-key': KEY } })
      .post('/api/sms/v5/send', { priority: true, messages: [{ to: '573152884079', text: 'Hola' }] })
      .reply(200, OK);
    expect(await cliente().enviar('573152884079', 'Hola')).toEqual({ id: 'fb640ade-cc11-48d1-a45f-39578c509373' });
    s.done();
  });

  test('la key nunca va en la URL ni en el cuerpo', async () => {
    let urlVista; let cuerpoVisto;
    nock('https://www.hablame.co').post(/.*/).reply(function (uri, body) { urlVista = uri; cuerpoVisto = body; return [200, OK]; });
    await cliente().enviar('573152884079', 'Hola');
    expect(urlVista).toBe('/api/sms/v5/send');
    expect(JSON.stringify(cuerpoVisto)).not.toContain(KEY);
  });

  test.each([[401, false], [403, false], [429, true], [500, true], [302, true]])('HTTP %i → error legible, sin la key, reintentable=%p', async (status, reintentable) => {
    nock('https://www.hablame.co').post('/api/sms/v5/send').reply(status, { statusCode: status, errorCode: 40026, statusMessage: 'Malformed JSON in request body' }, status === 302 ? { Location: 'https://evil.example' } : {});
    let e;
    try { await cliente().enviar('573152884079', 'Hola'); } catch (err) { e = err; }
    expect(e).toMatchObject({ name: 'ErrorHablame', status, reintentable });
    expect(e.message).toMatch(new RegExp(`${status}`));
    expect(JSON.stringify(e)).not.toContain(KEY);
    expect(e.message).not.toContain(KEY);
  });

  test('200 sin payLoad válido (statusCode del cuerpo distinto de 200) → error', async () => {
    nock('https://www.hablame.co').post('/api/sms/v5/send').reply(200, { statusCode: 400, errorCode: 1, statusMessage: 'Sin saldo' });
    await expect(cliente().enviar('573152884079', 'Hola')).rejects.toMatchObject({ name: 'ErrorHablame', reintentable: false });
  });

  test('una redirección no se sigue', async () => {
    const otro = nock('https://evil.example').post(/.*/).reply(200, OK);
    nock('https://www.hablame.co').post('/api/sms/v5/send').reply(307, '', { Location: 'https://evil.example/robar' });
    await expect(cliente().enviar('573152884079', 'Hola')).rejects.toMatchObject({ status: 307 });
    expect(otro.isDone()).toBe(false);
  });

  test('timeout o error de red (como lo lanza axios, con la config adentro) → reintentable y sin filtrar la key', async () => {
    const http = { post: jest.fn(async () => { throw Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED', config: { headers: { 'X-Hablame-Key': KEY } } }); }) };
    const e = await crearClienteHablame({ url: URL, apiKey: KEY, http }).enviar('573152884079', 'Hola').catch((x) => x);
    expect(e).toMatchObject({ name: 'ErrorHablame', reintentable: true, message: 'Háblame no respondió (ECONNABORTED)' });
    expect(JSON.stringify(e) + e.message + e.stack).not.toMatch(/X-Hablame-Key|clave-super/);
  });

  test('el cliente HTTP real se crea con timeout de 10 s y sin seguir redirecciones', () => {
    const axios = require('axios');
    const espia = jest.spyOn(axios, 'create');
    crearClienteHablame({ url: URL, apiKey: KEY });
    expect(espia).toHaveBeenCalledWith({ timeout: 10000, maxRedirects: 0 });
    espia.mockRestore();
  });

  test.each([['3152884079'], ['57315288'], ['+573152884079']])('celular %p mal formado → no se llama a Háblame', async (to) => {
    await expect(cliente().enviar(to, 'Hola')).rejects.toMatchObject({ reintentable: false });
  });

  test.each([[''], ['x'.repeat(161)], ['Tildes áé'], ['Emoji 😀']])('texto %p inválido → no se llama a Háblame', async (texto) => {
    await expect(cliente().enviar('573152884079', texto)).rejects.toMatchObject({ reintentable: false });
  });

  test('solo https y con key', () => {
    expect(() => crearClienteHablame({ url: 'http://www.hablame.co/api/sms/v5/send', apiKey: KEY })).toThrow('HABLAME_URL_INVALIDA');
    expect(() => crearClienteHablame({ url: URL, apiKey: '' })).toThrow('HABLAME_SIN_API_KEY');
  });
});

describe('Google Calendar', () => {
  const clienteFalso = () => ({ events: { insert: jest.fn(async () => ({ data: { id: 'ev1' } })), patch: jest.fn(async () => ({ data: { id: 'ev1' } })), delete: jest.fn(async () => ({})) } });
  const datos = { cita, beneficiario, spa, appUrl };

  test('sin id → insert con zona Bogotá, privado, asistente el empleado y sendUpdates all; sin celular ni cargo', async () => {
    const cliente = clienteFalso();
    const id = await crearCalendario({ calendarId: 'cal@x', cliente }).upsert(datos);
    expect(id).toBe('ev1');
    const [arg] = cliente.events.insert.mock.calls[0];
    expect(arg).toMatchObject({ calendarId: 'cal@x', sendUpdates: 'all' });
    expect(arg.requestBody).toMatchObject({
      summary: 'Masaje — Ana Perez', visibility: 'private', attendees: [{ email: 'ana@losolivos.co' }],
      start: { dateTime: '2026-11-26T14:00:00.000Z', timeZone: 'America/Bogota' }, end: { timeZone: 'America/Bogota' },
    });
    expect(JSON.stringify(arg)).not.toMatch(/573152884079|Guía/);
  });

  test('con id → patch; si el evento ya no existe (404) se crea de nuevo', async () => {
    const cliente = clienteFalso();
    await crearCalendario({ calendarId: 'c', cliente }).upsert({ ...datos, googleEventId: 'ev1' });
    expect(cliente.events.patch).toHaveBeenCalled();
    cliente.events.patch.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { code: 404 }));
    await crearCalendario({ calendarId: 'c', cliente }).upsert({ ...datos, googleEventId: 'borrado' });
    expect(cliente.events.insert).toHaveBeenCalledTimes(1);
  });

  test('eliminar: 404/410 son éxito; otros errores se propagan; sin id no llama', async () => {
    const cliente = clienteFalso();
    const cal = crearCalendario({ calendarId: 'c', cliente });
    await cal.eliminar(null);
    expect(cliente.events.delete).not.toHaveBeenCalled();
    cliente.events.delete.mockRejectedValueOnce({ code: 410 });
    await cal.eliminar('ev1');
    cliente.events.delete.mockRejectedValueOnce({ code: 500, message: 'x' });
    await expect(cal.eliminar('ev1')).rejects.toMatchObject({ code: 500 });
  });

  test('el spa solo es invitado si MSJ_SPA_EN_EVENTO=true; el scope es el mínimo', () => {
    expect(eventoDe({ ...datos, spa: { ...spa, enEvento: true } }).attendees).toEqual([{ email: 'ana@losolivos.co' }, { email: 'spa@ejemplo.co' }]);
    expect(SCOPE).toBe('https://www.googleapis.com/auth/calendar.events');
  });
});

describe('plantillas', () => {
  test('¡Es hoy!: frase exacta, fecha "Jueves / 26 de noviembre", hora "9:00 a. m." y dirección del spa', () => {
    const m = CORREOS.es_hoy({ cita, beneficiario, spa, appUrl });
    expect(m.asunto).toContain('¡Es hoy! ¡Es hoy!');
    expect(m.html).toContain('Jueves<br/>26 de noviembre');
    expect(m.html).toContain('9:00 a. m.');
    expect(m.html).toContain(esc(spa.direccion));
  });

  test('los correos al spa llevan nombre, cargo y celular; los del empleado no llevan el celular', () => {
    for (const t of ['spa_nueva', 'spa_reprogramada', 'spa_cancelada']) {
      const { html } = CORREOS[t]({ cita, antes: new Date('2026-11-25T14:00:00Z'), beneficiario, spa, appUrl });
      expect(html).toContain('Ana Perez');
      expect(html).toContain('Guía');
      expect(html).toContain('573152884079');
    }
    expect(CORREOS.spa_reprogramada({ cita, antes: new Date('2026-11-25T14:00:00Z'), beneficiario, spa, appUrl }).html).toMatch(/miércoles 25 de noviembre[\s\S]*jueves 26 de noviembre/);
    for (const t of ['empleado_confirmacion', 'empleado_cancelacion', 'recordatorio_2d', 'es_hoy']) {
      expect(CORREOS[t]({ cita, beneficiario, spa, appUrl }).html).not.toContain('573152884079');
    }
  });

  test('todo valor interpolado va escapado en todas las plantillas', () => {
    const malo = { nombre: '<img src=x onerror=alert(1)>', cargo: '"><script>alert(1)</script>', celular: '<u>x</u>', correo: 'a@b.co' };
    for (const [tipo, f] of Object.entries(CORREOS)) {
      const m = f({ cita, antes: cita.inicio, beneficiario: malo, spa: { ...spa, nombre: '<svg onload=1>' }, appUrl: 'javascript:alert(1)" x="' });
      expect([tipo, /<img src=x|<script|<svg|<u>/.test(m.html)]).toEqual([tipo, false]);
      // Las únicas imágenes son la cabecera y el pie fijos del spa.
      const imgs = [...m.html.matchAll(/<img src="([^"]+)"/g)].map((x) => x[1]);
      expect([tipo, imgs]).toEqual([tipo, ['https://losolivoscucuta.com/img/head-masaje.jpg', 'https://losolivoscucuta.com/img/foot-masaje.jpg']]);
      expect([tipo, /href="javascript/i.test(m.html)]).toEqual([tipo, false]);
      expect([tipo, /"\s*x="/.test(m.html)]).toEqual([tipo, false]);
    }
  });

  test('correo al empleado con el diseño del spa: tarjeta de cita, frase, recomendaciones, nota y botón', () => {
    const { html, texto } = CORREOS.empleado_confirmacion({ cita, beneficiario, spa, appUrl });
    expect(html).toContain('¡Hola, Ana!');
    expect(html).toContain('Tu sesión de masaje ya está reservada. También recibirás la invitación en tu calendario.');
    expect(html).toMatch(/Fecha:[\s\S]*Jueves<br\/>26 de noviembre[\s\S]*Hora:[\s\S]*9:00 a\. m\.[\s\S]*Lugar:/);
    expect(html).toMatch(/Recomendaciones para tu cita:[\s\S]*Hombres:[\s\S]*Pantaloneta\.[\s\S]*Mujeres:[\s\S]*Traje de baño\./);
    expect(html).toContain('Llega 10 minutos antes de la hora programada.');
    expect(html).toContain(`href="${appUrl}"`);
    expect(html).toContain('Ver o cambiar mi cita');
    expect(html).not.toContain('Tu masaje está agendado</span>'); // sin pastilla de insignia
    expect(texto).toMatch(/Sandalias antideslizantes\./);
  });

  test('un nombre con saltos de línea no altera el asunto (inyección de cabeceras)', () => {
    const m = CORREOS.spa_nueva({ cita, beneficiario: { ...beneficiario, nombre: 'Ana\r\nBcc: x@y.co' }, spa, appUrl });
    expect(m.asunto).not.toMatch(/[\r\n]/);
  });

  test('SMS: ≤ 160 caracteres, sin tildes ni ñ, con fecha corta y hora', () => {
    const s = recordatorioSms({ cita, spa: { nombre: 'Spa Armonía & Ñandú Relax Center Cúcuta Norte' }, appUrl });
    expect(s.length).toBeLessThanOrEqual(160);
    expect(s).toMatch(/^Los Olivos: tu masaje es el jue 26\/11 a las 9:00am/);
    expect(s).not.toMatch(/[^\x20-\x7e]/);
    expect(recordatorioSms({ cita, spa: { nombre: 'Spa' }, appUrl: 'https://x.co/' + 'y'.repeat(200) }).length).toBeLessThanOrEqual(160);
  });
});

test('SMS de confirmación: ≤ 160, sin tildes, con fecha y spa; SMS cubre los dos tipos con canal sms', () => {
  const t = confirmacionSms({ cita, spa: { nombre: 'Spa Armonía & Ñandú Relax Center Cúcuta Norte' }, appUrl });
  expect(t).toMatch(/^Los Olivos: Tu momento de bienestar esta confirmado! Masaje jue 26\/11 9:00am/);
  expect(t.length).toBeLessThanOrEqual(160);
  expect(t).not.toMatch(/[^\x20-\x7e]/);
  expect(confirmacionSms({ cita, spa: { nombre: 'Spa' }, appUrl: 'https://x.co/' + 'y'.repeat(200) }).length).toBeLessThanOrEqual(160);
  expect(Object.keys(SMS).sort()).toEqual(['empleado_confirmacion', 'recordatorio_2d']);
});

test('SMS de reprogramación y elección por `antes`; todos ≤ 160 y GSM-7 con el spa real', () => {
  const real = { cita, spa: { nombre: 'SPA Tatiana Forero' }, appUrl: 'https://losolivoscucuta.com/AgendaPromax' };
  expect(reprogramacionSms(real)).toBe('Los Olivos: Tu cita fue reprogramada! Masaje jue 26/11 9:00am en SPA Tatiana Forero. Te esperamos! Cambios 24h antes: https://losolivoscucuta.com/AgendaPromax');
  expect(SMS.empleado_confirmacion(real)).toBe(confirmacionSms(real));
  expect(SMS.empleado_confirmacion({ ...real, antes: new Date('2026-11-25T14:00:00Z') })).toBe(reprogramacionSms(real));
  for (const t of [confirmacionSms(real), reprogramacionSms(real), recordatorioSms(real)]) {
    expect(t.length).toBeLessThanOrEqual(160);
    expect(t).not.toMatch(/[^\x20-\x7e]/);
    expect(t).toContain('SPA Tatiana Forero'); // con el spa real no se recorta nada
    expect(t).toContain('https://losolivoscucuta.com/AgendaPromax');
  }
  const largo = { cita, spa: { nombre: 'Spa' }, appUrl: 'https://x.co/' + 'y'.repeat(200) };
  expect(reprogramacionSms(largo).length).toBeLessThanOrEqual(160);
});

test('evento: descripción con fecha y año, horario, lugar, recomendaciones y enlace; datos escapados', () => {
  const d = eventoDe({ cita, beneficiario, spa: { ...spa, nombre: 'SPA <b>X</b>' }, appUrl }).description;
  expect(d).toContain('📅 Fecha: Jueves, 26 de noviembre de 2026');
  expect(d).toContain('🕗 Horario: 9:00 a. m. a 10:00 a. m.');
  expect(d).toContain('📍 Lugar: SPA &lt;b&gt;X&lt;/b&gt; – ');
  expect(d).toMatch(/👨 Hombres:\n• Pantaloneta\.\n• Sandalias antideslizantes\.\n• Toalla personal\./);
  expect(d).toMatch(/👩 Mujeres:\n• Traje de baño\./);
  expect(d).toContain(`🔗 ${appUrl}`);
  expect(d).not.toContain(beneficiario.celular);
});

describe('correo', () => {
  test('un destinatario, asunto sin saltos, sin acceso a archivos ni URLs; devuelve messageId', async () => {
    const transporte = { sendMail: jest.fn(async () => ({ messageId: '<abc@x>' })) };
    const c = crearCorreo({ transporte, remitente: 'agenda@losolivos.co' });
    expect(await c.enviar('ana@losolivos.co', { asunto: 'a\r\nb', html: '<p>x</p>', texto: 'x' })).toBe('<abc@x>');
    expect(transporte.sendMail.mock.calls[0][0]).toMatchObject({ to: 'ana@losolivos.co', subject: 'a b', disableFileAccess: true, disableUrlAccess: true });
  });

  test.each([['a@b.co, c@d.co'], ['Ana <a@b.co>'], [''], [['a@b.co']]])('destinatario %p → error sin enviar', async (para) => {
    const transporte = { sendMail: jest.fn() };
    await expect(crearCorreo({ transporte, remitente: 'r@x.co' }).enviar(para, { asunto: 'a', html: '', texto: '' })).rejects.toThrow('CORREO_DESTINATARIO_INVALIDO');
    expect(transporte.sendMail).not.toHaveBeenCalled();
  });
});

describe('redactar', () => {
  test('quita keys, tokens, query strings, claves privadas y celulares; máximo 1000', () => {
    const e = Object.assign(new Error('fallo X-Hablame-Key: abc123 Authorization: Bearer eyJhbGciOi.x.y en https://api.x.co/send?apikey=zzz al 573152884079 -----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----'), { code: 'ECONNRESET' });
    const r = redactar(e);
    expect(r).not.toMatch(/abc123|eyJhbGciOi|apikey=zzz|573152884079|MIIE/);
    expect(r).toMatch(/ECONNRESET/);
    expect(r).toContain('57315****079');
    expect(redactar(new Error('550 recipients rejected: <ana.perez@losolivos.co>'))).toBe('Error | 550 recipients rejected: <***@losolivos.co>');
    expect(redactar(new Error('x'.repeat(5000))).length).toBeLessThanOrEqual(1000);
    expect(redactar(null)).toBeNull();
  });
});
