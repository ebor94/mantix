/**
 * /api/sv/personas detrás del svAreaGuard real. Sin base de datos: el
 * servicio de personas se simula con jest.mock.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../src/sv/services/personas.service', () => ({
  buscarPorTelefono: jest.fn(),
  obtener:           jest.fn(),
  prospectosActivos: jest.fn(),
  historialCompleto: jest.fn(),
  crear:             jest.fn(),
  actualizar:        jest.fn(),
  alcancesDePersona: jest.fn()
}));

const personas = require('../src/sv/services/personas.service');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

// Área 1, grupo 1. rol_nivel como en sv_org_roles (lo usa authorizeLevel).
const ASESOR     = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR', rol_nivel: 4 } };
const SUPERVISOR = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], rol: { rol_codigo: 'SUPERVISOR', rol_nivel: 3 } };
const ADMIN_AREA = { usr_id: 30, usr_area_id: 1, areasExtra: [], rol: { rol_codigo: 'ADMIN_AREA', rol_nivel: 2 } };
const GERENTE    = { usr_id: 2,  usr_area_id: 1, rol: { rol_codigo: 'GERENTE_GENERAL', rol_nivel: 2 } };

// Prospectos de cada persona, como los devolvería alcancesDePersona.
// La persona 999 no existe: no tiene prospectos.
const ALCANCES = {
  1: [{ prosp_id: 100, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 }], // del asesor 10, grupo 1
  2: [{ prosp_id: 200, prosp_asesor_id: 30, prosp_grupo_id: 2, prosp_area_id: 1 }], // otro grupo, misma área
  3: [{ prosp_id: 300, prosp_asesor_id: 40, prosp_grupo_id: 7, prosp_area_id: 3 }]  // otra área
};

const PERSONA = { persona_id: 1, persona_nombre: 'Ana' };
const SIN_RELACION = { success: false, error: 'FORBIDDEN', message: 'Sin prospectos de esta persona en tu alcance' };

// supertest 6 escucha en '::' y conecta a 127.0.0.1. En macOS ese puerto puede
// estar tomado en 127.0.0.1 por otro proceso (editores, agentes) y la petición
// le llega a él: 404 o ECONNRESET intermitentes. Por eso el servidor escucha
// explícitamente en 127.0.0.1 y se cierra al terminar cada prueba.
const servidores = [];

async function app(user) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = user; next(); });
  a.use(svAreaGuard);
  a.use('/api/sv/personas', require('../src/sv/routes/personas.routes'));
  // eslint-disable-next-line no-unused-vars
  a.use((err, req, res, next) => res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }));
  const server = a.listen(0, '127.0.0.1');
  servidores.push(server);
  await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  return server;
}

afterEach(async () => {
  await Promise.all(servidores.splice(0).map(s => new Promise(resolve => s.close(resolve))));
});

beforeEach(() => {
  jest.clearAllMocks();
  personas.alcancesDePersona.mockImplementation(async (id) => ALCANCES[id] || []);
  personas.obtener.mockImplementation(async (id) => (id === 999 ? null : { ...PERSONA, persona_id: id }));
  personas.prospectosActivos.mockResolvedValue([]);
  personas.historialCompleto.mockImplementation(async (id) => (
    id === 999 ? null : { persona: { persona_id: id }, prospectos: [], gestiones: [] }
  ));
  personas.actualizar.mockImplementation(async (id, body) => ({ persona_id: id, ...body }));
  personas.buscarPorTelefono.mockResolvedValue(PERSONA);
  personas.crear.mockResolvedValue(PERSONA);
});

describe('GET /:id y GET /:id/prospectos-activos exigen relación', () => {
  // [nombre, método, ruta, cuerpo, función del servicio que lee o escribe]
  const RUTAS = [
    ['GET /:id',                     'get', (id) => `/api/sv/personas/${id}`,                     undefined,                       'obtener'],
    ['GET /:id/prospectos-activos',  'get', (id) => `/api/sv/personas/${id}/prospectos-activos`,  undefined,                       'prospectosActivos']
  ];

  describe.each(RUTAS)('%s', (_, metodo, ruta, cuerpo, servicio) => {
    const llamar = async (user, id) => {
      const r = request(await app(user))[metodo](ruta(id));
      return cuerpo ? r.send(cuerpo) : r;
    };

    test('asesor con un prospecto propio de la persona → 200', async () => {
      const r = await llamar(ASESOR, 1);
      expect(r.status).toBe(200);
      expect(personas.alcancesDePersona).toHaveBeenCalledWith(1);
      expect(personas[servicio]).toHaveBeenCalledTimes(1);
      expect(personas[servicio].mock.calls[0][0]).toBe(1);
    });

    test('asesor sin prospectos propios de la persona → 403 y no lee ni escribe', async () => {
      const r = await llamar(ASESOR, 2);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(SIN_RELACION);
      expect(personas[servicio]).not.toHaveBeenCalled();
    });

    test('supervisor con un prospecto de la persona en su grupo → 200', async () => {
      const r = await llamar(SUPERVISOR, 1);
      expect(r.status).toBe(200);
    });

    test('supervisor con prospectos de la persona solo en otro grupo → 403', async () => {
      const r = await llamar(SUPERVISOR, 2);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(SIN_RELACION);
      expect(personas[servicio]).not.toHaveBeenCalled();
    });

    test('GERENTE_GENERAL → 200 sin consultar la relación', async () => {
      const r = await llamar(GERENTE, 3);
      expect(r.status).toBe(200);
      expect(personas.alcancesDePersona).not.toHaveBeenCalled();
    });

    test('persona inexistente sin cross-área → 403, no 404', async () => {
      const r = await llamar(SUPERVISOR, 999);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(SIN_RELACION);
    });

    test('id no numérico → 404 sin consultar', async () => {
      const r = await llamar(SUPERVISOR, 'abc');
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ success: false, error: 'NOT_FOUND', message: 'Persona no encontrada' });
      expect(personas.alcancesDePersona).not.toHaveBeenCalled();
      expect(personas[servicio]).not.toHaveBeenCalled();
    });

    test('error al consultar la relación → 500 vía next(e)', async () => {
      personas.alcancesDePersona.mockRejectedValue(new Error('ECONNRESET'));
      const r = await llamar(ASESOR, 1);
      expect(r.status).toBe(500);
      expect(personas[servicio]).not.toHaveBeenCalled();
    });

    test('error del servicio de datos → 500 vía next(e)', async () => {
      personas[servicio].mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
      const r = await llamar(ASESOR, 1);
      expect(r.status).toBe(500);
    });
  });

  test('GET /:id: GERENTE_GENERAL y persona inexistente → 404', async () => {
    const r = await request(await app(GERENTE)).get('/api/sv/personas/999');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: 'NOT_FOUND', message: 'Persona no encontrada' });
  });

});

describe('PUT /:id: supervisión con relación', () => {
  const url = (id) => `/api/sv/personas/${id}`;
  const CUERPO = { persona_nombre: 'Ana María' };
  const NIVEL = { success: false, error: 'FORBIDDEN', message: 'Nivel insuficiente (requerido: <= 3)' };

  test('asesor, aun con un prospecto propio de la persona → 403 de nivel', async () => {
    const r = await request(await app(ASESOR)).put(url(1)).send(CUERPO);
    expect(r.status).toBe(403);
    expect(r.body).toEqual(NIVEL);
    expect(personas.alcancesDePersona).not.toHaveBeenCalled();
    expect(personas.actualizar).not.toHaveBeenCalled();
  });

  test('asesor con cuerpo inválido → 403 de nivel, no 422', async () => {
    const r = await request(await app(ASESOR)).put(url(1)).send({});
    expect(r.status).toBe(403);
    expect(r.body).toEqual(NIVEL);
  });

  test('supervisor con un prospecto de la persona en su grupo → 200', async () => {
    const r = await request(await app(SUPERVISOR)).put(url(1)).send(CUERPO);
    expect(r.status).toBe(200);
    expect(personas.actualizar).toHaveBeenCalledWith(1, CUERPO);
  });

  test('supervisor con prospectos de la persona solo en otro grupo → 403', async () => {
    const r = await request(await app(SUPERVISOR)).put(url(2)).send(CUERPO);
    expect(r.status).toBe(403);
    expect(r.body).toEqual(SIN_RELACION);
    expect(personas.actualizar).not.toHaveBeenCalled();
  });

  test('ADMIN_AREA con un prospecto de la persona en su área → 200', async () => {
    const r = await request(await app(ADMIN_AREA)).put(url(2)).send(CUERPO);
    expect(r.status).toBe(200);
  });

  test('GERENTE_GENERAL → 200 sin consultar la relación', async () => {
    const r = await request(await app(GERENTE)).put(url(3)).send(CUERPO);
    expect(r.status).toBe(200);
    expect(personas.alcancesDePersona).not.toHaveBeenCalled();
  });

  test('persona inexistente sin cross-área → 403, no 404', async () => {
    const r = await request(await app(SUPERVISOR)).put(url(999)).send(CUERPO);
    expect(r.status).toBe(403);
    expect(r.body).toEqual(SIN_RELACION);
  });

  test('id no numérico → 404 sin consultar', async () => {
    const r = await request(await app(SUPERVISOR)).put(url('abc')).send(CUERPO);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: 'NOT_FOUND', message: 'Persona no encontrada' });
    expect(personas.alcancesDePersona).not.toHaveBeenCalled();
    expect(personas.actualizar).not.toHaveBeenCalled();
  });

  test('error al consultar la relación → 500 vía next(e)', async () => {
    personas.alcancesDePersona.mockRejectedValue(new Error('ECONNRESET'));
    const r = await request(await app(SUPERVISOR)).put(url(1)).send(CUERPO);
    expect(r.status).toBe(500);
    expect(personas.actualizar).not.toHaveBeenCalled();
  });

  test('error del servicio de datos → 500 vía next(e)', async () => {
    personas.actualizar.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(await app(SUPERVISOR)).put(url(1)).send(CUERPO);
    expect(r.status).toBe(500);
  });

  test('sin relación → 403 antes de validar el cuerpo', async () => {
    const r = await request(await app(SUPERVISOR)).put(url(2)).send({});
    expect(r.status).toBe(403);
    expect(r.body).toEqual(SIN_RELACION);
  });

  test('con teléfono duplicado → 409 con la persona y sus prospectos', async () => {
    const e = Object.assign(new Error('DUPLICATE_PHONE'), {
      code: 'DUPLICATE_PHONE', persona: { persona_id: 5 }, prospectos_activos: [{ prosp_id: 500 }]
    });
    personas.actualizar.mockRejectedValue(e);
    const r = await request(await app(SUPERVISOR)).put(url(1)).send({ persona_telefono_principal: '3001234567' });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      success: false, error: 'DUPLICATE_PHONE', message: 'Teléfono ya existe',
      errors: { persona: { persona_id: 5 }, prospectos_activos: [{ prosp_id: 500 }] }
    });
  });

  test('persona borrada entre la verificación y la escritura → 404', async () => {
    personas.actualizar.mockRejectedValue(Object.assign(new Error('Persona no encontrada'), { code: 'NOT_FOUND' }));
    const r = await request(await app(GERENTE)).put(url(1)).send(CUERPO);
    expect(r.status).toBe(404);
  });
});

describe('GET /:id/historial-completo: supervisión con relación', () => {
  const url = (id) => `/api/sv/personas/${id}/historial-completo`;
  const NIVEL = { success: false, error: 'FORBIDDEN', message: 'Nivel insuficiente (requerido: <= 3)' };

  test('asesor, aun con un prospecto propio → 403 sin consultar la base', async () => {
    const r = await request(await app(ASESOR)).get(url(1));
    expect(r.status).toBe(403);
    expect(r.body).toEqual(NIVEL);
    expect(personas.alcancesDePersona).not.toHaveBeenCalled();
    expect(personas.historialCompleto).not.toHaveBeenCalled();
  });

  test('rol sin rol_nivel → 403 (falla cerrado)', async () => {
    const sinNivel = { ...SUPERVISOR, rol: { rol_codigo: 'SUPERVISOR' } };
    const r = await request(await app(sinNivel)).get(url(1));
    expect(r.status).toBe(403);
    expect(r.body).toEqual(NIVEL);
  });

  test('supervisor con un prospecto de la persona en su grupo → 200 con la vista completa', async () => {
    const r = await request(await app(SUPERVISOR)).get(url(1));
    expect(r.status).toBe(200);
    expect(personas.historialCompleto).toHaveBeenCalledWith(1);
    expect(r.body).toEqual({ success: true, data: { persona: { persona_id: 1 }, prospectos: [], gestiones: [] } });
  });

  test('supervisor con prospectos de la persona solo en otro grupo → 403', async () => {
    const r = await request(await app(SUPERVISOR)).get(url(2));
    expect(r.status).toBe(403);
    expect(r.body).toEqual(SIN_RELACION);
    expect(personas.historialCompleto).not.toHaveBeenCalled();
  });

  test('ADMIN_AREA con un prospecto de la persona en su área → 200', async () => {
    const r = await request(await app(ADMIN_AREA)).get(url(2));
    expect(r.status).toBe(200);
  });

  test('ADMIN_AREA con prospectos de la persona solo en otra área → 403', async () => {
    const r = await request(await app(ADMIN_AREA)).get(url(3));
    expect(r.status).toBe(403);
    expect(r.body).toEqual(SIN_RELACION);
  });

  test('GERENTE_GENERAL → 200 sin consultar la relación', async () => {
    const r = await request(await app(GERENTE)).get(url(3));
    expect(r.status).toBe(200);
    expect(personas.alcancesDePersona).not.toHaveBeenCalled();
  });

  test('GERENTE_GENERAL y persona inexistente → 404', async () => {
    const r = await request(await app(GERENTE)).get(url(999));
    expect(r.status).toBe(404);
  });

  test('error del servicio → 500 vía next(e)', async () => {
    personas.historialCompleto.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(await app(SUPERVISOR)).get(url(1));
    expect(r.status).toBe(500);
  });
});

describe('buscar y create: anti-duplicado del alta, sin exigir relación', () => {
  test('buscar devuelve persona y prospectos activos a un asesor sin relación', async () => {
    personas.prospectosActivos.mockResolvedValue([{ prosp_id: 200 }]);
    const r = await request(await app(ASESOR)).get('/api/sv/personas/buscar').query({ telefono: '3001234567' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ persona: PERSONA, prospectos_activos: [{ prosp_id: 200 }] });
    expect(personas.prospectosActivos).toHaveBeenCalledWith(1);
    expect(personas.alcancesDePersona).not.toHaveBeenCalled();
  });

  test('buscar sin coincidencia → 404', async () => {
    personas.buscarPorTelefono.mockResolvedValue(null);
    const r = await request(await app(ASESOR)).get('/api/sv/personas/buscar').query({ telefono: '3001234567' });
    expect(r.status).toBe(404);
  });

  test('buscar: error del servicio → 500 vía next(e)', async () => {
    personas.buscarPorTelefono.mockRejectedValue(new Error('ECONNRESET'));
    const r = await request(await app(ASESOR)).get('/api/sv/personas/buscar').query({ telefono: '3001234567' });
    expect(r.status).toBe(500);
  });

  const NUEVA = { persona_nombre: 'Ana', persona_telefono_principal: '3001234567' };

  test('create → 201', async () => {
    const r = await request(await app(ASESOR)).post('/api/sv/personas').send(NUEVA);
    expect(r.status).toBe(201);
  });

  test('create con teléfono duplicado → 409', async () => {
    personas.crear.mockRejectedValue(Object.assign(new Error('DUPLICATE_PHONE'), {
      code: 'DUPLICATE_PHONE', persona: PERSONA, prospectos_activos: []
    }));
    const r = await request(await app(ASESOR)).post('/api/sv/personas').send(NUEVA);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('DUPLICATE_PHONE');
  });

  test('create: error inesperado → 500 vía next(e)', async () => {
    personas.crear.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(await app(ASESOR)).post('/api/sv/personas').send(NUEVA);
    expect(r.status).toBe(500);
  });
});
