const path = require('path');
const { crearConvertidorHeic } = require('../services/convertidorHeic');

const script = path.join(__dirname, '../testing/workerHeicPrueba.js');
const convertidor = (extra = {}) => crearConvertidorHeic({ script, timeoutMs: 2000, ...extra });

test('devuelve como Buffer lo que el worker convierte', async () => {
  const salida = await convertidor()(Buffer.from('foto'));
  expect(Buffer.isBuffer(salida)).toBe(true);
  expect(salida.toString()).toBe('convertido:foto');
});

test('no deja inservible el buffer original (se transfiere una copia)', async () => {
  const entrada = Buffer.from('foto');
  await convertidor()(entrada);
  expect(entrada.toString()).toBe('foto');
});

test('un error del worker rechaza con su nombre y código', async () => {
  await expect(convertidor()(Buffer.from('fallar'))).rejects.toMatchObject({ name: 'TypeError', code: 'ERR_HEIF' });
});

test('si el worker termina sin responder, rechaza', async () => {
  await expect(convertidor()(Buffer.from('morir'))).rejects.toMatchObject({ code: 'HEIC_WORKER_SALIO' });
});

test('si el worker se cuelga, lo termina al vencer el plazo y rechaza', async () => {
  const inicio = Date.now();
  await expect(convertidor({ timeoutMs: 300 })(Buffer.from('colgar'))).rejects.toMatchObject({ code: 'HEIC_TIEMPO' });
  expect(Date.now() - inicio).toBeLessThan(2000);
});

test('un script que no existe rechaza en vez de lanzar', async () => {
  await expect(crearConvertidorHeic({ script: '/no/existe.js' })(Buffer.from('x'))).rejects.toHaveProperty('code');
});
