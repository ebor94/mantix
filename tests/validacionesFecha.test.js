/**
 * Los días sin hora llegan a los servicios como texto 'YYYY-MM-DD', no como Date:
 * Sequelize escribiría ese Date (medianoche UTC) en la hora del servidor, el día anterior.
 * Sin base de datos: schemas reales y, en las rutas, servicios simulados.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../src/sv/models', () => ({ SvUsuario: { findAll: jest.fn().mockResolvedValue([]) } }));
jest.mock('../src/sv/services/prospectos.service', () => ({
  list: jest.fn(), obtenerCompleto: jest.fn(), actualizar: jest.fn(), obtenerAlcance: jest.fn()
}));
jest.mock('../src/sv/services/gestiones.service', () => ({
  crear: jest.fn(), historial: jest.fn(), resumenDia: jest.fn()
}));

const prospectos = require('../src/sv/services/prospectos.service');
const gestiones  = require('../src/sv/services/gestiones.service');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');
const crm   = require('../src/sv/validations/crm.validation');
const salas = require('../src/sv/validations/salas.validation');
const pap   = require('../src/sv/validations/pap.validation');
const fidel = require('../src/sv/validations/fidelizacion.validation');
const renov = require('../src/sv/routes/renovaciones.routes').schemas;
const multi = require('../src/sv/validations/eventosMulti.validation');

const PERSONA = { persona_nombre: 'Ana', persona_telefono_principal: '3001234567' };
const EVENTO  = {
  titulo: 'Feria', tipo: 'FERIA', modo_fechas: 'SLOTS', fecha_inicio: '2026-11-20T10:00:00Z',
  asistentes_ids: [1]
};

// [nombre, schema, ruta del campo, cuerpo mínimo válido con ese campo = `v`, ¿acepta null?]
const CAMPOS = [
  ['crm.prospectos.list · prox_gestion_fecha', crm.prospectos.list, ['prox_gestion_fecha'], v => ({ prox_gestion_fecha: v }), false],
  ['crm.prospectos.create · prosp_prox_gestion_fecha', crm.prospectos.create, ['prosp_prox_gestion_fecha'],
    v => ({ prosp_area_id: 1, prosp_grupo_id: 1, prosp_estado_id: 1, prosp_persona_id: 1, prosp_prox_gestion_fecha: v }), true],
  ['crm.prospectos.update · prosp_prox_gestion_fecha', crm.prospectos.update, ['prosp_prox_gestion_fecha'], v => ({ prosp_prox_gestion_fecha: v }), true],
  ['crm.gestiones.create · gest_prox_fecha', crm.gestiones.create, ['gest_prox_fecha'], v => ({ gest_prosp_id: 1, gest_prox_fecha: v }), true],
  ['salas.visita · gest_prox_fecha', salas.visita, ['gest_prox_fecha'], v => ({ gest_resultado_id: 1, gest_prox_fecha: v }), true],
  ['pap.registroRapido · prox_fecha', pap.registroRapido, ['prox_fecha'],
    v => ({ nombre: 'Ana', telefono: '3001234567', resultado_codigo: 'VOLVER', prox_fecha: v }), true],
  ['fidelizacion.crearContacto · persona.persona_fecha_nacimiento', fidel.crearContacto, ['persona', 'persona_fecha_nacimiento'],
    v => ({ persona: { ...PERSONA, persona_fecha_nacimiento: v } }), true],
  ['fidelizacion.crearContacto · fecha_ingreso', fidel.crearContacto, ['fecha_ingreso'], v => ({ persona: PERSONA, fecha_ingreso: v }), true],
  ['fidelizacion.actualizarContacto · cf_fecha_ingreso', fidel.actualizarContacto, ['cf_fecha_ingreso'], v => ({ cf_fecha_ingreso: v }), true],
  ['renovaciones.marcarConvenio · fecha_vencimiento', renov.marcarConvenio, ['fecha_vencimiento'],
    v => ({ fecha_inicio: '2026-11-28', fecha_vencimiento: v }), true],
  ['eventosMulti.crearEvento · slots[0].fecha', multi.crearEvento, ['slots', 0, 'fecha'],
    v => ({ ...EVENTO, slots: [{ fecha: v, hora_inicio: '09:00', hora_fin: '10:00' }] }), false],
  ['eventosMulti.actualizarEvento · slots[0].fecha', multi.actualizarEvento, ['slots', 0, 'fecha'],
    v => ({ slots: [{ fecha: v, hora_inicio: '09:00', hora_fin: '10:00' }] }), false]
];

const leer = (obj, ruta) => ruta.reduce((o, k) => o?.[k], obj);

describe.each(CAMPOS)('%s', (_n, schema, ruta, cuerpo, aceptaNull) => {
  const validar = (v) => schema.validate(cuerpo(v), { abortEarly: false, stripUnknown: true });

  test("'2026-11-28' llega como el texto '2026-11-28'", () => {
    const { error, value } = validar('2026-11-28');
    expect(error).toBeUndefined();
    expect(leer(value, ruta)).toBe('2026-11-28');
  });

  test("año corto '0026-11-28' no se rellena ni se corrompe", () => {
    const { error, value } = validar('0026-11-28');
    expect(error).toBeUndefined();
    expect(leer(value, ruta)).toBe('0026-11-28');
  });

  test.each([
    ['2026-11-28T23:30:00-05:00', '2026-11-28'],
    ['2026-11-29T03:00:00Z', '2026-11-28'],
    ['2026-11-28 23:30:00-05:00', '2026-11-28']
  ])('con hora %s → el día de Colombia %s', (entrada, dia) => {
    const { error, value } = validar(entrada);
    expect(error).toBeUndefined();
    expect(leer(value, ruta)).toBe(dia);
  });

  // '2026-02-30' no se rechaza: Joi (Date) lo corre al 2 de marzo (antes del cambio se guardaba el 1).
  test.each(['28/11/2026', '11/28/2026', 'hoy'])('rechaza %s', (malo) => {
    expect(validar(malo).error).toBeDefined();
  });

  if (aceptaNull) {
    test('null sigue pasando', () => {
      const { error, value } = validar(null);
      expect(error).toBeUndefined();
      expect(leer(value, ruta)).toBeNull();
    });
  }
});

describe('rutas reales con validate', () => {
  const servidores = [];
  async function app() {
    const a = express();
    a.use(express.json());
    a.use((req, res, next) => { req.user = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR' } }; next(); });
    a.use(svAreaGuard);
    a.use('/prospectos', require('../src/sv/routes/prospectos.routes'));
    a.use('/gestiones', require('../src/sv/routes/gestiones.routes'));
    // eslint-disable-next-line no-unused-vars
    a.use((err, req, res, next) => res.status(500).json({ error: err.message }));
    const server = a.listen(0, '127.0.0.1');
    servidores.push(server);
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
    return server;
  }
  afterEach(async () => {
    await Promise.all(servidores.splice(0).map(s => new Promise(resolve => s.close(resolve))));
  });
  beforeEach(() => {
    jest.clearAllMocks();
    prospectos.obtenerCompleto.mockResolvedValue({ prosp_id: 5, prosp_asesor_id: 10 });
    prospectos.actualizar.mockResolvedValue({ prosp_id: 5 });
    prospectos.obtenerAlcance.mockResolvedValue({ prosp_id: 1, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 });
    prospectos.list.mockResolvedValue({ items: [] });
    gestiones.crear.mockResolvedValue({ gest_id: 1 });
  });

  test('PUT /prospectos/:id entrega el texto al servicio', async () => {
    const r = await request(await app()).put('/prospectos/5').send({ prosp_prox_gestion_fecha: '2026-11-28' });
    expect(r.status).toBe(200);
    expect(prospectos.actualizar).toHaveBeenCalledWith(5, { prosp_prox_gestion_fecha: '2026-11-28' });
  });

  test('POST /gestiones entrega el texto al servicio', async () => {
    const r = await request(await app()).post('/gestiones').send({ gest_prosp_id: 1, gest_prox_fecha: '2026-11-28', gest_prox_hora: '09:00' });
    expect(r.status).toBe(201);
    expect(gestiones.crear.mock.calls[0][0].gest_prox_fecha).toBe('2026-11-28');
  });

  test('GET /prospectos?prox_gestion_fecha=2026-11-28 filtra con el texto', async () => {
    const r = await request(await app()).get('/prospectos?prox_gestion_fecha=2026-11-28');
    expect(r.status).toBe(200);
    expect(prospectos.list.mock.calls[0][0].filtros.prox_gestion_fecha).toBe('2026-11-28');
  });
});
