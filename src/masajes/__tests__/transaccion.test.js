const { enTransaccion, conReintentos } = require('../utils/transaccion');

function bdFalsa() {
  const log = [];
  const conn = {
    beginTransaction: async () => log.push('begin'),
    commit: async () => log.push('commit'),
    rollback: async () => log.push('rollback'),
    release: () => log.push('release'),
  };
  return { log, bd: { obtener: () => ({ getConnection: async () => conn }) } };
}

test('commit y release cuando termina bien', async () => {
  const { log, bd } = bdFalsa();
  expect(await enTransaccion(bd, async () => 7)).toBe(7);
  expect(log).toEqual(['begin', 'commit', 'release']);
});

test('rollback, release y relanza el error original', async () => {
  const { log, bd } = bdFalsa();
  await expect(enTransaccion(bd, async () => { throw new Error('x'); })).rejects.toThrow('x');
  expect(log).toEqual(['begin', 'rollback', 'release']);
});

test('conReintentos repite ante deadlock o espera de bloqueo y luego lo deja pasar', async () => {
  let n = 0;
  const fn = jest.fn(async () => { n += 1; if (n < 3) throw Object.assign(new Error('d'), { code: 'ER_LOCK_DEADLOCK' }); return 'ok'; });
  expect(await conReintentos(fn, { intentos: 3, esperaMs: 0 })).toBe('ok');
  expect(fn).toHaveBeenCalledTimes(3);
  const siempre = jest.fn(async () => { throw Object.assign(new Error('d'), { code: 'ER_LOCK_WAIT_TIMEOUT' }); });
  await expect(conReintentos(siempre, { intentos: 3, esperaMs: 0 })).rejects.toMatchObject({ code: 'ER_LOCK_WAIT_TIMEOUT' });
  expect(siempre).toHaveBeenCalledTimes(3);
});

test('conReintentos NO repite errores de negocio ni otros errores de BD', async () => {
  for (const err of [Object.assign(new Error('x'), { motivo: 'SLOT_OCUPADO' }), Object.assign(new Error('y'), { code: 'ER_DUP_ENTRY' })]) {
    const fn = jest.fn(async () => { throw err; });
    await expect(conReintentos(fn, { intentos: 3, esperaMs: 0 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  }
});
