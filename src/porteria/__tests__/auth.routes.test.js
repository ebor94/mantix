const request = require('supertest');
const jwt = require('jsonwebtoken');
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

  test('10 intentos fallidos por IP → el 11.º responde 429', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(errorDirectorio('CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos'));
    const servidor = await servir(a);
    for (let i = 0; i < 10; i++) {
      const r = await request(servidor).post('/api/porteria/v1/auth/login').send({ usuario: 'x', password: 'mala' });
      expect(r.status).toBe(401);
    }
    const r = await request(servidor).post('/api/porteria/v1/auth/login').send({ usuario: 'x', password: 'mala' });
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: 'POR-AUT-001', motivo: 'DEMASIADOS_INTENTOS' });
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
