// src/porteria/__tests__/conductores.service.test.js
const { crearConductores } = require('../services/conductores.service');

const A = [{ usuario: 'zuleta', nombre: 'Zuleta Ana', mail: 'z@x', telefono: '1' }, { usuario: 'perez', nombre: 'Pérez Juan', mail: '', telefono: '' }];
const B = [{ usuario: 'perez', nombre: 'Pérez Juan (B)', mail: '', telefono: '' }, { usuario: 'baez', nombre: 'Báez Luis', mail: '', telefono: '' }];

function preparar({ fallan = [] } = {}) {
  let reloj = 1000;
  const log = { warn: jest.fn() };
  const listarMiembrosGrupo = jest.fn(async (grupo) => {
    if (fallan.includes(grupo)) throw new Error(`no se pudo leer ${grupo}`);
    return grupo === 'GA' ? A : B;
  });
  const conductores = crearConductores({
    listarMiembrosGrupo, grupos: () => ['GA', undefined, 'GB'], ttlMs: 600000, ahora: () => reloj, log,
  });
  return { conductores, listarMiembrosGrupo, log, avanzar: (ms) => { reloj += ms; }, fallan };
}

test('une los grupos sin duplicados, ordenados por nombre, solo usuario y nombre', async () => {
  const { conductores, listarMiembrosGrupo } = preparar();
  expect(await conductores.listar()).toEqual([
    { usuario: 'baez', nombre: 'Báez Luis' },
    { usuario: 'perez', nombre: 'Pérez Juan' },
    { usuario: 'zuleta', nombre: 'Zuleta Ana' },
  ]);
  expect(listarMiembrosGrupo.mock.calls.map(([g]) => g)).toEqual(['GA', 'GB']);
});

test('usa la caché durante 10 minutos', async () => {
  const { conductores, listarMiembrosGrupo, avanzar } = preparar();
  await conductores.listar();
  avanzar(599999);
  await conductores.listar();
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(2);
  avanzar(2);
  await conductores.listar();
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(4);
});

test('si un grupo falla sin caché previa devuelve lo que pudo leer y no lo guarda', async () => {
  const { conductores, listarMiembrosGrupo, log } = preparar({ fallan: ['GB'] });
  expect((await conductores.listar()).map((c) => c.usuario)).toEqual(['perez', 'zuleta']);
  expect(log.warn).toHaveBeenCalledWith('porteria: no se pudo leer un grupo de conductores', { grupo: 'GB' });
  await conductores.listar();
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(4);
});

test('si el AD falla después, conserva la última lista buena', async () => {
  const p = preparar();
  const buena = await p.conductores.listar();
  p.avanzar(600001);
  p.fallan.push('GA', 'GB');
  expect(await p.conductores.listar()).toEqual(buena);
});

test('existe consulta la lista', async () => {
  const { conductores } = preparar();
  expect(await conductores.existe('baez')).toBe(true);
  expect(await conductores.existe('nadie')).toBe(false);
});
