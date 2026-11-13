// El tablero del televisor del garaje.
//
// Es el único endpoint del módulo sin sesión, así que lo que más importa acá
// es la compuerta: sin token configurado no responde, y con un token
// equivocado no deja ni asomar si hay datos detrás.
//
// Lo segundo es la ventana: tiene que ser LA MISMA del aviso diario por Chat.
// Si fueran distintas, el televisor y el mensaje de la mañana se
// contradirían y nadie sabría a cuál creerle.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const db = require('../../config/db');
const { tableroPublico } = require('../desinfecciones.controller');

const TOKEN = 'token-de-prueba-del-garaje';
const TOKEN_ANTES = process.env.DESINF_PUBLICO_TOKEN;
const DIAS_ANTES  = process.env.DESINF_AVISO_DIAS;

function resFalso() {
  return {
    codigo: 200,
    cuerpo: undefined,
    status(c) { this.codigo = c; return this },
    json(b)   { this.cuerpo = b; return this },
  };
}

const pedir = (token) => ({ params: { token } });

/** Una fila como la devuelve MySQL: `inhabilitado` llega 1/0, no true/false. */
const fila = (extra = {}) => ({
  vehiculo_id: 34, placa: 'FRR-237', tipo: 'CARROZA', inhabilitado: 0,
  actividad: 'Limpieza y lavado', fecha_prox: '2026-11-15', dias: 2, ...extra,
});

beforeEach(() => {
  db.query.mockReset();
  process.env.DESINF_PUBLICO_TOKEN = TOKEN;
  delete process.env.DESINF_AVISO_DIAS;
});
afterAll(() => {
  if (TOKEN_ANTES === undefined) delete process.env.DESINF_PUBLICO_TOKEN;
  else process.env.DESINF_PUBLICO_TOKEN = TOKEN_ANTES;
  if (DIAS_ANTES === undefined) delete process.env.DESINF_AVISO_DIAS;
  else process.env.DESINF_AVISO_DIAS = DIAS_ANTES;
});

describe('la compuerta', () => {
  test('sin token configurado en el servidor: 500 y no consulta nada', async () => {
    delete process.env.DESINF_PUBLICO_TOKEN;
    const res = resFalso();
    await tableroPublico(pedir(TOKEN), res, e => { throw e });

    expect(res.codigo).toBe(500);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('con token equivocado: 404 y no consulta nada', async () => {
    const res = resFalso();
    await tableroPublico(pedir('otro'), res, e => { throw e });

    expect(res.codigo).toBe(404);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('sin token en la URL: 404', async () => {
    const res = resFalso();
    await tableroPublico(pedir(undefined), res, e => { throw e });

    expect(res.codigo).toBe(404);
  });

  // Un 404 que dijera «no hay nada que mostrar» confirmaría que la dirección
  // existe. Tiene que ser indistinguible de una ruta inventada.
  test('el 404 no delata que el tablero exista', async () => {
    const res = resFalso();
    await tableroPublico(pedir('otro'), res, e => { throw e });

    expect(JSON.stringify(res.cuerpo)).not.toMatch(/desinf|veh[ií]culo|tablero/i);
  });

  test('con el token bueno responde 200', async () => {
    db.query.mockResolvedValueOnce([[fila()]]);
    const res = resFalso();
    await tableroPublico(pedir(TOKEN), res, e => { throw e });

    expect(res.codigo).toBe(200);
    expect(res.cuerpo.items).toHaveLength(1);
  });
});

describe('qué devuelve', () => {
  test('la urgencia sale del signo de los días', async () => {
    db.query.mockResolvedValueOnce([[
      fila({ dias: -3 }), fila({ dias: 0 }), fila({ dias: 5 }),
    ]]);
    const res = resFalso();
    await tableroPublico(pedir(TOKEN), res, e => { throw e });

    expect(res.cuerpo.items.map(i => i.urgencia)).toEqual(['VENCIDA', 'HOY', 'PROXIMA']);
  });

  // MySQL devuelve 1/0 para una comparación. Mandarlo crudo obligaría a la
  // pantalla a saber eso; peor, un 0 es «falsy» pero un "0" no lo sería.
  test('inhabilitado viaja como booleano de verdad', async () => {
    db.query.mockResolvedValueOnce([[fila({ inhabilitado: 1 }), fila({ inhabilitado: 0 })]]);
    const res = resFalso();
    await tableroPublico(pedir(TOKEN), res, e => { throw e });

    expect(res.cuerpo.items.map(i => i.inhabilitado)).toEqual([true, false]);
  });

  test('incluye la hora de Bogotá y la ventana usada', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = resFalso();
    await tableroPublico(pedir(TOKEN), res, e => { throw e });

    expect(res.cuerpo.generado).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(res.cuerpo.dias_aviso).toBe(3);
  });

  test('sin nada que mostrar devuelve la lista vacía, no un error', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = resFalso();
    await tableroPublico(pedir(TOKEN), res, e => { throw e });

    expect(res.codigo).toBe(200);
    expect(res.cuerpo.items).toEqual([]);
  });
});

describe('la consulta', () => {
  async function sql() {
    db.query.mockResolvedValueOnce([[]]);
    await tableroPublico(pedir(TOKEN), resFalso(), e => { throw e });
    return db.query.mock.calls[0];
  }

  test('deja fuera lo que no aplica y lo que no tiene fecha', async () => {
    const [consulta] = await sql();
    expect(consulta).toMatch(/p\.estado <> 'NO_APLICA'/);
    expect(consulta).toMatch(/p\.fecha_prox IS NOT NULL/);
  });

  // La fecha se formatea en SQL: devuelta como objeto, Express la serializa en
  // UTC y en Colombia la pantalla mostraría el día anterior.
  test('la fecha se formatea en SQL', async () => {
    const [consulta] = await sql();
    expect(consulta).toMatch(/DATE_FORMAT\(p\.fecha_prox, '%Y-%m-%d'\)/);
  });

  // El «hoy» lo pone el servidor y no CURDATE(): así el televisor y el tablero
  // interno cuentan los días desde la misma fecha.
  test('el hoy va como parámetro, no CURDATE()', async () => {
    const [consulta, params] = await sql();
    expect(consulta).not.toMatch(/CURDATE\(\)/);
    expect(params[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('solo mira reglas activas', async () => {
    const [consulta] = await sql();
    expect(consulta).toMatch(/r\.activo = 1/);
  });

  test('los inhabilitados van primero', async () => {
    const [consulta] = await sql();
    expect(consulta).toMatch(/ORDER BY inhabilitado DESC/);
  });
});

describe('la ventana de aviso', () => {
  async function ventanaUsada() {
    db.query.mockResolvedValueOnce([[]]);
    const res = resFalso();
    await tableroPublico(pedir(TOKEN), res, e => { throw e });
    return { params: db.query.mock.calls[0][1], cuerpo: res.cuerpo };
  }

  test('por defecto son 3 días', async () => {
    const { params, cuerpo } = await ventanaUsada();
    expect(params[2]).toBe(3);
    expect(cuerpo.dias_aviso).toBe(3);
  });

  test('la manda DESINF_AVISO_DIAS', async () => {
    process.env.DESINF_AVISO_DIAS = '7';
    const { params } = await ventanaUsada();
    expect(params[2]).toBe(7);
  });

  // Con 900 el televisor mostraría el parque entero y dejaría de distinguir lo
  // urgente, que es justo lo que esta pantalla existe para hacer.
  test.each(['0', '-5', 'muchos', '900', ''])('un valor absurdo (%s) cae al default', async (v) => {
    process.env.DESINF_AVISO_DIAS = v;
    const { params } = await ventanaUsada();
    expect(params[2]).toBe(3);
  });
});

test('un fallo de la base va al manejador de errores', async () => {
  db.query.mockRejectedValueOnce(new Error('ER_LOCK_WAIT_TIMEOUT'));
  const next = jest.fn();
  await tableroPublico(pedir(TOKEN), resFalso(), next);

  expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ER_LOCK_WAIT_TIMEOUT' }));
});
