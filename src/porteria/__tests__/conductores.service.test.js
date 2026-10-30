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
  const { conductores, listarMiembrosGrupo, log, avanzar } = preparar({ fallan: ['GB'] });
  expect((await conductores.listar()).map((c) => c.usuario)).toEqual(['perez', 'zuleta']);
  expect(log.warn).toHaveBeenCalledWith('porteria: no se pudo leer un grupo de conductores', { grupo: 'GB' });
  avanzar(60001);
  await conductores.listar();
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(4);
});

test('llamadas concurrentes comparten una sola ronda de lecturas', async () => {
  const { conductores, listarMiembrosGrupo } = preparar();
  const [a, b] = await Promise.all([conductores.listar(), conductores.listar()]);
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(2);
  expect(a).toEqual(b);
});

test('tras una lectura incompleta no reintenta durante 60 s y luego sí', async () => {
  const { conductores, listarMiembrosGrupo, avanzar } = preparar({ fallan: ['GB'] });
  const primera = await conductores.listar();
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(2);
  avanzar(59999);
  expect(await conductores.listar()).toEqual(primera);
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(2);
  avanzar(2);
  await conductores.listar();
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(4);
});

test('tras una lectura incompleta con caché vencida sirve la última lista buena sin reintentar', async () => {
  const p = preparar();
  const buena = await p.conductores.listar();
  p.avanzar(600001);
  p.fallan.push('GA', 'GB');
  expect(await p.conductores.listar()).toEqual(buena);
  const llamadas = p.listarMiembrosGrupo.mock.calls.length;
  expect(await p.conductores.listar()).toEqual(buena);
  expect(p.listarMiembrosGrupo).toHaveBeenCalledTimes(llamadas);
});

test('mutar la lista devuelta no altera la siguiente', async () => {
  const { conductores } = preparar();
  const lista = await conductores.listar();
  lista.push({ usuario: 'intruso', nombre: 'Intruso' });
  lista[0].nombre = 'Cambiado';
  expect((await conductores.listar()).map((c) => c.usuario)).toEqual(['baez', 'perez', 'zuleta']);
  expect((await conductores.listar())[0].nombre).toBe('Báez Luis');
});

test('sin log inyectado usa console', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const conductores = crearConductores({
    listarMiembrosGrupo: async () => { throw new Error('x'); }, grupos: () => ['GA'],
  });
  await expect(conductores.listar()).resolves.toEqual([]);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
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

test('buscar distingue "no está en la lista" de "no se sabe"', async () => {
  const ok = preparar();
  expect(await ok.conductores.buscar('baez')).toEqual({ conductor: { usuario: 'baez', nombre: 'Báez Luis' }, listaCompleta: true });
  expect(await ok.conductores.buscar('nadie')).toEqual({ conductor: null, listaCompleta: true });

  const caido = preparar({ fallan: ['GA', 'GB'] });
  expect(await caido.conductores.buscar('baez')).toEqual({ conductor: null, listaCompleta: false });

  const parcial = preparar({ fallan: ['GB'] });
  expect(await parcial.conductores.buscar('perez')).toEqual({ conductor: { usuario: 'perez', nombre: 'Pérez Juan' }, listaCompleta: false });
});
