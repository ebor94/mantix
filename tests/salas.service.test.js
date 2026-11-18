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

describe('atender', () => {
  const t = { commit: jest.fn(), rollback: jest.fn() };

  function prospectoCompleto(prosp_id, prosp_asesor_id) {
    return {
      prosp_id, prosp_area_id: 1, prosp_grupo_id: 1, prosp_asesor_id, prosp_prox_gestion_fecha: '2026-11-20',
      persona: { persona_nombre: 'Marta Gomez', persona_apellido: null, persona_telefono_principal: '3001234567' },
      asesor: prosp_asesor_id === 7 ? { usr_nombre: 'Denis', usr_apellido: 'Moreno' } : { usr_nombre: 'Carmen', usr_apellido: 'Contreras' },
      estado: { estado_nombre: 'Nuevo' }
    };
  }

  beforeEach(() => {
    t.commit.mockReset(); t.rollback.mockReset(); delete t.finished;
    M.sequelize.transaction.mockResolvedValue(t);
    repo.obtener.mockResolvedValue(H(55));
    M.SvSalaContratante.findOne.mockResolvedValue(null);
    M.SvGestion.findOne.mockResolvedValue(null);
  });

  test('403 para supervisor', async () => {
    await esperarError(salas.atender(55, SUPERVISOR, {}), 'FORBIDDEN', 403);
  });

  test('404 si el homenaje no existe', async () => {
    repo.obtener.mockResolvedValue(null);
    await esperarError(salas.atender(55, ASESOR, {}), 'HOMENAJE_NO_ENCONTRADO', 404);
  });

  test('409 si el homenaje finalizó', async () => {
    repo.obtener.mockResolvedValue(H(55, { estado: 'FINALIZADO' }));
    await esperarError(salas.atender(55, ASESOR, {}), 'HOMENAJE_CERRADO', 409);
  });

  test('con vínculo existente lo devuelve sin crear nada', async () => {
    M.SvSalaContratante.findOne.mockResolvedValue({ sc_homenaje_sala_id: 55, sc_prosp_id: 901 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(901, 8));
    M.SvGestion.findOne.mockResolvedValue({ gest_fecha_hora: '2026-11-18T10:40:00', gest_canal: 'visita_sala', resultado: { resultado_nombre: 'No interesado' } });

    const r = await salas.atender(55, ASESOR, {});

    expect(r).toEqual({
      prosp_id: 901, prosp_area_id: 1, prosp_grupo_id: 1, es_mio: false, creado: false,
      persona_nombre: 'Marta Gomez', persona_telefono: '3001234567',
      resumen: {
        duenio_nombre: 'Carmen Contreras', estado_nombre: 'Nuevo', prox_gestion_fecha: '2026-11-20',
        ultima_gestion: { fecha_hora: '2026-11-18T10:40:00', canal: 'visita_sala', resultado_nombre: 'No interesado' }
      }
    });
    expect(M.sequelize.transaction).not.toHaveBeenCalled();
  });

  test('cliente nuevo: crea persona, prospecto y vínculo', async () => {
    const personas = require('../src/sv/services/personas.service');
    personas.buscarPorTelefono.mockResolvedValue(null);
    personas.crear.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue(null);
    M.SvProspecto.create.mockResolvedValue({ prosp_id: 905 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(905, 7));

    const r = await salas.atender(55, ASESOR, {});

    expect(personas.buscarPorTelefono).toHaveBeenCalledWith('3001234567');
    expect(personas.crear).toHaveBeenCalledWith({ persona_nombre: 'Marta Gomez', persona_telefono_principal: '3001234567' });
    expect(M.SvProspecto.create).toHaveBeenCalledWith({
      prosp_area_id: 1, prosp_grupo_id: 1, prosp_persona_id: 500, prosp_asesor_id: 7,
      prosp_estado_id: 11, prosp_fuente_id: 40
    }, { transaction: t });
    expect(M.SvSalaContratante.create).toHaveBeenCalledWith(
      { sc_homenaje_sala_id: 55, sc_prosp_id: 905, sc_usr_id: 7 }, { transaction: t });
    expect(t.commit).toHaveBeenCalled();
    expect(r.creado).toBe(true);
    expect(r.es_mio).toBe(true);
  });

  test('toma el primer número válido cuando la asistencia trae varios', async () => {
    const personas = require('../src/sv/services/personas.service');
    repo.obtener.mockResolvedValue(H(55, { contratante_telefono: 'fijo / 310 987 6543 / 3001234567' }));
    personas.buscarPorTelefono.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 905 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(905, 7));
    await salas.atender(55, ASESOR, {});
    expect(personas.buscarPorTelefono).toHaveBeenCalledWith('3109876543');
  });

  test('usa el teléfono escrito cuando la asistencia no trae uno válido', async () => {
    const personas = require('../src/sv/services/personas.service');
    repo.obtener.mockResolvedValue(H(55, { contratante_telefono: '' }));
    personas.buscarPorTelefono.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 905 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(905, 7));
    await salas.atender(55, ASESOR, { telefono: '312 555 0101' });
    expect(personas.buscarPorTelefono).toHaveBeenCalledWith('3125550101');
  });

  test('422 TELEFONO_REQUERIDO sin teléfono válido', async () => {
    repo.obtener.mockResolvedValue(H(55, { contratante_telefono: 'no tiene' }));
    await esperarError(salas.atender(55, ASESOR, { telefono: '12' }), 'TELEFONO_REQUERIDO', 422);
  });

  test('422 NOMBRE_REQUERIDO sin nombre', async () => {
    repo.obtener.mockResolvedValue(H(55, { contratante_nombre: '  ' }));
    await esperarError(salas.atender(55, ASESOR, {}), 'NOMBRE_REQUERIDO', 422);
  });

  test('usa el nombre escrito cuando la asistencia no trae', async () => {
    const personas = require('../src/sv/services/personas.service');
    repo.obtener.mockResolvedValue(H(55, { contratante_nombre: null }));
    personas.buscarPorTelefono.mockResolvedValue(null);
    personas.crear.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 905 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(905, 7));
    await salas.atender(55, ASESOR, { nombre: 'ana lucía rojas' });
    expect(personas.crear).toHaveBeenCalledWith({ persona_nombre: 'Ana Lucía Rojas', persona_telefono_principal: '3001234567' });
  });

  test('cliente de Prenecesidad de otro asesor: lo vincula sin crear prospecto', async () => {
    const personas = require('../src/sv/services/personas.service');
    personas.buscarPorTelefono.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 901 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(901, 8));

    const r = await salas.atender(55, ASESOR, {});

    expect(M.SvProspecto.findOne).toHaveBeenCalledWith({
      where: { prosp_persona_id: 500, prosp_area_id: 1, prosp_activo: 1 },
      order: [['prosp_created_at', 'DESC']],
      transaction: t
    });
    expect(M.SvProspecto.create).not.toHaveBeenCalled();
    expect(M.SvSalaContratante.create).toHaveBeenCalledWith(
      { sc_homenaje_sala_id: 55, sc_prosp_id: 901, sc_usr_id: 7 }, { transaction: t });
    expect(r.es_mio).toBe(false);
    expect(r.creado).toBe(false);
  });

  test('persona creada al mismo tiempo (DUPLICATE_PHONE): reutiliza la existente', async () => {
    const personas = require('../src/sv/services/personas.service');
    personas.buscarPorTelefono.mockResolvedValue(null);
    const dup = new Error('DUPLICATE_PHONE'); dup.code = 'DUPLICATE_PHONE'; dup.persona = { persona_id: 501 };
    personas.crear.mockRejectedValue(dup);
    M.SvProspecto.findOne.mockResolvedValue(null);
    M.SvProspecto.create.mockResolvedValue({ prosp_id: 906 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(906, 7));
    await salas.atender(55, ASESOR, {});
    expect(M.SvProspecto.create.mock.calls[0][0].prosp_persona_id).toBe(501);
  });

  test('dos asesores al mismo tiempo: revierte y devuelve el vínculo ganador', async () => {
    const personas = require('../src/sv/services/personas.service');
    personas.buscarPorTelefono.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue(null);
    M.SvProspecto.create.mockResolvedValue({ prosp_id: 907 });
    const choque = new Error('Duplicate entry'); choque.name = 'SequelizeUniqueConstraintError';
    M.SvSalaContratante.create.mockRejectedValue(choque);
    M.SvSalaContratante.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sc_homenaje_sala_id: 55, sc_prosp_id: 901 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(901, 8));

    const r = await salas.atender(55, ASESOR, {});

    expect(t.rollback).toHaveBeenCalled();
    expect(t.commit).not.toHaveBeenCalled();
    expect(r.prosp_id).toBe(901);
    expect(r.creado).toBe(false);
  });

  test('si el COMMIT falla no intenta revertir y propaga el error real', async () => {
    const personas = require('../src/sv/services/personas.service');
    personas.buscarPorTelefono.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 905 });
    const perdido = new Error('commit perdido');
    t.commit.mockImplementation(async () => { t.finished = 'commit'; throw perdido; });
    await expect(salas.atender(55, ASESOR, {})).rejects.toBe(perdido);
    expect(t.rollback).not.toHaveBeenCalled();
  });

  test('si el rollback falla tras un choque de clave única, igual devuelve el ganador', async () => {
    const personas = require('../src/sv/services/personas.service');
    const logger = require('../src/utils/logger');
    personas.buscarPorTelefono.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 901 });
    const choque = new Error('Duplicate entry'); choque.name = 'SequelizeUniqueConstraintError';
    M.SvSalaContratante.create.mockRejectedValue(choque);
    t.rollback.mockRejectedValue(new Error('conexión caída'));
    M.SvSalaContratante.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sc_homenaje_sala_id: 55, sc_prosp_id: 901 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(901, 8));

    const r = await salas.atender(55, ASESOR, {});

    expect(r.prosp_id).toBe(901);
    expect(r.creado).toBe(false);
    expect(logger.warn.mock.calls.map((c) => c[0]).some((l) => l.includes('rollback falló'))).toBe(true);
  });

  test('persona creada al mismo tiempo (clave única): reutiliza la persona encontrada', async () => {
    const personas = require('../src/sv/services/personas.service');
    personas.buscarPorTelefono
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ persona_id: 502 });
    const choque = new Error('Duplicate entry'); choque.name = 'SequelizeUniqueConstraintError';
    personas.crear.mockRejectedValue(choque);
    M.SvProspecto.findOne.mockResolvedValue(null);
    M.SvProspecto.create.mockResolvedValue({ prosp_id: 908 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(908, 7));
    await salas.atender(55, ASESOR, {});
    expect(M.SvProspecto.create.mock.calls[0][0].prosp_persona_id).toBe(502);
  });

  test('un choque de clave única sin ganador se propaga', async () => {
    const personas = require('../src/sv/services/personas.service');
    personas.buscarPorTelefono.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 901 });
    const choque = new Error('Duplicate entry'); choque.name = 'SequelizeUniqueConstraintError';
    M.SvSalaContratante.create.mockRejectedValue(choque);
    M.SvSalaContratante.findOne.mockResolvedValue(null);
    await expect(salas.atender(55, ASESOR, {})).rejects.toBe(choque);
  });

  test('un error inesperado revierte y se propaga', async () => {
    const personas = require('../src/sv/services/personas.service');
    personas.buscarPorTelefono.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockRejectedValue(new Error('db caída'));
    await expect(salas.atender(55, ASESOR, {})).rejects.toThrow('db caída');
    expect(t.rollback).toHaveBeenCalled();
  });

  test('el log lleva solo identificadores', async () => {
    const personas = require('../src/sv/services/personas.service');
    const logger = require('../src/utils/logger');
    personas.buscarPorTelefono.mockResolvedValue({ persona_id: 500 });
    M.SvProspecto.findOne.mockResolvedValue(null);
    M.SvProspecto.create.mockResolvedValue({ prosp_id: 905 });
    M.SvProspecto.findByPk.mockResolvedValue(prospectoCompleto(905, 7));
    await salas.atender(55, ASESOR, {});
    const linea = logger.info.mock.calls.map((c) => c[0]).find((l) => l.includes('SALA_ATENDER'));
    expect(linea).toBe('[SALA_ATENDER] homenaje_sala_id=55 prosp_id=905 usr_id=7 creado=true');
    expect(linea).not.toMatch(/3001234567|Marta/i);
  });
});

describe('registrarVisita', () => {
  const RESULTADO = { resultado_id: 3, resultado_requiere_fecha: 0 };
  const BODY = { gest_resultado_id: 3, gest_comentario: 'Habló con la hija' };

  beforeEach(() => {
    repo.obtener.mockResolvedValue(H(57));
    M.SvSalaContratante.findOne.mockResolvedValue({ sc_homenaje_sala_id: 57, sc_prosp_id: 901 });
    M.SvProspecto.findByPk.mockResolvedValue({ prosp_id: 901, prosp_activo: 1 });
    M.SvResultado.findOne.mockResolvedValue(RESULTADO);
    require('../src/sv/services/gestiones.service').crear.mockResolvedValue({ gest_id: 77 });
  });

  test('403 para supervisor', async () => {
    await esperarError(salas.registrarVisita(57, SUPERVISOR, BODY), 'FORBIDDEN', 403);
  });

  test('409 HOMENAJE_CERRADO', async () => {
    repo.obtener.mockResolvedValue(H(57, { estado: 'FINALIZADO' }));
    await esperarError(salas.registrarVisita(57, ASESOR, BODY), 'HOMENAJE_CERRADO', 409);
  });

  test('409 SIN_ATENDER', async () => {
    M.SvSalaContratante.findOne.mockResolvedValue(null);
    await esperarError(salas.registrarVisita(57, ASESOR, BODY), 'SIN_ATENDER', 409);
  });

  test('409 CLIENTE_INACTIVO', async () => {
    M.SvProspecto.findByPk.mockResolvedValue({ prosp_id: 901, prosp_activo: 0 });
    await esperarError(salas.registrarVisita(57, ASESOR, BODY), 'CLIENTE_INACTIVO', 409);
  });

  test('422 RESULTADO_INVALIDO si no es de telemercadeo', async () => {
    M.SvResultado.findOne.mockResolvedValue(null);
    await esperarError(salas.registrarVisita(57, ASESOR, BODY), 'RESULTADO_INVALIDO', 422);
    expect(M.SvResultado.findOne).toHaveBeenCalledWith({
      where: { resultado_id: 3, resultado_grupo_id: 1, resultado_activo: 1 }
    });
  });

  test('422 ESTADO_INVALIDO si el estado no es de telemercadeo', async () => {
    await esperarError(salas.registrarVisita(57, ASESOR, { ...BODY, gest_estado_nuevo_id: 99 }), 'ESTADO_INVALIDO', 422);
  });

  test('422 PROX_FECHA_REQUERIDA cuando el resultado la pide', async () => {
    M.SvResultado.findOne.mockResolvedValue({ resultado_id: 3, resultado_requiere_fecha: 1 });
    await esperarError(salas.registrarVisita(57, ASESOR, BODY), 'PROX_FECHA_REQUERIDA', 422);
  });

  test('crea la gestión con visita_sala, el homenaje y el asesor de la sesión', async () => {
    const gestiones = require('../src/sv/services/gestiones.service');
    M.SvEstado.findOne.mockImplementation(async ({ where }) => (where.estado_id === 12 ? { estado_id: 12 } : { estado_id: 11 }));

    const g = await salas.registrarVisita(57, ASESOR, {
      ...BODY, gest_estado_nuevo_id: 12, gest_prox_fecha: '2026-11-25', gest_prox_hora: '10:00',
      gest_prosp_id: 1, gest_asesor_id: 99, gest_canal: 'llamada'
    });

    expect(g).toEqual({ gest_id: 77 });
    expect(gestiones.crear).toHaveBeenCalledWith({
      gest_prosp_id: 901,
      gest_canal: 'visita_sala',
      gest_homenaje_sala_id: 57,
      gest_resultado_id: 3,
      gest_estado_nuevo_id: 12,
      gest_comentario: 'Habló con la hija',
      gest_prox_fecha: '2026-11-25',
      gest_prox_hora: '10:00'
    }, 7);
  });

  test('el log lleva solo identificadores', async () => {
    const logger = require('../src/utils/logger');
    await salas.registrarVisita(57, ASESOR, BODY);
    const linea = logger.info.mock.calls.map((c) => c[0]).find((l) => l.includes('SALA_VISITA'));
    expect(linea).toBe('[SALA_VISITA] homenaje_sala_id=57 prosp_id=901 usr_id=7');
  });
});
