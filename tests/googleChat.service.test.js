jest.mock('axios');
const axios = require('axios');
const gchat = require('../src/sv/services/googleChat.service');

describe('services/googleChat', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, GCHAT_WEBHOOK_EVENTOS: 'https://chat.example.com/webhook' };
  });
  afterAll(() => { process.env = OLD_ENV; });

  it('envía payload con texto que incluye asesor + otp + cambios', async () => {
    axios.post.mockResolvedValueOnce({ status: 200 });
    const r = await gchat.enviarOtp({
      evento: { evento_id: 12, evento_titulo: 'Feria XYZ' },
      usuario: { usr_id: 5, usr_nombre: 'Pepe', usr_apellido: 'Santafé' },
      cambios: { titulo: 'Nuevo título' },
      otp: '493712'
    });
    expect(r.ok).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'https://chat.example.com/webhook',
      expect.objectContaining({ text: expect.stringContaining('493712') }),
      expect.objectContaining({ timeout: 5000 })
    );
    const body = axios.post.mock.calls[0][1].text;
    expect(body).toContain('Pepe Santafé');
    expect(body).toContain('Feria XYZ');
  });

  it('lanza GCHAT_FAIL en timeout', async () => {
    axios.post.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
    await expect(gchat.enviarOtp({
      evento: { evento_id: 1, evento_titulo: 't' },
      usuario: { usr_id: 1, usr_nombre: 'a', usr_apellido: 'b' },
      cambios: { x: 1 }, otp: '123456'
    })).rejects.toMatchObject({ code: 'GCHAT_FAIL' });
  });

  it('lanza GCHAT_FAIL si falta GCHAT_WEBHOOK_EVENTOS', async () => {
    delete process.env.GCHAT_WEBHOOK_EVENTOS;
    await expect(gchat.enviarOtp({
      evento: { evento_id: 1, evento_titulo: 't' },
      usuario: { usr_id: 1, usr_nombre: 'a', usr_apellido: 'b' },
      cambios: { x: 1 }, otp: '123456'
    })).rejects.toMatchObject({ code: 'GCHAT_FAIL' });
  });
});
