const { crearNotificador } = require('../services/notificador');

const DATOS = { nombre: 'Ana Pérez', correo: 'ana@correo.com', companeros: ['Luna'], evento: { titulo: 'x' } };

test('canal ninguno no llama a nadie', async () => {
  const http = { post: jest.fn() };
  expect(await crearNotificador({ canal: 'ninguno' }, http).notificar(DATOS)).toEqual({ enviado: false, error: null });
  expect(http.post).not.toHaveBeenCalled();
});

test('canal n8n envía el cuerpo con el secreto en la cabecera', async () => {
  const http = { post: jest.fn(async () => ({ status: 200 })) };
  const r = await crearNotificador({ canal: 'n8n', url: 'https://n8n/hook', secreto: 's3' }, http).notificar(DATOS);
  expect(r).toEqual({ enviado: true, error: null });
  expect(http.post).toHaveBeenCalledWith('https://n8n/hook', DATOS, {
    headers: { 'X-Duelo-Secreto': 's3' }, timeout: 8000,
  });
});

test('si n8n falla devuelve el error recortado y no lanza', async () => {
  const http = { post: jest.fn(async () => { throw new Error('x'.repeat(400)); }) };
  const r = await crearNotificador({ canal: 'n8n', url: 'u', secreto: 's' }, http).notificar(DATOS);
  expect(r.enviado).toBe(false);
  expect(r.error).toHaveLength(255);
});
