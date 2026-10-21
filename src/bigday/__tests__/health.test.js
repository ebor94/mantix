// GET /api/bigday/v1/health: límite ligero por IP (60/min) para que no sirva de martillo contra la BD.
const request = require('supertest');
const { servir, cerrarServidores } = require('../testing/servidorPrueba');
const { repoEnMemoria, crearAppPrueba } = require('../testing/ayudas');

const RUTA = '/api/bigday/v1/health';
const config = { hashSalt: 'sal' };

afterEach(cerrarServidores);

describe(`GET ${RUTA}`, () => {
  it('permite 60 peticiones por IP y minuto; la 61.ª responde 429 JSON', async () => {
    const { repo } = repoEnMemoria();
    const app = crearAppPrueba({ repositorio: repo, config });
    for (let i = 0; i < 60; i++) {
      const r = await request(await servir(app)).get(RUTA).set('X-Forwarded-For', '203.0.113.9');
      expect(r.status).toBe(200);
    }
    const r = await request(await servir(app)).get(RUTA).set('X-Forwarded-For', '203.0.113.9');
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/demasiadas/i);
    // otra IP no comparte el cupo
    expect((await request(await servir(app)).get(RUTA).set('X-Forwarded-For', '203.0.113.10')).status).toBe(200);
  });

  it('agrupa IPv6 por /56 (usa claveIp): rotar dentro del bloque no evade el límite', async () => {
    const { repo } = repoEnMemoria();
    const app = crearAppPrueba({ repositorio: repo, config });
    for (let i = 0; i < 60; i++) {
      await request(await servir(app)).get(RUTA).set('X-Forwarded-For', `2001:db8:abcd:1200::${(i + 1).toString(16)}`);
    }
    expect((await request(await servir(app)).get(RUTA).set('X-Forwarded-For', '2001:db8:abcd:12ff::1')).status).toBe(429);
  });
});

describe('cabeceras de reintento visibles por CORS', () => {
  it('añade Retry-After y RateLimit a Access-Control-Expose-Headers si CORS ya la puso', async () => {
    const express = require('express');
    const { crearRouterBigday } = require('../routes');
    const { repo } = repoEnMemoria();
    const app = express();
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Expose-Headers', 'Content-Type,Content-Disposition');
      next();
    });
    app.use('/api/bigday/v1', crearRouterBigday({ repositorio: repo, config }));
    const r = await request(await servir(app)).get(RUTA);
    const expuestas = r.headers['access-control-expose-headers'].split(',').map((s) => s.trim());
    expect(expuestas).toEqual(expect.arrayContaining(['Content-Type', 'Content-Disposition', 'Retry-After', 'RateLimit']));
  });

  it('sin CORS (mismo origen / curl) no inventa la cabecera', async () => {
    const { repo } = repoEnMemoria();
    const r = await request(await servir(crearAppPrueba({ repositorio: repo, config }))).get(RUTA);
    expect(r.headers['access-control-expose-headers']).toBeUndefined();
  });
});
