// Mocks compartidos por las Tasks 3, 4 y 5 (listar/obtener, atender, visitas).
jest.mock('../src/sv/models', () => ({
  sequelize: { transaction: jest.fn() },
  SvArea: { findOne: jest.fn() },
  SvGrupo: { findOne: jest.fn() },
  SvFuente: { findOne: jest.fn() },
  SvEstado: { findOne: jest.fn() },
  SvResultado: { findOne: jest.fn() },
  SvProspecto: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  SvPersona: {},
  SvUsuario: {},
  SvGestion: { findAll: jest.fn(), findOne: jest.fn() },
  SvSalaContratante: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() }
}));
jest.mock('../src/sv/services/homenajesSala.repo', () => ({
  listarEnCurso: jest.fn(),
  obtener: jest.fn(),
  estaEnCurso: jest.fn((h) => !!h && h.estado !== 'FINALIZADO')
}));
jest.mock('../src/sv/services/personas.service', () => ({ buscarPorTelefono: jest.fn(), crear: jest.fn() }));
jest.mock('../src/sv/services/gestiones.service', () => ({ crear: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const M = require('../src/sv/models');
const repo = require('../src/sv/services/homenajesSala.repo');
const salas = require('../src/sv/services/salas.service');
const SalaError = require('../src/sv/services/salaError');

const ASESOR     = { usr_id: 7, usr_area_id: 1, rol: { rol_codigo: 'ASESOR' } };
const SUPERVISOR = { usr_id: 3, usr_area_id: 1, rol: { rol_codigo: 'SUPERVISOR' } };
const AJENO      = { usr_id: 20, usr_area_id: 2, rol: { rol_codigo: 'ASESOR' } };
const ADMIN      = { usr_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } };

const H = (id, extra = {}) => ({
  id, estado: 'ABIERTO', registrado_at: '2026-11-18T09:00:00',
  sala_nombre: 'Sala 3', sede_nombre: 'Sede Norte', asistencia_codigo: 'A-1',
  nombre_ser_querido: 'Luis Pérez', contrato: 'C-9',
  contratante_nombre: 'MARTA GOMEZ', contratante_telefono: '300 123 4567', ...extra
});

function catalogosOk() {
  M.SvArea.findOne.mockResolvedValue({ area_id: 1 });
  M.SvGrupo.findOne.mockResolvedValue({ grupo_id: 1 });
  M.SvFuente.findOne.mockResolvedValue({ fuente_id: 40 });
  // Sin estado_id en el where = búsqueda del estado inicial del grupo.
  M.SvEstado.findOne.mockImplementation(async ({ where }) => (where.estado_id ? null : { estado_id: 11 }));
}

async function esperarError(promesa, code, status) {
  const e = await promesa.then(() => null, (err) => err);
  expect(e).toBeInstanceOf(SalaError);
  expect(e.code).toBe(code);
  expect(e.status).toBe(status);
}

beforeEach(() => {
  jest.resetAllMocks();
  repo.estaEnCurso.mockImplementation((h) => !!h && h.estado !== 'FINALIZADO');
  catalogosOk();
  M.SvSalaContratante.findAll.mockResolvedValue([]);
  M.SvGestion.findAll.mockResolvedValue([]);
});

describe('listar', () => {
  test('403 para un usuario sin acceso a Prenecesidad', async () => {
    await esperarError(salas.listar(AJENO), 'FORBIDDEN', 403);
    expect(repo.listarEnCurso).not.toHaveBeenCalled();
  });

  test('500 CATALOGO_INCOMPLETO si falta la fuente', async () => {
    M.SvFuente.findOne.mockResolvedValue(null);
    await esperarError(salas.listar(ASESOR), 'CATALOGO_INCOMPLETO', 500);
  });

  test('busca los catálogos por código', async () => {
    repo.listarEnCurso.mockResolvedValue([]);
    await salas.listar(ASESOR);
    expect(M.SvArea.findOne).toHaveBeenCalledWith({ where: { area_codigo: 'PRENEC' } });
    expect(M.SvGrupo.findOne).toHaveBeenCalledWith({ where: { grupo_codigo: 'TELEMERCADEO', grupo_area_id: 1 } });
    expect(M.SvFuente.findOne).toHaveBeenCalledWith({ where: { fuente_codigo: 'SALA_VELACION', fuente_area_id: 1 } });
  });

  test('sin homenajes devuelve [] sin consultar vínculos', async () => {
    repo.listarEnCurso.mockResolvedValue([]);
    expect(await salas.listar(ASESOR)).toEqual([]);
    expect(M.SvSalaContratante.findAll).not.toHaveBeenCalled();
  });

  test('arma cliente, visitas y puede_atender', async () => {
    repo.listarEnCurso.mockResolvedValue([H(55), H(56), H(57)]);
    M.SvSalaContratante.findAll.mockResolvedValue([
      { sc_homenaje_sala_id: 56, sc_prosp_id: 900,
        prospecto: { prosp_id: 900, prosp_asesor_id: 7, asesor: { usr_nombre: 'Denis', usr_apellido: 'Moreno' }, estado: { estado_nombre: 'Interesado' } } },
      { sc_homenaje_sala_id: 57, sc_prosp_id: 901,
        prospecto: { prosp_id: 901, prosp_asesor_id: 8, asesor: { usr_nombre: 'Carmen', usr_apellido: 'Contreras' }, estado: { estado_nombre: 'Contactado' } } }
    ]);
    M.SvGestion.findAll.mockResolvedValue([
      { gest_homenaje_sala_id: 57, gest_fecha_hora: '2026-11-18T15:05:00', asesor: { usr_nombre: 'Denis', usr_apellido: 'Moreno' } },
      { gest_homenaje_sala_id: 57, gest_fecha_hora: '2026-11-18T10:40:00', asesor: { usr_nombre: 'Carmen', usr_apellido: 'Contreras' } }
    ]);

    const [a, b, c] = await salas.listar(ASESOR);

    expect(a.cliente).toBeNull();
    expect(a.visitas).toEqual([]);
    expect(a.puede_atender).toBe(true);
    expect(a.sala_nombre).toBe('Sala 3');
    expect(b.cliente).toEqual({ prosp_id: 900, es_mio: true, duenio_nombre: 'Denis Moreno', estado_nombre: 'Interesado' });
    expect(c.cliente).toEqual({ prosp_id: 901, es_mio: false, duenio_nombre: 'Carmen Contreras', estado_nombre: 'Contactado' });
    expect(c.visitas).toEqual([
      { asesor_nombre: 'Denis Moreno', fecha_hora: '2026-11-18T15:05:00' },
      { asesor_nombre: 'Carmen Contreras', fecha_hora: '2026-11-18T10:40:00' }
    ]);
    const consultaVisitas = M.SvGestion.findAll.mock.calls[0][0];
    expect(consultaVisitas.order).toEqual([['gest_fecha_hora', 'DESC']]);
  });

  test('supervisor y super admin ven la lista sin poder atender', async () => {
    repo.listarEnCurso.mockResolvedValue([H(55)]);
    expect((await salas.listar(SUPERVISOR))[0].puede_atender).toBe(false);
    expect((await salas.listar(ADMIN))[0].puede_atender).toBe(false);
  });
});

describe('obtener', () => {
  test('404 si el homenaje no existe', async () => {
    repo.obtener.mockResolvedValue(null);
    await esperarError(salas.obtener(99, ASESOR), 'HOMENAJE_NO_ENCONTRADO', 404);
  });

  test('403 sin acceso a Prenecesidad', async () => {
    await esperarError(salas.obtener(55, AJENO), 'FORBIDDEN', 403);
  });

  test('devuelve el homenaje armado', async () => {
    repo.obtener.mockResolvedValue(H(55));
    const item = await salas.obtener(55, ASESOR);
    expect(item.id).toBe(55);
    expect(item.cliente).toBeNull();
    expect(item.puede_atender).toBe(true);
  });
});
