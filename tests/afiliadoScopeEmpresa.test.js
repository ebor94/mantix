/**
 * Task 4.3 — whereConFiltroEmpresa (src/services/afiliado.service.js) y su
 * composición con whereConFiltroAsesor (Task 1) en getAllAfiliados /
 * getAfiliadoById, vía whereConFiltroAsesorYEmpresa.
 *
 * whereConFiltroEmpresa se aplica SIEMPRE después de whereConFiltroAsesor:
 * este último decide si el usuario ve todo (super_admin / ver_todas) o solo
 * lo suyo (asesorId); whereConFiltroEmpresa solo puede angostar ese
 * resultado más, nunca ampliarlo. EXCEPCIÓN: un usuario con
 * `empresa.ver_afiliaciones` (RRHH puro) se salta whereConFiltroAsesor por
 * completo — ver el segundo IMPORTANTE de abajo.
 *
 * IMPORTANTE #1 (fix de regresión): whereConFiltroEmpresa tiene su PROPIO
 * criterio de bypass, independiente del de whereConFiltroAsesor — solo
 * bypassea con `es_super_admin`, NUNCA con `afiliaciones.ver_todas`. Antes
 * del fix, ambos filtros compartían el mismo flag `ver_todas` como bypass,
 * lo que significaba que un usuario con `empresa_id` seteado Y `ver_todas`
 * otorgado veía TODAS las empresas — justo lo que este filtro debe impedir.
 * El test "usuario con empresa_id y ver_todas" de abajo es la prueba de
 * regresión que cierra ese hueco: con empresa_id, ver_todas solo bypassea el
 * filtro de asesor, nunca el de empresa.
 *
 * IMPORTANTE #2 (fix de regresión): whereConFiltroAsesor SIEMPRE agrega
 * `asesorId = usuario.id` salvo super_admin/ver_todas — incluso para un
 * usuario RRHH que jamás posee una fila con ese asesorId (no crea
 * afiliaciones como asesor). Sin ajuste, esto dejaba los listados de un
 * RRHH puro SIEMPRE vacíos contra una BD real, aunque la ruta ya lo dejara
 * pasar (Fix 2 de la ronda de revisión). whereConFiltroAsesorYEmpresa ahora
 * detecta el permiso `empresa.ver_afiliaciones` y, solo para ese perfil,
 * aplica ÚNICAMENTE whereConFiltroEmpresa — whereConFiltroAsesor en sí no se
 * modifica, solo deja de invocarse para este caso puntual. Los tests
 * "REGRESIÓN (Fix 2)" de abajo verifican esto en getAllAfiliados y en
 * getAfiliadoById.
 *
 * Se mockea la capa de modelos, mismo patrón que tests/afiliadoScope.test.js.
 */

const mockAfiliado = {
  findAll: jest.fn(),
  findOne: jest.fn()
};

jest.mock('../src/models', () => ({
  sequelize: {},
  Afiliado: mockAfiliado,
  Beneficiario: {},
  Empresa: {},
  Convenio: {},
  Seguro: {},
  ContratoValor: {},
  Tarifa: {},
  Trazabilidad: {},
  Usuario: {}
}));

jest.mock('../src/services/invitacion.service', () => ({
  marcarUsada: jest.fn()
}));

const afiliadoService = require('../src/services/afiliado.service');

beforeEach(() => {
  mockAfiliado.findAll.mockReset().mockResolvedValue([]);
  mockAfiliado.findOne.mockReset().mockResolvedValue(null);
});

describe('whereConFiltroEmpresa — composición vía getAllAfiliados', () => {
  test('usuario sin empresa_id: no se restringe por este filtro (queda igual que solo whereConFiltroAsesor)', async () => {
    const usuario = { id: 7, es_super_admin: false, rol: { permisos: { afiliaciones: {} } } };
    await afiliadoService.getAllAfiliados(usuario);
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    // Solo el filtro de asesor (Task 1); sin empresaId.
    expect(where).toEqual({ asesorId: 7 });
  });

  test('REGRESIÓN — usuario con empresa_id y ver_todas: sigue restringido a su empresa (ver_todas solo bypassea el filtro de asesor, NUNCA el de empresa)', async () => {
    // Antes del fix, whereConFiltroEmpresa compartía el mismo bypass
    // (`afiliaciones.ver_todas`) que whereConFiltroAsesor, así que este caso
    // devolvía `{}` — visibilidad de TODAS las empresas. Ese era el hueco de
    // seguridad: ver_todas es la dimensión "todos los asesores", no la
    // dimensión "todas las empresas". Tras el fix, empresaId se preserva.
    const usuario = {
      id: 9,
      es_super_admin: false,
      empresa_id: 3,
      rol: { permisos: { afiliaciones: { ver_todas: true } } }
    };
    await afiliadoService.getAllAfiliados(usuario);
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    expect(where).toEqual({ empresaId: 3 });
  });

  test('usuario con empresa_id, SIN ver_todas: se agrega empresaId (además del asesorId que ya puso whereConFiltroAsesor)', async () => {
    // Caso típico de un usuario híbrido (asesor + RRHH) o de defensa en
    // profundidad: whereConFiltroAsesor ya restringe por asesorId; el filtro
    // de empresa angosta aún más, nunca lo reemplaza.
    const usuario = {
      id: 11,
      es_super_admin: false,
      empresa_id: 5,
      rol: { permisos: { afiliaciones: {} } }
    };
    await afiliadoService.getAllAfiliados(usuario);
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    expect(where).toEqual({ asesorId: 11, empresaId: 5 });
  });

  test('REGRESIÓN (Fix 2) — usuario RRHH puro (permiso empresa.ver_afiliaciones, SIN ninguna clave bajo afiliaciones): solo empresaId, NUNCA asesorId', async () => {
    // whereConFiltroAsesor SIEMPRE agrega `asesorId = usuario.id` salvo
    // super_admin/ver_todas — pero un usuario RRHH puro no es un asesor, así
    // que ninguna fila tendría jamás ese asesorId. Si la composición aplicara
    // whereConFiltroAsesor aquí (como antes de este fix), el resultado
    // combinado `{ asesorId: 30, empresaId: 12 }` sería, en la práctica,
    // SIEMPRE vacío contra una BD real — dejando el permiso
    // `empresa.ver_afiliaciones` inútil pese a que la ruta ya lo deje pasar
    // (Fix 2, route-level). Tras el fix, para este permiso puntual, la
    // composición aplica SOLO whereConFiltroEmpresa.
    const usuario = {
      id: 30,
      es_super_admin: false,
      empresa_id: 12,
      rol: { permisos: { empresa: { ver_afiliaciones: true } } }
    };
    await afiliadoService.getAllAfiliados(usuario);
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    expect(where).toEqual({ empresaId: 12 });
  });

  test('es_super_admin: sin ningún filtro, tenga o no empresa_id', async () => {
    const usuario = { id: 1, es_super_admin: true, empresa_id: 5 };
    await afiliadoService.getAllAfiliados(usuario);
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    expect(where).toEqual({});
  });

  // Fix 2 (IMPORTANT, ronda de revisión) — el atajo de whereConFiltroAsesorYEmpresa
  // para `empresa.ver_afiliaciones` comprobaba SOLO el permiso, no si
  // `usuario.empresa_id` era realmente verdadero. Si alguna cuenta llegara a
  // tener `ver_afiliaciones: true` con `empresa_id` null/undefined (un error
  // de configuración, no alcanzable hoy por el seed), el atajo devolvía
  // DIRECTAMENTE whereConFiltroEmpresa(baseWhere, usuario) — que sin
  // empresa_id es un no-op — es decir, acceso SIN RESTRICCIÓN a los
  // afiliados de TODAS las empresas. Tras el fix, sin empresa_id verdadero
  // el atajo no se toma: cae al camino normal
  // (whereConFiltroEmpresa(whereConFiltroAsesor(...))), que para este
  // usuario (no super_admin, sin `afiliaciones.ver_todas`) agrega
  // `asesorId = usuario.id` — "no ve nada relevante" es la dirección segura
  // de fallo, nunca "ve todo".
  test('REGRESIÓN (Fix 2) — usuario con empresa.ver_afiliaciones=true pero empresa_id null/undefined: NO obtiene acceso sin restricción, cae al scope por asesorId (fail-closed)', async () => {
    const usuarioSinEmpresaId = {
      id: 40,
      es_super_admin: false,
      empresa_id: null,
      rol: { permisos: { empresa: { ver_afiliaciones: true } } }
    };
    await afiliadoService.getAllAfiliados(usuarioSinEmpresaId);
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    // NUNCA `{}` (acceso sin restricción) — cae al scope normal por asesorId,
    // que para un RRHH sin fila propia como asesor correctamente no devuelve
    // resultados de ninguna otra empresa.
    expect(where).toEqual({ asesorId: 40 });
    expect(where).not.toEqual({});

    mockAfiliado.findAll.mockClear();

    const usuarioEmpresaIdUndefined = {
      id: 41,
      es_super_admin: false,
      rol: { permisos: { empresa: { ver_afiliaciones: true } } }
    };
    await afiliadoService.getAllAfiliados(usuarioEmpresaIdUndefined);
    const { where: whereUndefined } = mockAfiliado.findAll.mock.calls[0][0];
    expect(whereUndefined).toEqual({ asesorId: 41 });
  });
});

describe('getAfiliadoById — scope compuesto (Task 4)', () => {
  test('sin usuario (getByHash / OTP de reenvío): findByPk sin filtro, comportamiento previo intacto', async () => {
    const mockFindByPk = jest.fn().mockResolvedValue({ id: 55 });
    mockAfiliado.findByPk = mockFindByPk;
    await afiliadoService.getAfiliadoById(55);
    expect(mockFindByPk).toHaveBeenCalledWith(55, expect.objectContaining({ include: expect.any(Array) }));
    expect(mockAfiliado.findOne).not.toHaveBeenCalled();
  });

  test('con usuario empresa_id sin permiso empresa.ver_afiliaciones (híbrido/defensa en profundidad): consulta por findOne con id+asesorId+empresaId', async () => {
    const usuario = { id: 20, es_super_admin: false, empresa_id: 8, rol: { permisos: {} } };
    mockAfiliado.findOne.mockResolvedValue(null);
    const result = await afiliadoService.getAfiliadoById(55, usuario);
    expect(mockAfiliado.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55, asesorId: 20, empresaId: 8 } })
    );
    expect(result).toBeNull();
  });

  test('REGRESIÓN (Fix 2) — usuario RRHH puro (empresa.ver_afiliaciones): findOne con id+empresaId, SIN asesorId, así que SÍ puede matchear un afiliado real de su empresa', async () => {
    // Antes de este fix, whereConFiltroAsesor agregaba `asesorId = usuario.id`
    // incondicionalmente para este usuario (no super_admin, no ver_todas),
    // así que el where combinado exigía asesorId=30 AND empresaId=12 — algo
    // que ningún afiliado real cumple para un RRHH puro (no es asesor). El
    // controller getById nunca hubiera llegado a su chequeo manual de
    // permisos (Fix 2) porque el servicio ya habría devuelto null antes.
    const usuario = {
      id: 30,
      es_super_admin: false,
      empresa_id: 12,
      rol: { permisos: { empresa: { ver_afiliaciones: true } } }
    };
    const afiliadoDeSuEmpresa = { id: 55, empresaId: 12, asesorId: 999 };
    mockAfiliado.findOne.mockResolvedValue(afiliadoDeSuEmpresa);
    const result = await afiliadoService.getAfiliadoById(55, usuario);
    expect(mockAfiliado.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55, empresaId: 12 } })
    );
    expect(result).toEqual(afiliadoDeSuEmpresa);
  });

  test('con super_admin: findOne sin filtro adicional más allá del id', async () => {
    const usuario = { id: 1, es_super_admin: true };
    mockAfiliado.findOne.mockResolvedValue({ id: 55 });
    const result = await afiliadoService.getAfiliadoById(55, usuario);
    expect(mockAfiliado.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55 } })
    );
    expect(result).toEqual({ id: 55 });
  });
});
