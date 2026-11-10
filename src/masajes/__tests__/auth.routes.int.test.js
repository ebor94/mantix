// Login AD + autovinculación (spec §9) contra la BD de pruebas. El AD es falso; el logger se captura.
const mockRegistros = [];
jest.mock('../../utils/logger', () => {
  const crear = (ctx = {}) => ({
    child: (c) => crear({ ...ctx, ...c }),
    info: (...a) => mockRegistros.push(['info', ctx, ...a]),
    warn: (...a) => mockRegistros.push(['warn', ctx, ...a]),
    error: (...a) => mockRegistros.push(['error', ctx, ...a]),
    debug: () => {},
  });
  return crear();
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar, insertarBeneficiario } = require('../testing/fabricas');
const { crearAppPrueba } = require('../testing/appPrueba');
const { crearDirectorioFalso, DN_ADMIN } = require('../testing/directorioFalso');

const CLAVE = 'Clave-Secreta-123';
const CUENTAS = {
  eortega: { sam: 'EOrtega', password: CLAVE, nombre: 'Edwin Ortega', email: 'EOrtega@LosOlivos.co' },
  aperez: { password: CLAVE, nombre: 'Ana Maria Perez', email: 'coordcomercialcucuta@losolivos.co' }, // buzón compartido
  mdiaz: { password: CLAVE, nombre: 'Marta Diaz', email: 'marta.diaz@gmail.com' }, // correo personal
  recepcion: { password: CLAVE, nombre: 'Recepción Sede Norte', email: 'jgomez@losolivos.co' }, // correo de otra persona
  admin1: { password: CLAVE, nombre: 'Admin TH', email: 'th@losolivos.co', memberOf: [DN_ADMIN] },
  falsoadmin: { password: CLAVE, nombre: 'Falso Admin', email: 'fa@losolivos.co', memberOf: ['CN=GG-Masajes-Admin,OU=Pruebas,DC=olivos,DC=local'] },
  intruso: { password: CLAVE, nombre: 'No Listado', email: 'nolistado@losolivos.co' },
};

let conn;
let bd;
let app;
let directorio;
beforeAll(async () => { conn = await abrirConexion(); bd = crearBdDePrueba(); });
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(async () => {
  await limpiar(conn);
  mockRegistros.length = 0;
  directorio = crearDirectorioFalso(CUENTAS);
  app = crearAppPrueba({ bd, directorio });
});
afterEach(cerrarServidores);

const login = async (usuario, password = CLAVE, extra = {}) =>
  request(await servir(app)).post('/api/masajes/v1/auth/login').send({ usuario, password, ...extra });
const vinculo = async (id) => (await conn.query('SELECT ad_usuario FROM msj_beneficiarios WHERE id = ?', [id]))[0][0].ad_usuario;
const historial = async () => (await conn.query("SELECT beneficiario_id, cita_id, accion, usuario, es_admin, ip FROM msj_cita_historial WHERE accion = 'autovinculacion'"))[0];

describe('credenciales y directorio', () => {
  test('credenciales malas → 401 con el mismo mensaje para usuario inexistente y clave mala', async () => {
    const a = await login('eortega', 'mala');
    const b = await login('noexiste', 'mala');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toMatchObject({ success: false, error: 'MSJ-AUT-001', motivo: 'CREDENCIALES_INVALIDAS' });
    expect(a.body.message).toBe(b.body.message);
  });

  test('AD caído → 503 y no cuenta como intento fallido', async () => {
    for (let i = 0; i < 12; i++) expect((await login('caido')).status).toBe(503);
    expect((await login('caido')).body.motivo).toBe('DIRECTORIO_NO_DISPONIBLE');
  });

  test('cuerpo inválido o con campos extra → 400 sin consultar el AD', async () => {
    expect((await login('', CLAVE)).status).toBe(400);
    expect((await login('eortega', '')).status).toBe(400);
    expect((await login('x'.repeat(101), CLAVE)).status).toBe(400);
    expect((await login('eortega', CLAVE, { rol: 'admin_masajes' })).status).toBe(400);
    expect((await request(await servir(app)).post('/api/masajes/v1/auth/login').send({ usuario: ['eortega'], password: CLAVE })).status).toBe(400);
    expect(directorio.validarCredenciales).not.toHaveBeenCalled();
  });

  test('11 fallos del mismo usuario en 15 min → 429; los logins correctos no cuentan', async () => {
    const id = await insertarBeneficiario(conn, { nombre: 'Edwin Ortega', ad_usuario: 'eortega' });
    expect(id).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) expect((await login('eortega')).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await login('eortega', 'mala')).status).toBe(401);
    const r = await login('eortega', 'mala');
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: 'MSJ-AUT-001', motivo: 'DEMASIADOS_INTENTOS' });
  });

  test('la contraseña nunca aparece en los logs, ni en un login fallido ni en uno correcto', async () => {
    await insertarBeneficiario(conn, { nombre: 'Edwin Ortega', ad_usuario: 'eortega' });
    await login('eortega', 'mala-pero-secreta');
    await login('eortega');
    const todo = JSON.stringify(mockRegistros);
    expect(mockRegistros.some(([, , msg]) => msg === 'masajes login')).toBe(true);
    expect(todo).not.toContain('mala-pero-secreta');
    expect(todo).not.toContain(CLAVE);
  });
});

describe('beneficiario ya vinculado', () => {
  test('200 con token propio; el token no lleva datos personales ni el id del beneficiario', async () => {
    const id = await insertarBeneficiario(conn, { nombre: 'Edwin Brandon Ortega Ramirez', ad_usuario: 'eortega', celular: '573152884079' });
    const r = await login('OLIVOS\\EOrtega');
    expect(r.status).toBe(200);
    expect(r.body.data.usuario).toEqual({ usuario: 'eortega', nombre: 'Edwin Ortega', rol: 'empleado', beneficiario: { id, nombre: 'Edwin Brandon Ortega Ramirez' } });
    const p = jwt.decode(r.body.data.token);
    expect(p).toMatchObject({ scope: 'masajes', sub: 'eortega', rol: 'empleado' });
    expect(JSON.stringify(p)).not.toMatch(/573152884079|losolivos|beneficiario/);
  });

  test('beneficiario inactivo y no admin → 403 NO_BENEFICIARIO sin token', async () => {
    await insertarBeneficiario(conn, { nombre: 'Edwin Ortega', ad_usuario: 'eortega', activo: 0 });
    const r = await login('eortega');
    expect(r.status).toBe(403);
    expect(r.body.motivo).toBe('NO_BENEFICIARIO');
    expect(r.body.data).toBeUndefined();
  });
});

describe('autovinculación por correo (una sola vez)', () => {
  test('correo corporativo de un solo beneficiario + nombre compatible → vincula y deja historial', async () => {
    const id = await insertarBeneficiario(conn, { nombre: 'Edwin Brandon Ortega Ramirez', correo: 'eortega@losolivos.co' });
    const r = await login('eortega');
    expect(r.status).toBe(200);
    expect(r.body.data.usuario.beneficiario).toEqual({ id, nombre: 'Edwin Brandon Ortega Ramirez' });
    expect(await vinculo(id)).toBe('eortega'); // guardado en minúsculas
    expect(await historial()).toEqual([{ beneficiario_id: id, cita_id: null, accion: 'autovinculacion', usuario: 'eortega', es_admin: 0, ip: expect.any(String) }]);
    await login('eortega');
    expect(await historial()).toHaveLength(1); // la segunda vez ya está vinculado
  });

  test('buzón compartido por dos beneficiarios → no vincula → 403', async () => {
    const a = await insertarBeneficiario(conn, { nombre: 'Ana Maria Perez', correo: 'coordcomercialcucuta@losolivos.co' });
    await insertarBeneficiario(conn, { nombre: 'Luis Gomez', correo: 'coordcomercialcucuta@losolivos.co' });
    const r = await login('aperez');
    expect(r.status).toBe(403);
    expect(await vinculo(a)).toBeNull();
  });

  test('buzón compartido donde el otro YA está vinculado → tampoco vincula (se cuentan todos)', async () => {
    const a = await insertarBeneficiario(conn, { nombre: 'Ana Maria Perez', correo: 'coordcomercialcucuta@losolivos.co' });
    await insertarBeneficiario(conn, { nombre: 'Luis Gomez', correo: 'coordcomercialcucuta@losolivos.co', ad_usuario: 'lgomez' });
    expect((await login('aperez')).status).toBe(403);
    expect(await vinculo(a)).toBeNull();
  });

  test('correo personal (gmail) → no vincula aunque coincida', async () => {
    const id = await insertarBeneficiario(conn, { nombre: 'Marta Diaz', correo: 'marta.diaz@gmail.com' });
    expect((await login('mdiaz')).status).toBe(403);
    expect(await vinculo(id)).toBeNull();
  });

  test('correo coincide pero el nombre de la cuenta es de otra persona → no vincula', async () => {
    const id = await insertarBeneficiario(conn, { nombre: 'Juan Gomez Lopez', correo: 'jgomez@losolivos.co' });
    expect((await login('recepcion')).status).toBe(403);
    expect(await vinculo(id)).toBeNull();
  });

  test('beneficiario inactivo con correo coincidente → no vincula', async () => {
    const id = await insertarBeneficiario(conn, { nombre: 'Edwin Ortega', correo: 'eortega@losolivos.co', activo: 0 });
    expect((await login('eortega')).status).toBe(403);
    expect(await vinculo(id)).toBeNull();
  });

  test('dos logins simultáneos del mismo usuario → vincula una sola vez', async () => {
    const id = await insertarBeneficiario(conn, { nombre: 'Edwin Ortega', correo: 'eortega@losolivos.co' });
    const [a, b] = await Promise.all([login('eortega'), login('eortega')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await vinculo(id)).toBe('eortega');
    expect(await historial()).toHaveLength(1);
  });

  test('usuario fuera del listado → 403 NO_BENEFICIARIO con el texto de la spec', async () => {
    const r = await login('intruso');
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('No estás en el listado de beneficiarios. Comunícate con Talento Humano.');
  });
});

describe('administradores', () => {
  test('admin no beneficiario → 200 con rol admin y beneficiario null', async () => {
    const r = await login('admin1');
    expect(r.status).toBe(200);
    expect(r.body.data.usuario).toMatchObject({ rol: 'admin_masajes', beneficiario: null });
  });

  test('grupo con el mismo CN en otra OU → no es admin → 403 si no es beneficiario', async () => {
    const r = await login('falsoadmin');
    expect(r.status).toBe(403);
    expect(r.body.motivo).toBe('NO_BENEFICIARIO');
  });
});

describe('GET /auth/sesion', () => {
  test('relee el beneficiario: desactivado después del login → beneficiario null', async () => {
    const id = await insertarBeneficiario(conn, { nombre: 'Edwin Ortega', ad_usuario: 'eortega' });
    const { token } = (await login('eortega')).body.data;
    const s = await servir(app);
    const antes = await request(s).get('/api/masajes/v1/auth/sesion').set('Authorization', `Bearer ${token}`);
    expect(antes.body.data).toEqual({ usuario: 'eortega', nombre: 'Edwin Ortega', rol: 'empleado', beneficiario: { id, nombre: 'Edwin Ortega' } });
    await conn.execute('UPDATE msj_beneficiarios SET activo = 0 WHERE id = ?', [id]);
    const despues = await request(s).get('/api/masajes/v1/auth/sesion').set('Authorization', `Bearer ${token}`);
    expect(despues.body.data.beneficiario).toBeNull();
  });

  test('sin token → 401', async () => {
    const r = await request(await servir(app)).get('/api/masajes/v1/auth/sesion');
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: 'MSJ-AUT-002', motivo: 'NO_AUTENTICADO' });
  });
});
