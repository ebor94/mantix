jest.mock('../src/identity/models', () => ({
  OrgIdentidad: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn(), findAll: jest.fn() }
}));
jest.mock('../src/h360/services/ldap.service', () => ({ buscarUsuarioPorSam: jest.fn() }));

const { OrgIdentidad } = require('../src/identity/models');
const ldap = require('../src/h360/services/ldap.service');
const usuariosAd = require('../src/sv/services/usuariosAd.service');

function identidad(campos) {
  const i = { id_identidad: 7, email_norm: 'ana@x.co', ad_usuario: null, ...campos };
  i.update = jest.fn(async (p) => Object.assign(i, p));
  return i;
}

beforeEach(() => {
  jest.clearAllMocks();
  ldap.buscarUsuarioPorSam.mockResolvedValue({ usuario: 'AGOMEZ', nombre: 'ANA GOMEZ', mail: 'ana@x.co' });
});

describe('resolverIdentidad', () => {
  test('AD_USUARIO_NO_EXISTE si la cuenta no está en el directorio', async () => {
    ldap.buscarUsuarioPorSam.mockResolvedValue(null);
    await expect(usuariosAd.resolverIdentidad({ adUsuario: 'fantasma', email: 'f@x.co' }))
      .rejects.toMatchObject({ code: 'AD_USUARIO_NO_EXISTE', message: 'No se encontró ese usuario de red en el directorio activo.' });
  });

  test('alta nueva: crea la identidad por correo y la vincula', async () => {
    const nueva = identidad({ id_identidad: 12, email_norm: 'ana@x.co' });
    OrgIdentidad.findOne
      .mockResolvedValueOnce(null)   // asegurarIdentidad: no existe por correo
      .mockResolvedValueOnce(null);  // vincularAdUsuario: cuenta libre
    OrgIdentidad.create.mockResolvedValue(nueva);

    const id = await usuariosAd.resolverIdentidad({ adUsuario: 'AGomez', email: 'Ana@X.co', nombre: 'Ana', apellido: 'G' });

    expect(ldap.buscarUsuarioPorSam).toHaveBeenCalledWith('agomez');
    expect(id).toBe(12);
    expect(nueva.update).toHaveBeenCalledWith({ ad_usuario: 'agomez' });
  });

  test('AD_USUARIO_TOMADO si la cuenta ya es de otra identidad', async () => {
    OrgIdentidad.findOne
      .mockResolvedValueOnce(identidad({ id_identidad: 7 }))
      .mockResolvedValueOnce({ id_identidad: 99, email_norm: 'otra@x.co' });
    await expect(usuariosAd.resolverIdentidad({ adUsuario: 'agomez', email: 'ana@x.co' }))
      .rejects.toMatchObject({ code: 'AD_USUARIO_TOMADO' });
  });

  test('alta: CORREO_CON_OTRO_AD si el correo ya está vinculado a otra cuenta', async () => {
    OrgIdentidad.findOne
      .mockResolvedValueOnce(identidad({ ad_usuario: 'otra.cuenta' }))
      .mockResolvedValueOnce(null);
    await expect(usuariosAd.resolverIdentidad({ adUsuario: 'agomez', email: 'ana@x.co' }))
      .rejects.toMatchObject({ code: 'CORREO_CON_OTRO_AD' });
  });

  test('edición: usa la identidad actual y permite cambiar la cuenta', async () => {
    const actual = identidad({ id_identidad: 7, ad_usuario: 'vieja' });
    OrgIdentidad.findByPk.mockResolvedValue(actual);
    OrgIdentidad.findOne.mockResolvedValue(null);
    const id = await usuariosAd.resolverIdentidad({
      adUsuario: 'agomez', email: 'ana@x.co', idIdentidadActual: 7, permitirCambio: true
    });
    expect(id).toBe(7);
    expect(actual.update).toHaveBeenCalledWith({ ad_usuario: 'agomez' });
  });
});

describe('adUsuariosPorIdentidad', () => {
  test('devuelve un Map id → ad_usuario y no consulta si no hay ids', async () => {
    expect((await usuariosAd.adUsuariosPorIdentidad([null, undefined])).size).toBe(0);
    expect(OrgIdentidad.findAll).not.toHaveBeenCalled();

    OrgIdentidad.findAll.mockResolvedValue([{ id_identidad: 1, ad_usuario: 'agomez' }, { id_identidad: 2, ad_usuario: null }]);
    const mapa = await usuariosAd.adUsuariosPorIdentidad([1, 2, 1]);
    expect(mapa.get(1)).toBe('agomez');
    expect(mapa.get(2)).toBeNull();
  });
});
