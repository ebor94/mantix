// Datos ficticios para Playwright.
const db = require('../../models');
const { crearOperativo, crearParticipante } = require('./fabricas');

async function semillaE2E() {
  await crearOperativo('TRK_CABINA', { nombre: 'Cabina E2E', pin: '111111' });
  await crearOperativo('TRK_COMENTARISTA', { nombre: 'Comentarista E2E', pin: '222222' });
  for (const n of [1, 2, 3]) await crearOperativo('TRK_JURADO', { nombre: `Jurado E2E ${n}`, pin: `33333${n}` });
  await crearParticipante({ mascota_nombre: 'Canela', estado: 'INSCRITO', responsable_nombre: 'Laura Gómez', responsable_documento: '1001' });
  await crearParticipante({ mascota_nombre: 'Rocky', estado: 'INSCRITO', responsable_nombre: 'Pedro Alba', responsable_documento: '1002' });
  await crearParticipante({ mascota_nombre: 'Misifú', estado: 'INSCRITO', categoriaCodigo: 'FELINOS', especie: 'GATO', responsable_nombre: 'Sofía Mar', responsable_documento: '1003' });
  return { participantes: await db.TrkParticipante.count() };
}

module.exports = { semillaE2E };
