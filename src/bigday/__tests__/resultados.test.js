const request = require('supertest');
const { servir, cerrarServidores } = require('../testing/servidorPrueba');
const { repoEnMemoria, crearAppPrueba } = require('../testing/ayudas');
const { construirCsv, escaparCampo, ENCABEZADOS } = require('../services/csv');

// Servidores ligados a 127.0.0.1 (ver testing/servidorPrueba.js): se cierran tras cada prueba.
afterEach(cerrarServidores);

const TOKEN = 'token-de-prueba-largo-y-aleatorio';
const config = { hashSalt: 'sal', resultsToken: TOKEN };
const JSON_URL = '/api/bigday/v1/resultados';
const CSV_URL = '/api/bigday/v1/resultados.csv';
const auth = (t = TOKEN) => ({ Authorization: `Bearer ${t}` });

const fila = (extra = {}) => ({
  p1: 'B', p2: 'cementerio', p3: 'parque_vida', p3_otro: null, p4: 'diversidad', p4_otro: null,
  p5: 'C', p6: 9, p7: 'Me encantó ver tantas aves.', origen: 'qr-entrada', duracion_seg: 45,
  created_at: new Date('2026-10-17T15:30:00.000Z'),
  ...extra,
});

function appConFilas(filas, cfg = config) {
  const { repo } = repoEnMemoria();
  repo.listar = async () => filas;
  return crearAppPrueba({ repositorio: repo, config: cfg });
}

describe(`GET ${JSON_URL}`, () => {
  it('sin token o con token incorrecto responde 401 con el mismo mensaje', async () => {
    const app = appConFilas([fila()]);
    const sin = await request(await servir(app)).get(JSON_URL);
    const mal = await request(await servir(app)).get(JSON_URL).set(auth('otro-token'));
    const malEsquema = await request(await servir(app)).get(JSON_URL).set('Authorization', `Basic ${TOKEN}`);
    const corto = await request(await servir(app)).get(JSON_URL).set(auth('x'));
    for (const r of [sin, mal, malEsquema, corto]) {
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: 'No autorizado.' });
    }
  });

  it('con token correcto devuelve total, distribucion, nps, matrizP2P3 y ultimasFrases', async () => {
    const filas = [fila({ p6: 10 }), fila({ p6: 8, p2: 'ambas', p3: 'otro', p3_otro: 'Un santuario' }), fila({ p6: 3 })];
    const res = await request(await servir(appConFilas(filas))).get(JSON_URL).set(auth());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['distribucion', 'matrizP2P3', 'nps', 'total', 'ultimasFrases']);
    expect(res.body.total).toBe(3);
    expect(res.body.nps).toMatchObject({ promotores: 1, pasivos: 1, detractores: 1, nps: 0 });
    expect(res.body.distribucion.p6).toHaveLength(10);
    expect(res.body.distribucion.p2[0]).toEqual({ codigo: 'cementerio', label: 'Un parque cementerio.', total: 2 });
    expect(res.body.matrizP2P3).toHaveLength(20);
    expect(res.body.ultimasFrases).toHaveLength(3);
    expect(res.body.ultimasFrases[0]).toHaveProperty('fecha');
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('nunca expone hashes ni identificadores aunque el repositorio los devolviera', async () => {
    const sucia = fila({ ip_hash: 'a'.repeat(64), ua_hash: 'b'.repeat(64), uuid: 'uuid-secreto' });
    const res = await request(await servir(appConFilas([sucia]))).get(JSON_URL).set(auth());
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain('a'.repeat(64));
    expect(texto).not.toContain('b'.repeat(64));
    expect(texto).not.toContain('uuid-secreto');
  });

  it('sin respuestas devuelve ceros y nps null', async () => {
    const res = await request(await servir(appConFilas([]))).get(JSON_URL).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.nps.nps).toBeNull();
    expect(res.body.ultimasFrases).toEqual([]);
  });

  it('si falla el repositorio responde 500 genérico y registra solo el mensaje', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { repo } = repoEnMemoria();
    repo.listar = async () => { throw new Error('boom mysql'); };
    const res = await request(await servir(crearAppPrueba({ repositorio: repo, config }))).get(JSON_URL).set(auth());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'No se pudieron obtener los resultados.' });
    expect(spy).toHaveBeenCalledWith(expect.any(String), 'boom mysql');
    spy.mockRestore();
  });
});

describe('errores inesperados en los handlers', () => {
  it.each([JSON_URL, CSV_URL])('un fallo al procesar las filas en %s → 500 genérico, sin rechazo sin manejar', async (url) => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // created_at inválido: las estadísticas / el CSV lanzan RangeError al formatear la fecha
    const res = await request(await servir(appConFilas([fila({ created_at: 'no-es-fecha' })]))).get(url).set(auth());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'No se pudieron obtener los resultados.' });
    expect(spy).toHaveBeenCalledWith(expect.any(String), expect.any(String));
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    spy.mockRestore();
  });
});

describe('token de resultados no configurado', () => {
  it.each([undefined, null, '', '   '])('resultsToken=%p → 503 genérico, aunque se envíe un token vacío', async (valor) => {
    const app = appConFilas([fila()], { hashSalt: 'sal', resultsToken: valor });
    for (const url of [JSON_URL, CSV_URL]) {
      for (const cabecera of [{}, { Authorization: 'Bearer ' }, { Authorization: 'Bearer' }]) {
        const res = await request(await servir(app)).get(url).set(cabecera);
        expect(res.status).toBe(503);
        expect(JSON.stringify(res.body)).not.toMatch(/BIGDAY|TOKEN/);
        expect(res.body.error).toMatch(/no están disponibles/i);
      }
    }
  });

  it('el POST y el health siguen funcionando sin token de resultados', async () => {
    const { repo } = repoEnMemoria();
    const app = crearAppPrueba({ repositorio: repo, config: { hashSalt: 'sal' } });
    expect((await request(await servir(app)).get('/api/bigday/v1/health')).status).toBe(200);
  });
});

describe('limitador de resultados', () => {
  it('30 peticiones por IP cada 10 min; la 31 responde 429 en español (también con token incorrecto)', async () => {
    const app = appConFilas([]);
    for (let i = 0; i < 30; i++) {
      const r = await request(await servir(app)).get(JSON_URL).set(auth('incorrecto')).set('X-Forwarded-For', '198.51.100.9');
      expect(r.status).toBe(401);
    }
    const r = await request(await servir(app)).get(JSON_URL).set(auth()).set('X-Forwarded-For', '198.51.100.9');
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' });
    // otra IP no se ve afectada
    const otra = await request(await servir(app)).get(JSON_URL).set(auth()).set('X-Forwarded-For', '198.51.100.10');
    expect(otra.status).toBe(200);
  });

  it('el limitador es nuevo por cada fábrica (no comparte estado entre apps)', async () => {
    const a = appConFilas([]);
    for (let i = 0; i < 30; i++) await request(await servir(a)).get(JSON_URL).set(auth('x')).set('X-Forwarded-For', '198.51.100.20');
    const b = appConFilas([]);
    const r = await request(await servir(b)).get(JSON_URL).set(auth()).set('X-Forwarded-For', '198.51.100.20');
    expect(r.status).toBe(200);
  });

  it('el límite es solo por IP: cambiar el user-agent no reinicia el cupo', async () => {
    const app = appConFilas([]);
    for (let i = 0; i < 30; i++) {
      await request(await servir(app)).get(JSON_URL).set(auth('x')).set('User-Agent', `ua-${i}`).set('X-Forwarded-For', '198.51.100.30');
    }
    const r = await request(await servir(app)).get(JSON_URL).set(auth()).set('User-Agent', 'otro-ua').set('X-Forwarded-For', '198.51.100.30');
    expect(r.status).toBe(429);
  });
});

describe(`GET ${CSV_URL}`, () => {
  const get = async (filas) => request(await servir(appConFilas(filas))).get(CSV_URL).set(auth()).buffer(true)
    .parse((res, cb) => { const partes = []; res.on('data', (d) => partes.push(d)); res.on('end', () => cb(null, Buffer.concat(partes))); });

  it('exige token (401 igual que el JSON)', async () => {
    const r = await request(await servir(appConFilas([fila()]))).get(CSV_URL);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'No autorizado.' });
  });

  it('cabeceras HTTP: text/csv utf-8 y descarga con nombre fijo', async () => {
    const res = await get([fila()]);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="bigday-respuestas.csv"');
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('empieza con BOM UTF-8, usa CRLF y los encabezados legibles en orden', async () => {
    const res = await get([fila()]);
    const bytes = res.body;
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const texto = bytes.toString('utf8');
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    const lineas = texto.slice(1).split('\r\n');
    expect(lineas[0]).toBe(
      'Fecha,P1 Conocimiento previo,P2 Percepción antes,P3 Percepción después,P3 Otro,'
      + 'P4 Lo que más llamó la atención,P4 Otro,P5 Aprendizaje,P6 Recomendación (1-10),P7 Frase,Origen,Duración (s)',
    );
    expect(lineas[0].split(',')).toEqual(ENCABEZADOS);
    expect(lineas[lineas.length - 1]).toBe(''); // termina en CRLF
    expect(texto).not.toMatch(/(^|[^\r])\n/); // sin LF sueltos
  });

  it('usa textos legibles (labelFor) en lugar de códigos y fechas ISO', async () => {
    const res = await get([fila()]);
    const linea = res.body.toString('utf8').slice(1).split('\r\n')[1];
    expect(linea).toBe(
      '2026-10-17T15:30:00.000Z,'
      + '"Sabía que había aves y otros animales, pero desconocía la diversidad de especies.",'
      + 'Un parque cementerio.,Un Parque de Vida con biodiversidad.,,'
      + 'La diversidad de aves y otras especies presentes.,,'
      + 'Comprendí mejor la importancia del registro científico y la conservación de la biodiversidad.,'
      + '9,Me encantó ver tantas aves.,qr-entrada,45',
    );
  });

  it('escapa coma, comilla y salto de línea en P7 (RFC 4180)', async () => {
    const res = await get([
      fila({ p7: 'Aves, árboles y "vida"\ny más' }),
    ]);
    const texto = res.body.toString('utf8');
    expect(texto).toContain('"Aves, árboles y ""vida""\ny más"');
  });

  it('protege contra inyección de fórmulas en texto libre (P3/P4 otro, P7, origen)', async () => {
    const res = await get([
      fila({ p3: 'otro', p3_otro: '=HYPERLINK("http://x")', p4: 'otro', p4_otro: '+1+1', p7: '@SUMA(A1)', origen: '-cmd' }),
    ]);
    const texto = res.body.toString('utf8');
    expect(texto).toContain('"\'=HYPERLINK(""http://x"")"');
    expect(texto).toContain(",'+1+1,");
    expect(texto).toContain(",'@SUMA(A1),");
    expect(texto).toContain(",'-cmd,");
  });

  it('nunca incluye ip_hash ni ua_hash ni uuid, aunque el repositorio los devolviera', async () => {
    const res = await get([fila({ ip_hash: 'a'.repeat(64), ua_hash: 'b'.repeat(64), uuid: 'uuid-secreto', id: 77 })]);
    const texto = res.body.toString('utf8');
    expect(texto).not.toContain('a'.repeat(64));
    expect(texto).not.toContain('b'.repeat(64));
    expect(texto).not.toContain('uuid-secreto');
    expect(texto).not.toMatch(/ip_hash|ua_hash/i);
  });

  it('sin respuestas devuelve solo el encabezado', async () => {
    const res = await get([]);
    expect(res.body.toString('utf8')).toBe(`﻿${ENCABEZADOS.join(',')}\r\n`);
  });
});

describe('construirCsv / escaparCampo (unidad)', () => {
  it('escaparCampo cita solo cuando hace falta', () => {
    expect(escaparCampo('simple')).toBe('simple');
    expect(escaparCampo('a,b')).toBe('"a,b"');
    expect(escaparCampo('di "hola"')).toBe('"di ""hola"""');
    expect(escaparCampo('l1\nl2')).toBe('"l1\nl2"');
    expect(escaparCampo('l1\r\nl2')).toBe('"l1\r\nl2"');
    expect(escaparCampo(null)).toBe('');
    expect(escaparCampo(undefined)).toBe('');
    expect(escaparCampo(7)).toBe('7');
  });

  it.each(['=1+1', '+1', '-1', '@x', '\tx', '\rx'])('prefija con apóstrofo el texto libre %j', (v) => {
    const csv = construirCsv([fila({ p7: v })]);
    const campo = csv.slice(1).split('\r\n')[1];
    expect(campo).toContain(escaparCampo(`'${v}`));
  });

  it('no altera texto libre normal ni números', () => {
    const csv = construirCsv([fila({ p7: 'Texto - con guion', p6: 10 })]);
    expect(csv).toContain(',10,Texto - con guion,');
  });
});
