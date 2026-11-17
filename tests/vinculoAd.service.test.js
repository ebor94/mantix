jest.mock('../src/identity/models', () => ({
  OrgIdentidad: { findOne: jest.fn(), create: jest.fn() }
}));

const { OrgIdentidad } = require('../src/identity/models');
const {
  normalizarAdUsuario, asegurarIdentidad, vincularAdUsuario, VinculoAdError
} = require('../src/identity/services/vinculoAd.service');

function identidad(campos) {
  const i = { id_identidad: 1, email_norm: 'p@x.co', ad_usuario: null, ...campos };
  i.update = jest.fn(async (patch) => Object.assign(i, patch));
  return i;
}

beforeEach(() => jest.clearAllMocks());

describe('normalizarAdUsuario', () => {
  test.each([
    ['PSantafe', 'psantafe'],
    ['  psantafe  ', 'psantafe'],
    ['OLIVOS\\PSANTAFE', 'psantafe'],
    ['psantafe@olivos.local', 'psantafe'],
    ['', ''],
    [null, '']
  ])('%p → %p', (entrada, esperado) => {
    expect(normalizarAdUsuario(entrada)).toBe(esperado);
  });
});

describe('asegurarIdentidad', () => {
  test('devuelve la identidad existente por correo normalizado', async () => {
    const existente = identidad({ email_norm: 'ana@x.co' });
    OrgIdentidad.findOne.mockResolvedValue(existente);
    const r = await asegurarIdentidad({ email: ' Ana@X.co ', nombre: 'Ana' });
    expect(OrgIdentidad.findOne).toHaveBeenCalledWith({ where: { email_norm: 'ana@x.co' } });
    expect(r).toBe(existente);
    expect(OrgIdentidad.create).not.toHaveBeenCalled();
  });

  test('crea la identidad sin clave si no existe', async () => {
    OrgIdentidad.findOne.mockResolvedValue(null);
    OrgIdentidad.create.mockImplementation(async (d) => identidad({ id_identidad: 9, ...d }));
    const r = await asegurarIdentidad({ email: 'beto@x.co', nombre: 'Beto', apellido: 'R', telefono: '300' });
    expect(OrgIdentidad.create).toHaveBeenCalledWith({
      email_norm: 'beto@x.co', nombre: 'Beto', apellido: 'R', telefono: '300',
      password_hash: null, activo: 1
    });
    expect(r.id_identidad).toBe(9);
  });
});

describe('vincularAdUsuario', () => {
  test('vincula en minúsculas si la cuenta está libre', async () => {
    const i = identidad();
    OrgIdentidad.findOne.mockResolvedValue(null);
    await vincularAdUsuario(i, 'PSANTAFE');
    expect(OrgIdentidad.findOne).toHaveBeenCalledWith({ where: { ad_usuario: 'psantafe' } });
    expect(i.update).toHaveBeenCalledWith({ ad_usuario: 'psantafe' });
  });

  test('no hace nada si ya está vinculada a esa misma cuenta', async () => {
    const i = identidad({ ad_usuario: 'psantafe' });
    await vincularAdUsuario(i, 'psantafe');
    expect(OrgIdentidad.findOne).not.toHaveBeenCalled();
    expect(i.update).not.toHaveBeenCalled();
  });

  test('AD_USUARIO_TOMADO si otra identidad ya tiene la cuenta', async () => {
    const i = identidad({ id_identidad: 1 });
    OrgIdentidad.findOne.mockResolvedValue({ id_identidad: 2, email_norm: 'otra@x.co' });
    await expect(vincularAdUsuario(i, 'psantafe')).rejects.toMatchObject({
      code: 'AD_USUARIO_TOMADO',
      message: 'El usuario de red psantafe ya está vinculado a otra@x.co.'
    });
    expect(i.update).not.toHaveBeenCalled();
  });

  test('CORREO_CON_OTRO_AD si la identidad ya tiene otra cuenta y no se permite cambio', async () => {
    const i = identidad({ email_norm: 'p@x.co', ad_usuario: 'viejo' });
    OrgIdentidad.findOne.mockResolvedValue(null);
    await expect(vincularAdUsuario(i, 'nuevo')).rejects.toMatchObject({
      code: 'CORREO_CON_OTRO_AD',
      message: 'El correo p@x.co ya está vinculado al usuario de red viejo.'
    });
  });

  test('con permitirCambio reemplaza la cuenta vinculada', async () => {
    const i = identidad({ ad_usuario: 'viejo' });
    OrgIdentidad.findOne.mockResolvedValue(null);
    await vincularAdUsuario(i, 'nuevo', { permitirCambio: true });
    expect(i.update).toHaveBeenCalledWith({ ad_usuario: 'nuevo' });
  });

  test('AD_USUARIO_INVALIDO si llega vacío', async () => {
    await expect(vincularAdUsuario(identidad(), '  ')).rejects.toBeInstanceOf(VinculoAdError);
    await expect(vincularAdUsuario(identidad(), '  ')).rejects.toMatchObject({ code: 'AD_USUARIO_INVALIDO' });
  });
});
