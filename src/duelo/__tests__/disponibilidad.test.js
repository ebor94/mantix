const { crearDisponibilidad } = require('../services/disponibilidad');
const { MENSAJE_CERRADAS } = require('../services/inscribir.service');
const { MENSAJE_CUPO } = require('../dominio/evento');

const armar = ({ config = {}, contar = jest.fn(async () => 0), ahora } = {}) => {
  const cfg = { abiertas: true, cupoMaximo: null, ...config };
  const repo = { contar };
  return { repo, disponibilidad: crearDisponibilidad({ repo, obtenerConfig: () => cfg, ...(ahora ? { ahora } : {}) }) };
};

test('sin cupo: abiertas y no consulta la base', async () => {
  const { repo, disponibilidad } = armar();
  expect(await disponibilidad.estado()).toEqual({ abiertas: true, mensaje: null });
  expect(repo.contar).not.toHaveBeenCalled();
});

test('por debajo del cupo: abiertas', async () => {
  const { disponibilidad } = armar({ config: { cupoMaximo: 120 }, contar: jest.fn(async () => 119) });
  expect(await disponibilidad.estado()).toEqual({ abiertas: true, mensaje: null });
});

test('en el cupo: cerradas con MENSAJE_CUPO', async () => {
  const { disponibilidad } = armar({ config: { cupoMaximo: 120 }, contar: jest.fn(async () => 120) });
  expect(await disponibilidad.estado()).toEqual({ abiertas: false, mensaje: MENSAJE_CUPO });
});

test('abiertas=false: cerradas con el mensaje de cierre y sin consultar la base', async () => {
  const { repo, disponibilidad } = armar({ config: { abiertas: false, cupoMaximo: 120 } });
  expect(await disponibilidad.estado()).toEqual({ abiertas: false, mensaje: MENSAJE_CERRADAS });
  expect(repo.contar).not.toHaveBeenCalled();
});

test('si contar falla recurre a config.abiertas (abiertas)', async () => {
  const { disponibilidad } = armar({ config: { cupoMaximo: 120 }, contar: jest.fn(async () => { throw new Error('bd caída'); }) });
  expect(await disponibilidad.estado()).toEqual({ abiertas: true, mensaje: null });
});

describe('caché del conteo (5 s)', () => {
  test('dos llamadas dentro de 5 s hacen un solo contar; después de 5 s vuelve a contar', async () => {
    let t = 1000;
    const { repo, disponibilidad } = armar({ config: { cupoMaximo: 3 }, contar: jest.fn(async () => 1), ahora: () => t });
    await disponibilidad.estado();
    t += 4999;
    await disponibilidad.estado();
    expect(repo.contar).toHaveBeenCalledTimes(1);
    t += 2;
    await disponibilidad.estado();
    expect(repo.contar).toHaveBeenCalledTimes(2);
  });

  test('un conteo fallido no se cachea', async () => {
    const contar = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(3);
    const { disponibilidad } = armar({ config: { cupoMaximo: 3 }, contar, ahora: () => 1 });
    expect((await disponibilidad.estado()).abiertas).toBe(true);
    expect((await disponibilidad.estado()).abiertas).toBe(false);
  });
});
