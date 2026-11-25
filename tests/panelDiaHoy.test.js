/** panelDia sin fecha: "hoy" es el día de Colombia aunque en UTC ya sea mañana. */
jest.mock('../src/sv/models', () => ({
  sequelize: {}, SvProspecto: { findAll: jest.fn() }, SvGestion: { findAll: jest.fn() },
  SvProspectoProducto: {}, SvProducto: {}, SvPersona: {}, SvUsuario: {}, SvEstado: {},
  SvFuente: {}, SvPunto: {}, SvLista: {}, SvResultado: {}, SvEmpresa: {}
}));
jest.mock('../src/sv/services/ventas.service', () => ({}));

const { Op } = require('sequelize');
const { SvProspecto, SvGestion } = require('../src/sv/models');
const { panelDia } = require('../src/sv/services/prospectos.service');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-26T01:30:00Z')); // 25 de nov, 8:30 p. m. en Colombia
  SvProspecto.findAll.mockResolvedValue([]);
  SvGestion.findAll.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

test('sin fecha, "hoy" consulta el 25 y "urgentes" lo anterior al 25', async () => {
  const r = await panelDia({ scope: { crossArea: true } });
  const wheres = SvProspecto.findAll.mock.calls.map(([o]) => o.where.prosp_prox_gestion_fecha);
  expect(wheres).toContainEqual({ [Op.lt]: '2026-11-25' });
  expect(wheres).toContain('2026-11-25');
  expect(SvGestion.findAll.mock.calls[0][0].where.gest_fecha_hora[Op.gte]).toBe('2026-11-25 00:00:00');
  expect(r.fecha).toBe('2026-11-25');
});
