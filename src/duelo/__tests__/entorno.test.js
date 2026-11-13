const { leerEntorno, leerConexion } = require('../config/entorno');

const BASE = {
  DB_HOST: '127.0.0.1', DB_USER: 'u', DB_PASSWORD: 'p',
  DUELO_PANEL_USUARIO: 'panel', DUELO_PANEL_CLAVE: 'clave-larga',
  DUELO_JWT_SECRET: 'd'.repeat(40), DUELO_VERSION_POLITICA: 'borrador',
};

test('con lo mínimo devuelve configuración con valores por defecto', () => {
  const r = leerEntorno(BASE);
  expect(r.ok).toBe(true);
  expect(r.config).toMatchObject({
    abiertas: true,
    versionPolitica: 'borrador',
    origenes: ['https://losolivoscucuta.com'],
    limiteInscripciones: 30,
    jwtExpires: '2h',
    turnstileSecret: null,
    correo: { canal: 'ninguno' },
    db: { host: '127.0.0.1', port: 3306, database: 'serfuweb' },
  });
  expect(r.config.fotosPath).toMatch(/datos[\\/]duelo[\\/]fotos$/);
});

test('lista las variables que faltan sin revelar valores', () => {
  const r = leerEntorno({ DB_HOST: 'h' });
  expect(r.ok).toBe(false);
  expect(r.motivo).toContain('DUELO_JWT_SECRET');
  expect(r.motivo).toContain('DB_PASSWORD');
});

test('DUELO_INSCRIPCIONES_ABIERTAS=false cierra las inscripciones', () => {
  expect(leerEntorno({ ...BASE, DUELO_INSCRIPCIONES_ABIERTAS: 'false' }).config.abiertas).toBe(false);
});

test('varios orígenes separados por coma', () => {
  const r = leerEntorno({ ...BASE, DUELO_ORIGENES: 'https://a.com, http://localhost:5173' });
  expect(r.config.origenes).toEqual(['https://a.com', 'http://localhost:5173']);
});

test('canal n8n exige URL y secreto', () => {
  expect(leerEntorno({ ...BASE, DUELO_CORREO_CANAL: 'n8n' }).ok).toBe(false);
  const r = leerEntorno({ ...BASE, DUELO_CORREO_CANAL: 'n8n', DUELO_N8N_WEBHOOK_URL: 'https://n8n/x', DUELO_N8N_SECRETO: 's' });
  expect(r.config.correo).toEqual({ canal: 'n8n', url: 'https://n8n/x', secreto: 's' });
});

test('canal desconocido es inválido', () => {
  expect(leerEntorno({ ...BASE, DUELO_CORREO_CANAL: 'smtp' }).ok).toBe(false);
});

test('el secreto del panel no puede repetir otro secreto JWT', () => {
  const r = leerEntorno({ ...BASE, JWT_SECRET: BASE.DUELO_JWT_SECRET });
  expect(r.ok).toBe(false);
});

test('leerConexion solo exige las DB_*', () => {
  expect(leerConexion({ DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_PORT: '3310', DB_NAME: 'x' }))
    .toEqual({ ok: true, db: { host: 'h', port: 3310, user: 'u', password: 'p', database: 'x' } });
});
