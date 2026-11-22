const request = require('supertest');
const jwt = require('jsonwebtoken');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe, CONFIG } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const DN = 'CN=INCOL_APP,OU=Grupos,DC=olivos,DC=local';
const datosAd = (memberOf = [DN]) => ({ usuario: 'jperez', nombre: 'Juan Pérez', email: 'jperez@olivos.local', memberOf });
const errorAd = (codigo) => Object.assign(new Error(codigo), { codigo });
const login = async (app, cuerpo) => request(await servir(app)).post('/api/horno/v1/auth/login').send(cuerpo);
const me = async (app, token) => {
  const r = request(await servir(app)).get('/api/horno/v1/auth/me');
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};

test('login correcto con el grupo devuelve un token del módulo', async () => {
  const { app, deps } = crearAppPrueba();
  deps.directorio.validarCredenciales.mockResolvedValue(datosAd());
  const r = await login(app, { usuario: 'jperez', password: 'clave' });
  expect(r.status).toBe(200);
  expect(r.headers['x-hor-api']).toBe('HOR-AUT-001');
  expect(r.body.data.user).toEqual({ usuario: 'jperez', nombre: 'Juan Pérez', email: 'jperez@olivos.local' });
  expect(jwt.verify(r.body.data.token, CONFIG.jwtSecret)).toMatchObject({ scope: 'horno', sub: 'jperez' });
  expect(deps.directorio.validarCredenciales).toHaveBeenCalledWith('jperez', 'clave');
});

test('sin usuario o clave responde 400 sin consultar el AD', async () => {
  const { app, deps } = crearAppPrueba();
  const r = await login(app, { usuario: 'jperez' });
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ success: false, error: 'HOR-AUT-001', motivo: 'VALIDACION' });
  expect(deps.directorio.validarCredenciales).not.toHaveBeenCalled();
});

test('credenciales inválidas responde 401', async () => {
  const { app, deps } = crearAppPrueba();
  deps.directorio.validarCredenciales.mockRejectedValue(errorAd('CREDENCIALES_INVALIDAS'));
  const r = await login(app, { usuario: 'jperez', password: 'mala' });
  expect(r.status).toBe(401);
  expect(r.body).toMatchObject({ motivo: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contraseña incorrectos' });
});

test('fuera del grupo INCOL_APP responde 403 aunque el nombre se parezca', async () => {
  const { app, deps } = crearAppPrueba();
  deps.directorio.validarCredenciales.mockResolvedValue(datosAd(['CN=INCOL_APP_OTROS,OU=Grupos,DC=olivos,DC=local']));
  const r = await login(app, { usuario: 'jperez', password: 'clave' });
  expect(r.status).toBe(403);
  expect(r.body.motivo).toBe('SIN_ACCESO');
  expect(r.body.message).toMatch(/INCOL_APP/);
});

test('AD caído responde 503', async () => {
  const { app, deps } = crearAppPrueba();
  deps.directorio.validarCredenciales.mockRejectedValue(errorAd('AD_NO_DISPONIBLE'));
  const r = await login(app, { usuario: 'jperez', password: 'clave' });
  expect(r.status).toBe(503);
  expect(r.body.motivo).toBe('AD_NO_DISPONIBLE');
});

test('/auth/me con token devuelve el usuario', async () => {
  const { app } = crearAppPrueba();
  const r = await me(app, tokenDe());
  expect(r.status).toBe(200);
  expect(r.body.data.user).toEqual({ usuario: 'operador1', nombre: 'Operador Uno', email: 'op@olivos.local' });
});

test('/auth/me sin token, con token de otro módulo o vencido responde 401', async () => {
  const { app } = crearAppPrueba();
  const deOtro = jwt.sign({ scope: 'porteria', rol: 'guarda' }, CONFIG.jwtSecret, { subject: 'x', expiresIn: '1h' });
  const vencido = jwt.sign({ scope: 'horno' }, CONFIG.jwtSecret, { subject: 'x', expiresIn: -10 });
  for (const token of [null, deOtro, vencido, 'basura']) {
    const r = await me(app, token);
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: 'HOR-AUT-002', motivo: 'NO_AUTENTICADO' });
  }
});

test('health responde ok con la BD viva y 503 si no responde', async () => {
  const viva = crearAppPrueba().app;
  expect((await request(await servir(viva)).get('/api/horno/v1/health')).body.data).toEqual({ estado: 'ok', bd: 'ok' });
  const caida = crearAppPrueba({ bd: { ping: async () => { throw new Error('ECONNREFUSED'); } } }).app;
  const r = await request(await servir(caida)).get('/api/horno/v1/health');
  expect(r.status).toBe(503);
  expect(r.body.error).toBe('HOR-SIS-001');
});

test('ruta inexistente responde 404 con el contrato del módulo', async () => {
  const { app } = crearAppPrueba();
  const r = await request(await servir(app)).get('/api/horno/v1/no-existe');
  expect(r.status).toBe(404);
  expect(r.body).toMatchObject({ success: false, error: 'HOR-SIS-002', motivo: 'NO_ENCONTRADO' });
});
