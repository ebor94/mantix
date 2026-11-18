/**
 * prospectos.service.obtenerAlcance: carga liviana para decidir el alcance.
 */
jest.mock('../src/sv/models', () => ({
  sequelize: {},
  SvProspecto: { findByPk: jest.fn() },
  SvProspectoProducto: {}, SvPersona: {}, SvUsuario: {}, SvEstado: {}, SvFuente: {},
  SvPunto: {}, SvLista: {}, SvGestion: {}, SvResultado: {}, SvEmpresa: {}
}));

const { SvProspecto } = require('../src/sv/models');
const { obtenerAlcance } = require('../src/sv/services/prospectos.service');

test('carga solo los campos del alcance, sin include', async () => {
  const fila = { prosp_id: 5, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 };
  SvProspecto.findByPk.mockResolvedValue(fila);
  await expect(obtenerAlcance(5)).resolves.toBe(fila);
  expect(SvProspecto.findByPk).toHaveBeenCalledWith(5, {
    attributes: ['prosp_id', 'prosp_asesor_id', 'prosp_grupo_id', 'prosp_area_id']
  });
});

test('prospecto inexistente → null', async () => {
  SvProspecto.findByPk.mockResolvedValue(null);
  await expect(obtenerAlcance(999)).resolves.toBeNull();
});
