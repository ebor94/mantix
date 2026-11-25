/** proximosCumpleanos usa el día de Colombia. */
jest.mock('../src/sv/models', () => ({
  sequelize: {}, SvContactoFideliz: { findAll: jest.fn() }, SvFechaEspecial: {}, SvEnvio: { findAll: jest.fn(async () => []) },
  SvPersona: {}, SvEmpresa: {}, SvUsuario: {}, SvProspecto: {}, SvEstado: {}, SvGrupo: {}
}));
jest.mock('../src/sv/services/personas.service', () => ({}));

const { SvContactoFideliz } = require('../src/sv/models');
const { proximosCumpleanos } = require('../src/sv/services/fidelizacion.service');

afterEach(() => jest.useRealTimers());

test('a las 8:30 p. m. del 25, el cumpleaños del 25 aparece con 0 días', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-26T01:30:00Z'));
  SvContactoFideliz.findAll.mockResolvedValue([{
    cf_id: 1, cf_cargo: 'x', empresa: null,
    persona: { persona_id: 1, persona_nombre: 'A', persona_apellido: 'B', persona_genero: 'N', persona_fecha_nacimiento: '1990-11-25', fechasEspeciales: [] }
  }]);
  const r = await proximosCumpleanos({ dias: 3 });
  const lista = Array.isArray(r) ? r : (r.eventos || r.data || []);
  expect(lista.some(e => e.dias_restantes === 0 && e.fecha_evento === '2026-11-25')).toBe(true);
});
