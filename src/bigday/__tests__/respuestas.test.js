const { createHash, randomUUID } = require('node:crypto');
const request = require('supertest');
const { repoEnMemoria, crearAppPrueba } = require('../testing/ayudas');

const SAL = 'sal-de-prueba';
const IP = '203.0.113.7';
const UA = 'Mozilla/5.0 (PruebaUA) Navegador/1.0';
const config = { hashSalt: SAL };
const RUTA = '/api/bigday/v1/respuestas';

const sha = (v) => createHash('sha256').update(v + SAL).digest('hex');

const valida = () => ({
  uuid: '7d9f4c2e-3b1a-4c5d-8e6f-0a1b2c3d4e5f',
  p1: 'B',
  p2: 'ambas',
  p3: 'parque_vida',
  p4: 'diversidad',
  p5: 'C',
  p6: 9,
  p7: 'Me encantó ver tantas aves en el parque.',
  origen: 'qr-entrada',
  duracion_seg: 45,
});

describe(`POST ${RUTA}`, () => {
  let filas;
  let app;

  beforeEach(() => {
    const m = repoEnMemoria();
    filas = m.filas;
    app = crearAppPrueba({ repositorio: m.repo, config });
  });

  const enviar = (cuerpo) => request(app).post(RUTA).set('User-Agent', UA).send(cuerpo);

  it('responde 201 con una respuesta válida y guarda códigos', async () => {
    const res = await enviar(valida());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    const fila = filas.get(valida().uuid);
    expect(fila).toMatchObject({
      uuid: valida().uuid,
      p1: 'B',
      p2: 'ambas',
      p3: 'parque_vida',
      p3_otro: null,
      p4: 'diversidad',
      p4_otro: null,
      p5: 'C',
      p6: 9,
      origen: 'qr-entrada',
      duracion_seg: 45,
    });
    expect(JSON.stringify(fila)).not.toContain('Un Parque de Vida con biodiversidad');
    expect('website' in fila).toBe(false);
  });

  it('guarda NULL en origen y *_otro vacíos y conserva el texto de "Otro"', async () => {
    const res = await enviar({ ...valida(), origen: '', p3: 'otro', p3_otro: '  Me sentí en paz  ' });
    expect(res.status).toBe(201);
    const fila = filas.get(valida().uuid);
    expect(fila.origen).toBeNull();
    expect(fila.p3).toBe('otro');
    expect(fila.p3_otro).toBe('Me sentí en paz');
    expect(fila.p4_otro).toBeNull();
  });

  it('responde 200 sin duplicar si se reenvía el mismo uuid', async () => {
    await enviar(valida());
    const res = await enviar(valida());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, duplicada: true });
    expect(filas.size).toBe(1);
  });

  it('responde 400 con errores de zod legibles', async () => {
    const res = await enviar({ ...valida(), p1: 'Z', p6: 11 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Datos inválidos.');
    expect(res.body.detalles).toEqual(
      expect.arrayContaining([
        { campo: 'p1', mensaje: 'Opción inválida' },
        { campo: 'p6', mensaje: 'Máximo 10' },
      ]),
    );
    expect(filas.size).toBe(0);
  });

  it('responde 400 si el cuerpo viene vacío', async () => {
    const res = await enviar({});
    expect(res.status).toBe(400);
  });

  describe('anti-bot', () => {
    const generico = { error: 'No se pudo registrar la respuesta.' };

    it('rechaza duracion_seg < 8 con mensaje genérico', async () => {
      const res = await enviar({ ...valida(), duracion_seg: 7 });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(generico);
      expect(filas.size).toBe(0);
    });

    it('rechaza si falta duracion_seg o no es número', async () => {
      const sin = { ...valida() };
      delete sin.duracion_seg;
      expect((await enviar(sin)).body).toEqual(generico);
      const res = await enviar({ ...valida(), duracion_seg: '45' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(generico);
    });

    it('acepta duracion_seg = 8', async () => {
      const res = await enviar({ ...valida(), duracion_seg: 8 });
      expect(res.status).toBe(201);
    });

    it('rechaza honeypot lleno con mensaje genérico, sin revelar la regla', async () => {
      const res = await enviar({ ...valida(), website: 'http://spam.example' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(generico);
      expect(JSON.stringify(res.body)).not.toMatch(/website|honeypot|duracion/i);
      expect(filas.size).toBe(0);
    });

    it.each([[123], [{}], [['x']], [true], [0]])('rechaza honeypot con valor no vacío %j (cualquier tipo)', async (valor) => {
      const res = await enviar({ ...valida(), website: valor });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(generico);
      expect(filas.size).toBe(0);
    });

    it('acepta honeypot vacío y no lo guarda', async () => {
      const res = await enviar({ ...valida(), website: '' });
      expect(res.status).toBe(201);
      expect('website' in filas.get(valida().uuid)).toBe(false);
    });
  });

  describe('privacidad', () => {
    it('guarda SHA-256(ip + sal) y nunca la IP ni el user-agent en claro', async () => {
      await request(app).post(RUTA).set('User-Agent', UA).set('X-Forwarded-For', IP).send(valida());
      const fila = filas.get(valida().uuid);
      expect(fila.ip_hash).toBe(sha(IP));
      expect(fila.ua_hash).toBe(sha(UA));
      const serializada = JSON.stringify(fila);
      expect(serializada).not.toContain(IP);
      expect(serializada).not.toContain('PruebaUA');
    });
  });

  describe('límite de frecuencia', () => {
    it('responde 429 tras 10 peticiones por IP en la ventana', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await enviar({ ...valida(), uuid: randomUUID() });
        expect(res.status).toBe(201);
      }
      const res = await enviar({ ...valida(), uuid: randomUUID() });
      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/demasiadas/i);
      expect(res.headers.ratelimit).toBeDefined();
    });

    it('la clave es IP + user-agent: cada UA distinto desde la misma IP tiene su propio cupo de 10', async () => {
      const desde = (ua) => request(app).post(RUTA).set('User-Agent', ua).set('X-Forwarded-For', IP);
      for (let i = 0; i < 10; i++) {
        expect((await desde('UA-uno').send({ ...valida(), uuid: randomUUID() })).status).toBe(201);
      }
      expect((await desde('UA-uno').send({ ...valida(), uuid: randomUUID() })).status).toBe(429);
      for (let i = 0; i < 10; i++) {
        expect((await desde('UA-dos').send({ ...valida(), uuid: randomUUID() })).status).toBe(201);
      }
      expect((await desde('UA-dos').send({ ...valida(), uuid: randomUUID() })).status).toBe(429);
    });

    it('cada router nuevo arranca con el contador en cero', async () => {
      const otra = crearAppPrueba({ repositorio: repoEnMemoria().repo, config });
      const res = await request(otra).post(RUTA).set('User-Agent', UA).send(valida());
      expect(res.status).toBe(201);
    });
  });

  describe('límites y errores', () => {
    it('rechaza cuerpos mayores de 10 KB con 413 en JSON', async () => {
      const res = await enviar({ ...valida(), p7: 'x'.repeat(11 * 1024) });
      expect(res.status).toBe(413);
      expect(res.body).toEqual({ error: 'La solicitud es demasiado grande.' });
    });

    it('rechaza cuerpos urlencoded mayores de 10 KB con 413 sin llegar al parser global', async () => {
      const res = await request(app).post(RUTA).type('form').send('p7=' + 'x'.repeat(11 * 1024));
      expect(res.status).toBe(413);
      expect(res.body).toEqual({ error: 'La solicitud es demasiado grande.' });
    });

    it('rechaza JSON mal formado con 400 en JSON', async () => {
      const res = await request(app).post(RUTA).set('Content-Type', 'application/json').send('{"uuid": ');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'JSON inválido.' });
    });

    it('responde 500 genérico si el repositorio falla y no filtra detalles', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const repoRoto = {
        guardar: async () => {
          throw new Error('ECONNREFUSED 10.0.0.5');
        },
        ping: async () => {},
      };
      const appRota = crearAppPrueba({ repositorio: repoRoto, config });
      const res = await request(appRota).post(RUTA).set('User-Agent', UA).set('X-Forwarded-For', IP).send(valida());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'No se pudo guardar la respuesta. Inténtalo de nuevo.' });
      const registrado = JSON.stringify(error.mock.calls);
      expect(registrado).not.toContain(valida().p7);
      expect(registrado).not.toContain(IP);
      expect(registrado).not.toContain('PruebaUA');
      error.mockRestore();
    });
  });
});

describe('GET /api/bigday/v1/health', () => {
  afterEach(() => jest.restoreAllMocks());

  it('responde 200 si la BD responde al ping', async () => {
    const app = crearAppPrueba({ repositorio: repoEnMemoria().repo, config });
    const res = await request(app).get('/api/bigday/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok', bd: 'ok' });
  });

  it('responde 503 si el ping a la BD falla', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const repo = {
      guardar: async () => 'creada',
      ping: async () => {
        throw new Error('sin conexión');
      },
    };
    const res = await request(crearAppPrueba({ repositorio: repo, config })).get('/api/bigday/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ estado: 'error', bd: 'error' });
  });
});
