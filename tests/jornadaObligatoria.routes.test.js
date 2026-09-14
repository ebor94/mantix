// Test de integración liviano: monta sólo el router de tracking con un
// middleware fake de auth. No usa DB — mockea el service completo.
const express = require('express');
const request = require('supertest');

jest.mock('../src/sv/services/jornadaObligatoria.service', () => ({
  esOperativo: jest.fn(),
  estadoHoy:  jest.fn(),
  registrarAusencia:   jest.fn(),
  eliminarAusenciaHoy: jest.fn()
}));

// Silenciar el service de tracking (que se importa junto en el controller)
jest.mock('../src/sv/services/tracking.service', () => ({}));

// Silenciar el modelo SvUsuario del controller (usado en puedeVerUsuario)
jest.mock('../src/sv/models', () => ({ SvUsuario: {} }));

const svcJornObl = require('../src/sv/services/jornadaObligatoria.service');
const trackingRoutes = require('../src/sv/routes/tracking.routes');

function buildApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/sv/tracking', trackingRoutes);
  return app;
}

const asesor  = { usr_id: 10, rol: { rol_codigo: 'ASESOR' } };

describe('GET /jornadas/hoy', () => {
  test('devuelve el estado del service', async () => {
    svcJornObl.estadoHoy.mockResolvedValue({
      estado: 'sin_iniciar', jornada: null, ausencia: null, requiere_popup: true
    });
    const r = await request(buildApp(asesor)).get('/api/sv/tracking/jornadas/hoy');
    expect(r.status).toBe(200);
    expect(r.body.data.requiere_popup).toBe(true);
    expect(svcJornObl.estadoHoy).toHaveBeenCalledWith(asesor);
  });
});

describe('POST /jornadas/ausencia', () => {
  test('crea ausencia con payload válido y responde 201', async () => {
    svcJornObl.registrarAusencia.mockResolvedValue({ aus_id: 7 });
    const r = await request(buildApp(asesor))
      .post('/api/sv/tracking/jornadas/ausencia')
      .send({ tipo: 'PERMISO', motivo: 'Cita médica' });
    expect(r.status).toBe(201);
    expect(r.body.data.aus_id).toBe(7);
  });

  test('422 con tipo inválido', async () => {
    const r = await request(buildApp(asesor))
      .post('/api/sv/tracking/jornadas/ausencia')
      .send({ tipo: 'BLAH', motivo: 'bla bla bla' });
    expect(r.status).toBe(422);
  });

  test('409 si el service reporta AUSENCIA_DUPLICADA', async () => {
    const dup = new Error('dup');
    dup.code = 'AUSENCIA_DUPLICADA';
    svcJornObl.registrarAusencia.mockRejectedValue(dup);
    const r = await request(buildApp(asesor))
      .post('/api/sv/tracking/jornadas/ausencia')
      .send({ tipo: 'OTRO', motivo: 'razón válida' });
    expect(r.status).toBe(409);
  });
});

describe('DELETE /jornadas/ausencia/hoy', () => {
  test('204 al borrar', async () => {
    svcJornObl.eliminarAusenciaHoy.mockResolvedValue(1);
    const r = await request(buildApp(asesor))
      .delete('/api/sv/tracking/jornadas/ausencia/hoy');
    expect(r.status).toBe(204);
  });
});
