// Cuándo se exige la desinfección del vehículo para salir de ASISTENCIA.
//
// Es una regla chica con consecuencia grande: si se exige donde no aplica, el
// caso se queda trabado pidiendo un formato que nadie puede llenar porque no
// hubo vehículo; si no se exige donde sí aplica, un vehículo de la empresa
// queda sin registro de desinfección y eso es un hallazgo de auditoría.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const { hayVehiculoQueDesinfectar, requisitosEfectivos } =
  require('../asistencias.controller');

describe('hayVehiculoQueDesinfectar', () => {
  test('traslado propio: sí hay vehículo nuestro', () => {
    expect(hayVehiculoQueDesinfectar({ conductor_rol: 'tanatologo', viene_otra_ciudad: 0 })).toBe(true);
  });

  test('asistente externo: el vehículo no es de la empresa', () => {
    expect(hayVehiculoQueDesinfectar({ conductor_rol: 'asistente', viene_otra_ciudad: 0 })).toBe(false);
  });

  test('viene desde otra ciudad: no hubo traslado nuestro', () => {
    expect(hayVehiculoQueDesinfectar({ conductor_rol: null, viene_otra_ciudad: 1 })).toBe(false);
  });

  // No saber quién condujo no significa que nadie haya conducido. Era el
  // comportamiento anterior y se conserva a propósito.
  test('sin conductor registrado se sigue exigiendo', () => {
    expect(hayVehiculoQueDesinfectar({ conductor_rol: null, viene_otra_ciudad: 0 })).toBe(true);
  });

  test('sin caso se exige, que es lo conservador', () => {
    expect(hayVehiculoQueDesinfectar(undefined)).toBe(true);
  });
});

describe('requisitosEfectivos', () => {
  const REQUERIDAS = ['F02_INVENTARIO_CUERPO', 'F08_DESINFECCION'];

  test('quita la desinfección cuando no hubo vehículo nuestro', () => {
    expect(requisitosEfectivos(REQUERIDAS, 'ASISTENCIA', { viene_otra_ciudad: 1 }))
      .toEqual(['F02_INVENTARIO_CUERPO']);
  });

  // El inventario del cuerpo no se toca: lo reciben en el laboratorio igual,
  // venga de donde venga.
  test('el inventario del cuerpo se sigue exigiendo', () => {
    expect(requisitosEfectivos(REQUERIDAS, 'ASISTENCIA', { viene_otra_ciudad: 1 }))
      .toContain('F02_INVENTARIO_CUERPO');
  });

  test('con traslado propio no quita nada', () => {
    expect(requisitosEfectivos(REQUERIDAS, 'ASISTENCIA', { conductor_rol: 'coordinador' }))
      .toEqual(REQUERIDAS);
  });

  // La exención es solo de ASISTENCIA: en otros estados la lista no se toca,
  // aunque alguna llegara a incluir la desinfección.
  test('en otros estados la lista queda igual', () => {
    expect(requisitosEfectivos(REQUERIDAS, 'PRESERVACION', { viene_otra_ciudad: 1 }))
      .toEqual(REQUERIDAS);
  });
});
