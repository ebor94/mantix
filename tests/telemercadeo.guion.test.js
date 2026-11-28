jest.mock('../src/sv/models', () => ({ sequelize: { close: jest.fn() } }));
jest.mock('../src/sv/services/telemercadeo.lector', () => ({ leerLibro: jest.fn() }));
jest.mock('../src/sv/services/telemercadeo.carga', () => ({
  resolverAsesora: jest.fn(), cargarCatalogos: jest.fn(), cargar: jest.fn()
}));
jest.mock('../src/sv/services/telemercadeo.reporte', () => ({ rutaReporte: jest.fn(), escribirReporte: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { leerLibro } = require('../src/sv/services/telemercadeo.lector');
const C = require('../src/sv/services/telemercadeo.carga');
const R = require('../src/sv/services/telemercadeo.reporte');
const { ejecutar, argumentos } = require('../src/sv/scripts/migrar-telemercadeo');

const REPO = path.resolve(__dirname, '..');
const AHORA = new Date(2026, 10, 27, 9, 5);
const ASESORA = { ad: 'carmencontreras', usr_id: 50, nombre: 'Carmen Contreras', grupo_id: 1, area_id: 1 };
const CATALOGOS = { productos: new Map() };
const INCIDENCIA = { hoja: 'H', fila: null, tipo: 'aviso', mensaje: 'falta la columna HORA' };
let dir;
let libro;
let log;
let error;
const correr = (argv) => ejecutar(argv, { log, error, ahora: AHORA });

beforeEach(() => {
  jest.resetAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tele-'));
  libro = path.join(dir, 'libro.xlsx');
  fs.writeFileSync(libro, 'x');
  log = jest.fn();
  error = jest.fn();
  C.resolverAsesora.mockResolvedValue(ASESORA);
  C.cargarCatalogos.mockResolvedValue(CATALOGOS);
  leerLibro.mockResolvedValue({ filas: [], incidencias: [INCIDENCIA] });
  C.cargar.mockResolvedValue({ resultados: [{ resultado: 'se crearía' }, { resultado: 'omitido' }], avisos: [], lista: null });
  R.rutaReporte.mockReturnValue(path.join(dir, 'libro - reporte.xlsx'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

it('lee los argumentos', () => {
  expect(argumentos(['--archivo', 'a.xlsx', '--asesor', 'carmen', '--aplicar'])).toEqual({ archivo: 'a.xlsx', asesor: 'carmen', aplicar: true });
  expect(argumentos(['--archivo', '--asesor', 'carmen'])).toEqual({ archivo: null, asesor: 'carmen', aplicar: false });
});

it('simula: lee, carga sin aplicar, escribe el reporte y termina en 0', async () => {
  await expect(correr(['--archivo', libro, '--asesor', 'carmencontreras'])).resolves.toBe(0);
  expect(C.resolverAsesora).toHaveBeenCalledWith('carmencontreras');
  expect(C.cargarCatalogos).toHaveBeenCalledWith(ASESORA);
  expect(leerLibro).toHaveBeenCalledWith(libro, 'libro.xlsx');
  expect(C.cargar).toHaveBeenCalledWith({ filas: [], asesora: ASESORA, catalogos: CATALOGOS, archivo: 'libro', hoy: '2026-11-27', aplicar: false });
  expect(R.rutaReporte).toHaveBeenCalledWith(libro, false, AHORA);
  expect(R.escribirReporte).toHaveBeenCalledWith(path.join(dir, 'libro - reporte.xlsx'), {
    resultados: [{ resultado: 'se crearía' }, { resultado: 'omitido' }], incidencias: [INCIDENCIA], catalogos: CATALOGOS
  });
  expect(log).toHaveBeenCalledWith('=== SIMULACIÓN (no escribe nada) ===');
  expect(log).toHaveBeenCalledWith('Leídos: 2 · Se crearían: 1 · Omitidos: 1 · Errores: 0 · Avisos: 1');
  expect(log).toHaveBeenCalledWith(`Reporte: ${path.join(dir, 'libro - reporte.xlsx')}`);
});

it('con --aplicar carga de verdad', async () => {
  C.cargar.mockResolvedValue({ resultados: [{ resultado: 'se crea' }], avisos: [], lista: { lista_id: 1 } });
  await expect(correr(['--archivo', libro, '--asesor', 'carmencontreras', '--aplicar'])).resolves.toBe(0);
  expect(C.cargar).toHaveBeenCalledWith(expect.objectContaining({ aplicar: true }));
  expect(log).toHaveBeenCalledWith('=== MODO APLICAR ===');
  expect(log).toHaveBeenCalledWith('Leídos: 1 · Creados: 1 · Omitidos: 0 · Errores: 0 · Avisos: 1');
});

it.each([
  ['faltan argumentos', () => ['--asesor', 'carmencontreras'], 'Uso:'],
  ['el libro está dentro del repositorio', () => ['--archivo', path.join(REPO, 'tests', 'libro.xlsx'), '--asesor', 'carmencontreras'], 'dentro del repositorio'],
  ['el libro no existe', () => ['--archivo', path.join(dir, 'no.xlsx'), '--asesor', 'carmencontreras'], 'No existe el archivo']
])('termina en 1 sin consultar la base si %s', async (_caso, args, mensaje) => {
  await expect(correr(args())).resolves.toBe(1);
  expect(error).toHaveBeenCalledWith(expect.stringContaining(mensaje));
  expect(C.resolverAsesora).not.toHaveBeenCalled();
});

it.each([
  ['la asesora no es válida', () => C.resolverAsesora.mockRejectedValue(new Error('«x» no es de Prenecesidad.'))],
  ['falta un catálogo', () => C.cargarCatalogos.mockRejectedValue(new Error('Faltan en los catálogos de GenFlow: punto SJ.'))]
])('termina en 1 sin leer ni escribir si %s', async (_caso, preparar) => {
  preparar();
  await expect(correr(['--archivo', libro, '--asesor', 'x'])).resolves.toBe(1);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('ERROR'));
  expect(leerLibro).not.toHaveBeenCalled();
  expect(C.cargar).not.toHaveBeenCalled();
  expect(R.escribirReporte).not.toHaveBeenCalled();
});

describe('hojas sin cargar', () => {
  const HOJA = { hoja: 'LUNES', fila: null, tipo: 'error', mensaje: 'no se pudo saber la fecha de la hoja' };

  it('las lista después de Leídos', async () => {
    leerLibro.mockResolvedValue({ filas: [], incidencias: [HOJA] });
    await expect(correr(['--archivo', libro, '--asesor', 'x'])).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith('Leídos: 2 · Se crearían: 1 · Omitidos: 1 · Errores: 0 · Avisos: 0');
    expect(log).toHaveBeenCalledWith('Hojas sin cargar: 1');
    expect(log).toHaveBeenCalledWith('  · LUNES: no se pudo saber la fecha de la hoja');
    const lineas = log.mock.calls.map((c) => c[0]);
    expect(lineas.indexOf('Hojas sin cargar: 1')).toBe(lineas.findIndex((l) => l.startsWith('Leídos:')) + 1);
  });

  it('no las menciona si solo hay avisos sin fila', async () => {
    await correr(['--archivo', libro, '--asesor', 'x']);
    expect(log.mock.calls.map((c) => c[0]).join('\n')).not.toContain('Hojas sin cargar');
  });
});

describe('fallos al cargar o guardar', () => {
  const AVISO_REPETIR = 'Puede que una parte ya se haya cargado. Volver a correr con --aplicar es seguro: omite los clientes ya creados y cierra la lista.';

  it('si cargar falla con --aplicar, termina en 1 y avisa que volver a correr es seguro', async () => {
    C.cargar.mockRejectedValue(new Error('se cayó la conexión'));
    await expect(correr(['--archivo', libro, '--asesor', 'x', '--aplicar'])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith('\nERROR: se cayó la conexión');
    expect(error).toHaveBeenCalledWith(AVISO_REPETIR);
  });

  it('si cargar falla en simulación, no dice que haya algo cargado', async () => {
    C.cargar.mockRejectedValue(new Error('se cayó la conexión'));
    await expect(correr(['--archivo', libro, '--asesor', 'x'])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith('\nERROR: se cayó la conexión');
    expect(error).not.toHaveBeenCalledWith(AVISO_REPETIR);
  });

  it('si el reporte no se guarda, el resumen ya salió y el error lo dice', async () => {
    R.escribirReporte.mockRejectedValue(new Error('disco lleno'));
    await expect(correr(['--archivo', libro, '--asesor', 'x'])).resolves.toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Leídos:/));
    expect(error).toHaveBeenCalledWith('\nERROR: no se pudo guardar el reporte: disco lleno');
    expect(error).not.toHaveBeenCalledWith(AVISO_REPETIR);
  });
});
