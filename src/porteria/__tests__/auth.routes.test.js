const request = require('supertest');
const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe, CONFIG } = require('../testing/appPrueba');
const { verificarToken, firmarToken } = require('../services/auth.service');

afterEach(cerrarServidores);

const DN_GUARDA = 'CN=PorteriaGuardas,OU=Grupos,DC=olivos,DC=local';
const errorDirectorio = (codigo, message) => Object.assign(new Error(message), { codigo });
const SEDES = [{ id: 1, codigo: 'S1', nombre: 'Norte', ciudad: 'Cúcuta' }];

function app() {
  const prueba = crearAppPrueba();
  prueba.deps.directorio.validarCredenciales.mockResolvedValue({
    usuario: 'jperez', nombre: 'Juan Pérez', email: 'j@x', memberOf: [DN_GUARDA],
  });
  prueba.deps.h360.listarSedes.mockResolvedValue(SEDES);
  return prueba;
}

describe('POST /auth/login', () => {
  test('guarda válido → token sin sede, usuario y sedes', async () => {
    const { app: a, deps } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'OLIVOS\\jperez', password: 'clave' });
    expect(r.status).toBe(200);
    expect(r.headers['x-por-api']).toBe('POR-AUT-001');
    expect(r.body.data.user).toEqual({ usuario: 'jperez', nombre: 'Juan Pérez', rol: 'guarda', sede: null });
    expect(r.body.data.sedes).toEqual(SEDES);
    expect(verificarToken(r.body.data.token, CONFIG.jwtSecret)).toMatchObject({ usuario: 'jperez', rol: 'guarda', sede_id: null });
    expect(deps.directorio.validarCredenciales).toHaveBeenCalledWith('OLIVOS\\jperez', 'clave');
  });

  test('el grupo de admin general entra como admin_porteria', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockResolvedValue({ usuario: 'ana', nombre: 'Ana', email: '', memberOf: ['CN=Admins,DC=olivos,DC=local'] });
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'ana', password: 'x' });
    expect(r.body.data.user.rol).toBe('admin_porteria');
  });

  test.each([
    [{}],
    [{ usuario: 'jperez' }],
    [{ usuario: '  ', password: 'x' }],
    [{ usuario: 'jperez', password: 123 }],
    [{ usuario: 'x'.repeat(101), password: 'x' }],
  ])('cuerpo inválido %p → 400 sin consultar el AD', async (cuerpo) => {
    const { app: a, deps } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send(cuerpo);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: 'POR-AUT-001', motivo: 'VALIDACION', message: 'Usuario y contraseña son obligatorios' });
    expect(deps.directorio.validarCredenciales).not.toHaveBeenCalled();
  });

  test('usuario inexistente o clave mala → 401 con el mismo mensaje', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(errorDirectorio('CREDENCIALES_INVALIDAS', 'Usuario no encontrado en el directorio'));
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'nadie', password: 'x' });
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, error: 'POR-AUT-001', motivo: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contraseña incorrectos' });
  });

  test('AD caído → 503 DIRECTORIO_NO_DISPONIBLE', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(errorDirectorio('AD_NO_DISPONIBLE', 'No se pudo conectar al directorio activo: x'));
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'jperez', password: 'x' });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ motivo: 'DIRECTORIO_NO_DISPONIBLE', message: 'No se pudo validar con el directorio activo. Intenta de nuevo.' });
  });

  test('sin grupo de portería → 403 SIN_ROL_PORTERIA', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockResolvedValue({ usuario: 'x', nombre: 'X', email: '', memberOf: ['CN=Otro,DC=olivos,DC=local'] });
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'x', password: 'x' });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ motivo: 'SIN_ROL_PORTERIA', message: 'Tu usuario no tiene acceso a Portería. Contacta a TI.' });
  });

  const login = (servidor, usuario, password = 'mala') =>
    request(servidor).post('/api/porteria/v1/auth/login').send({ usuario, password });
  const credencialesMalas = () => errorDirectorio('CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos');

  test('10 fallos del mismo usuario → el 11.º responde 429, pero otro usuario desde la misma IP sigue entrando', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockImplementation(async (u) => {
      if (u === 'jperez') return { usuario: 'jperez', nombre: 'Juan Pérez', email: '', memberOf: [DN_GUARDA] };
      throw credencialesMalas();
    });
    const servidor = await servir(a);
    for (let i = 0; i < 10; i++) expect((await login(servidor, 'x')).status).toBe(401);
    const bloqueado = await login(servidor, 'x');
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body).toMatchObject({ error: 'POR-AUT-001', motivo: 'DEMASIADOS_INTENTOS' });
    expect((await login(servidor, 'jperez', 'clave')).status).toBe(200);
  });

  test('el usuario se normaliza: OLIVOS\\X, x@olivos.local y X comparten contador', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(credencialesMalas());
    const servidor = await servir(a);
    const variantes = ['OLIVOS\\X', 'x@olivos.local', 'X', ' x '];
    for (let i = 0; i < 10; i++) await login(servidor, variantes[i % variantes.length]);
    expect((await login(servidor, 'x')).status).toBe(429);
  });

  test('100 fallos desde una IP bloquean incluso a usuarios nuevos (techo por caseta)', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(credencialesMalas());
    const servidor = await servir(a);
    for (let i = 0; i < 100; i++) expect((await login(servidor, `u${i}`)).status).toBe(401);
    expect((await login(servidor, 'nuevo')).status).toBe(429);
  });

  test('el AD caído (503) repetido nunca da 429', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(errorDirectorio('AD_NO_DISPONIBLE', 'caído'));
    const servidor = await servir(a);
    for (let i = 0; i < 12; i++) expect((await login(servidor, 'x')).status).toBe(503);
  });

  test('403 SIN_ROL repetido nunca da 429', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockResolvedValue({ usuario: 'x', nombre: 'X', email: '', memberOf: [] });
    const servidor = await servir(a);
    for (let i = 0; i < 12; i++) expect((await login(servidor, 'x', 'clave')).status).toBe(403);
  });

  test('un error inesperado (no del AD) → 500 ERROR_INTERNO, no 503', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(new TypeError('boom'));
    const r = await login(await servir(a), 'jperez', 'clave');
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ motivo: 'ERROR_INTERNO' });
  });

  describe('registro de seguridad', () => {
    let child;
    beforeEach(() => {
      child = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      jest.spyOn(logger, 'child').mockReturnValue(child);
    });
    afterEach(() => jest.restoreAllMocks());
    const resultados = () => child.info.mock.calls.filter(([m]) => m === 'porteria login').map(([, d]) => d);

    test('ok', async () => {
      const { app: a } = app();
      await login(await servir(a), 'OLIVOS\\JPerez', 'clave-secreta');
      expect(resultados()).toEqual([expect.objectContaining({ usuario: 'jperez', resultado: 'ok' })]);
      expect(JSON.stringify(child.info.mock.calls)).not.toContain('clave-secreta');
    });
    test('credenciales_invalidas', async () => {
      const { app: a, deps } = app();
      deps.directorio.validarCredenciales.mockRejectedValue(credencialesMalas());
      await login(await servir(a), 'x@olivos.local');
      expect(resultados()).toEqual([expect.objectContaining({ usuario: 'x', resultado: 'credenciales_invalidas' })]);
    });
    test('sin_rol', async () => {
      const { app: a, deps } = app();
      deps.directorio.validarCredenciales.mockResolvedValue({ usuario: 'x', nombre: 'X', email: '', memberOf: [] });
      await login(await servir(a), 'x');
      expect(resultados()).toEqual([expect.objectContaining({ usuario: 'x', resultado: 'sin_rol' })]);
    });
    test('directorio_no_disponible (con warn con codigo y causa)', async () => {
      const { app: a, deps } = app();
      deps.directorio.validarCredenciales.mockRejectedValue(errorDirectorio('AD_NO_DISPONIBLE', 'sin red'));
      await login(await servir(a), 'x');
      expect(resultados()).toEqual([expect.objectContaining({ usuario: 'x', resultado: 'directorio_no_disponible' })]);
      expect(child.warn).toHaveBeenCalledWith(expect.any(String), { codigo: 'AD_NO_DISPONIBLE', causa: 'sin red' });
    });
  });

  test('los logins exitosos no cuentan para el límite', async () => {
    const { app: a } = app();
    const servidor = await servir(a);
    for (let i = 0; i < 12; i++) {
      const r = await request(servidor).post('/api/porteria/v1/auth/login').send({ usuario: 'jperez', password: 'clave' });
      expect(r.status).toBe(200);
    }
  });
});

describe('POST /auth/sede', () => {
  test('sin sesión → 401', async () => {
    const { app: a } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede').send({ sede_id: 1 });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('POR-AUT-002');
  });

  test('elige una sede activa → token nuevo con la sede', async () => {
    const { app: a, deps } = app();
    deps.h360.obtenerSede.mockResolvedValue({ id: 1, codigo: 'S1', nombre: 'Norte', ciudad: 'Cúcuta' });
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede')
      .set('Authorization', `Bearer ${tokenDe()}`).send({ sede_id: '1' });
    expect(r.status).toBe(200);
    expect(r.body.data.user).toEqual({ usuario: 'guarda1', nombre: 'Guarda Uno', rol: 'guarda', sede: { id: 1, nombre: 'Norte' } });
    expect(verificarToken(r.body.data.token, CONFIG.jwtSecret)).toMatchObject({ sede_id: 1, sede_nombre: 'Norte' });
    expect(deps.h360.obtenerSede).toHaveBeenCalledWith(1);
  });

  test('el token nuevo conserva el exp del recibido (no extiende la sesión)', async () => {
    const { app: a, deps } = app();
    deps.h360.obtenerSede.mockResolvedValue({ id: 1, codigo: 'S1', nombre: 'Norte', ciudad: 'Cúcuta' });
    const exp = Math.floor(Date.now() / 1000) + 600;
    const viejo = firmarToken({ usuario: 'guarda1', nombre: 'Guarda Uno', rol: 'guarda', sede: null }, CONFIG, { exp });
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede')
      .set('Authorization', `Bearer ${viejo}`).send({ sede_id: 1 });
    expect(verificarToken(r.body.data.token, CONFIG.jwtSecret).exp).toBe(exp);
    expect(r.body.data.user).not.toHaveProperty('exp');
  });

  test('token sin exp → 401', async () => {
    const { app: a } = app();
    const sinExp = jwt.sign({ scope: 'porteria', rol: 'guarda', nombre: 'G' }, CONFIG.jwtSecret, { subject: 'g', algorithm: 'HS256' });
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede')
      .set('Authorization', `Bearer ${sinExp}`).send({ sede_id: 1 });
    expect(r.status).toBe(401);
  });

  test.each([[{}], [{ sede_id: 'abc' }], [{ sede_id: 0 }], [{ sede_id: 1.5 }]])('sede_id inválido %p → 400', async (cuerpo) => {
    const { app: a } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede')
      .set('Authorization', `Bearer ${tokenDe()}`).send(cuerpo);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ motivo: 'VALIDACION', message: 'Indica la sede' });
  });

  test('sede inexistente o inactiva → 404', async () => {
    const { app: a } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede')
      .set('Authorization', `Bearer ${tokenDe()}`).send({ sede_id: 99 });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ motivo: 'SEDE_NO_ENCONTRADA', message: 'La sede no existe o está inactiva' });
  });
});

test('GET /auth/me devuelve el usuario de la sesión', async () => {
  const { app: a } = app();
  const token = tokenDe({ rol: 'admin_porteria', sede: { id: 2, nombre: 'Sur' } });
  const r = await request(await servir(a)).get('/api/porteria/v1/auth/me').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.headers['x-por-api']).toBe('POR-AUT-003');
  expect(r.body).toEqual({ success: true, data: { user: { usuario: 'guarda1', nombre: 'Guarda Uno', rol: 'admin_porteria', sede: { id: 2, nombre: 'Sur' } } } });
});
