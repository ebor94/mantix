/**
 * personas.service: consultas de alcance y de la lista cross-área. Modelos
 * simulados con jest.mock: nunca toca la base.
 */
jest.mock('../src/sv/models', () => ({
  SvPersona:   { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  SvProspecto: { findAll: jest.fn() },
  SvGestion:   { findAll: jest.fn() },
  SvArea: {}, SvGrupo: {}, SvEstado: {}, SvUsuario: {},
  SvResultado: {}, SvFuente: {}, SvEmpresa: {}
}));

const { Op } = require('sequelize');
const { SvProspecto } = require('../src/sv/models');
const personas = require('../src/sv/services/personas.service');

beforeEach(() => {
  jest.clearAllMocks();
  SvProspecto.findAll.mockResolvedValue([]);
});

describe('alcancesDePersona', () => {
  test('titular o contacto, activos e inactivos, solo los 4 campos del alcance', async () => {
    const filas = [{ prosp_id: 1, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 }];
    SvProspecto.findAll.mockResolvedValue(filas);

    await expect(personas.alcancesDePersona(7)).resolves.toBe(filas);

    expect(SvProspecto.findAll).toHaveBeenCalledTimes(1);
    const opts = SvProspecto.findAll.mock.calls[0][0];
    expect(opts.where[Op.or]).toEqual([{ prosp_persona_id: 7 }, { prosp_contacto_empresa_id: 7 }]);
    expect(opts.where).not.toHaveProperty('prosp_activo');
    expect(opts.attributes).toEqual(['prosp_id', 'prosp_asesor_id', 'prosp_grupo_id', 'prosp_area_id']);
    expect(opts.include).toBeUndefined();
  });
});

describe('prospectosActivos: solo los campos que pinta el aviso cross-área', () => {
  test('mismo filtro y orden, atributos del prospecto recortados', async () => {
    await personas.prospectosActivos(7);

    const opts = SvProspecto.findAll.mock.calls[0][0];
    expect(opts.where.prosp_activo).toBe(1);
    expect(opts.where[Op.or]).toEqual([{ prosp_persona_id: 7 }, { prosp_contacto_empresa_id: 7 }]);
    expect(opts.order).toEqual([['prosp_updated_at', 'DESC']]);
    expect(opts.attributes).toEqual([
      'prosp_id', 'prosp_area_id', 'prosp_grupo_id', 'prosp_estado_id',
      'prosp_asesor_id', 'prosp_empresa_id', 'prosp_subproceso',
      'prosp_prox_gestion_fecha', 'prosp_prox_gestion_hora', 'prosp_updated_at'
    ]);
  });

  test('asesor sin correo, empresa sin NIT y sin fuente', async () => {
    await personas.prospectosActivos(7);

    const { include } = SvProspecto.findAll.mock.calls[0][0];
    const porAlias = Object.fromEntries(include.map(i => [i.as, i]));
    expect(Object.keys(porAlias).sort()).toEqual(['area', 'asesor', 'empresa', 'estado', 'grupo']);
    expect(porAlias.asesor.attributes).toEqual(['usr_id', 'usr_nombre', 'usr_apellido']);
    expect(porAlias.empresa.attributes).toEqual(['empresa_id', 'empresa_razon_social']);
    expect(porAlias.area.attributes).toEqual(['area_id', 'area_codigo', 'area_nombre', 'area_color_hex', 'area_icono']);
    expect(porAlias.grupo.attributes).toEqual(['grupo_id', 'grupo_codigo', 'grupo_nombre']);
    expect(porAlias.estado.attributes).toEqual([
      'estado_id', 'estado_codigo', 'estado_nombre', 'estado_color_hex', 'estado_es_final', 'estado_es_ganado'
    ]);
  });
});
