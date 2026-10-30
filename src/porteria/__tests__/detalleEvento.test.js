// src/porteria/__tests__/detalleEvento.test.js
const { leerEntradaRegistro, leerCambiosCorreccion, crearResolutorDetalle } = require('../services/detalleEvento');

const errorDe = async (fn) => { try { await fn(); return undefined; } catch (e) { return e; } };
const errorSync = (fn) => { try { fn(); return undefined; } catch (e) { return e; } };

const MOTIVOS = {
  1: { id: 1, codigo: 'TANQUEO', nombre: 'Tanqueo', tipo_referencia: 'NINGUNA', referencia_obligatoria: false, activo: true,
    aplica_propio: true, aplica_proveedor_asistencia: false, aplica_proveedor: false, aplica_ingreso: true, aplica_salida: true },
  2: { id: 2, codigo: 'SERES_QUERIDOS', nombre: 'Seres queridos', tipo_referencia: 'ASISTENCIA', referencia_obligatoria: true, activo: true,
    aplica_propio: true, aplica_proveedor_asistencia: false, aplica_proveedor: false, aplica_ingreso: true, aplica_salida: true },
  3: { id: 3, codigo: 'EXEQUIAS', nombre: 'Exequias', tipo_referencia: 'EXEQUIA', referencia_obligatoria: true, activo: true,
    aplica_propio: true, aplica_proveedor_asistencia: false, aplica_proveedor: false, aplica_ingreso: true, aplica_salida: true },
  4: { id: 4, codigo: 'OTRO', nombre: 'Otro', tipo_referencia: 'TEXTO', referencia_obligatoria: true, activo: true,
    aplica_propio: false, aplica_proveedor_asistencia: true, aplica_proveedor: true, aplica_ingreso: true, aplica_salida: true },
  5: { id: 5, codigo: 'VIEJO', nombre: 'Viejo', tipo_referencia: 'NINGUNA', referencia_obligatoria: false, activo: false,
    aplica_propio: true, aplica_proveedor_asistencia: true, aplica_proveedor: true, aplica_ingreso: true, aplica_salida: true },
};

function resolutor({ listaCompleta = true } = {}) {
  const h360 = {
    obtenerAsistenciaVigente: jest.fn(async (id) => (id === 10 ? { id: 10, codigo: 'H360-10', nombre_ser_querido: 'María', contrato: 'C-1', estado: 'NUEVO' } : null)),
    obtenerExequiaVigente: jest.fn(async (id) => (id === 20 ? { id: 20, tipo: 'Misa', fecha: '2026-10-30', hora: '10:00', asistencia_codigo: 'H360-10', nombre_ser_querido: 'María' } : null)),
  };
  const conductores = { buscar: jest.fn(async (u) => ({ conductor: u === 'jperez' ? { usuario: 'jperez', nombre: 'Juan Pérez' } : null, listaCompleta })) };
  const motivos = { obtener: jest.fn(async (id) => MOTIVOS[id] || null) };
  return { r: crearResolutorDetalle({ h360, conductores, motivos }), h360, conductores };
}

describe('leerEntradaRegistro', () => {
  const valida = { sentido: 'SALIDA', placa: ' abc-123 ', motivo_id: '1' };

  test('normaliza placa y números, booleanos por defecto en false', () => {
    expect(leerEntradaRegistro(valida)).toMatchObject({
      sentido: 'SALIDA', placa: 'ABC123', tipo_vehiculo: null, motivo_id: 1, forzar: false, guardar_en_catalogo: false,
      conductor_otro: false, kilometraje: null, observaciones: null,
    });
  });

  test.each([
    [{ ...valida, sentido: 'ENTRADA' }, 'Indica si es ingreso o salida'],
    [{ ...valida, placa: ' - ' }, 'Indica la placa'],
    [{ ...valida, placa: 12 }, 'Indica la placa'],
    [{ ...valida, motivo_id: undefined }, 'Indica el motivo'],
    [{ ...valida, motivo_id: 'x' }, 'Valor inválido en motivo'],
    [{ ...valida, tipo_vehiculo: 'CAMION' }, 'Tipo de vehículo inválido'],
    [{ ...valida, kilometraje: -1 }, 'Valor inválido en kilometraje'],
    [{ ...valida, observaciones: 'x'.repeat(501) }, 'Texto demasiado largo en observaciones'],
  ])('%p → 400 %s', (body, message) => {
    expect(errorSync(() => leerEntradaRegistro(body))).toMatchObject({ statusCode: 400, motivo: 'VALIDACION', message });
  });
});

describe('leerCambiosCorreccion', () => {
  test('solo los campos presentes', () => {
    expect(leerCambiosCorreccion({ kilometraje: '20', observaciones: ' ok ' })).toEqual({ kilometraje: 20, observaciones: 'ok' });
  });
  test('placa, sentido, tipo o sede no se corrigen', () => {
    expect(errorSync(() => leerCambiosCorreccion({ placa: 'X' }))).toMatchObject({
      statusCode: 400, message: 'La placa, el sentido, el tipo y la sede no se corrigen: anula el registro y regístralo de nuevo',
    });
  });
  test('sin cambios → 400', () => {
    expect(errorSync(() => leerCambiosCorreccion({ otra_cosa: 1 }))).toMatchObject({ statusCode: 400, message: 'No hay cambios' });
  });
  test('quitar el motivo → 400', () => {
    expect(errorSync(() => leerCambiosCorreccion({ motivo_id: null }))).toMatchObject({ statusCode: 400, message: 'Indica el motivo' });
  });
});

describe('resolver', () => {
  const propio = (datos) => ({ tipo: 'PROPIO', sentido: 'SALIDA', datos: { motivo_id: 1, conductor_usuario: 'jperez', ...datos } });

  test('propio con conductor del AD: nombre de la lista, sin referencia, con kilometraje', async () => {
    const { r } = resolutor();
    expect(await r.resolver(propio({ kilometraje: 100, observaciones: 'ok', asistencia_id: 10 }))).toEqual({
      motivo: { id: 1, codigo: 'TANQUEO', nombre: 'Tanqueo' },
      columnas: {
        motivo_id: 1, asistencia_id: null, exequia_id: null, referencia_texto: null, referencia_snapshot: null,
        conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', conductor_documento: null, conductor_otro: false,
        empresa: null, kilometraje: 100, observaciones: 'ok',
      },
    });
  });

  test('motivo inexistente, inactivo o que no aplica → 422', async () => {
    const { r } = resolutor();
    for (const datos of [{ motivo_id: 99 }, { motivo_id: 5 }, { motivo_id: 4 }]) {
      expect(await errorDe(() => r.resolver(propio(datos)))).toMatchObject({
        statusCode: 422, motivo: 'VALIDACION', message: 'El motivo no aplica a este vehículo o sentido',
      });
    }
  });

  test('asistencia: obligatoria, vigente y con snapshot', async () => {
    const { r } = resolutor();
    expect(await errorDe(() => r.resolver(propio({ motivo_id: 2 })))).toMatchObject({ statusCode: 422, message: 'Selecciona la asistencia' });
    expect(await errorDe(() => r.resolver(propio({ motivo_id: 2, asistencia_id: 11 })))).toMatchObject({ message: 'La asistencia no existe o ya no está activa' });
    const { columnas } = await r.resolver(propio({ motivo_id: 2, asistencia_id: 10, exequia_id: 20, referencia_texto: 'x' }));
    expect(columnas).toMatchObject({
      asistencia_id: 10, exequia_id: null, referencia_texto: null,
      referencia_snapshot: { tipo: 'ASISTENCIA', codigo: 'H360-10', nombre_ser_querido: 'María', contrato: 'C-1' },
    });
  });

  test('exequia: vigente y con snapshot', async () => {
    const { r } = resolutor();
    expect(await errorDe(() => r.resolver(propio({ motivo_id: 3, exequia_id: 21 })))).toMatchObject({ message: 'La exequia no existe o ya terminó' });
    const { columnas } = await r.resolver(propio({ motivo_id: 3, exequia_id: 20 }));
    expect(columnas.referencia_snapshot).toEqual({
      tipo: 'EXEQUIA', codigo: 'H360-10', nombre_ser_querido: 'María', fecha: '2026-10-30', hora: '10:00', tipo_exequia: 'Misa',
    });
  });

  test('proveedor: empresa, nombre y documento obligatorios; texto obligatorio; sin kilometraje', async () => {
    const { r } = resolutor();
    const proveedor = (datos) => ({ tipo: 'PROVEEDOR', sentido: 'INGRESO', datos: { motivo_id: 4, referencia_texto: 'Repuestos', ...datos } });
    expect(await errorDe(() => r.resolver(proveedor({ empresa: 'X', conductor_nombre: 'Ana' })))).toMatchObject({
      statusCode: 422, message: 'Escribe la empresa, el nombre y el documento del conductor',
    });
    expect(await errorDe(() => r.resolver(proveedor({ referencia_texto: null, empresa: 'X', conductor_nombre: 'Ana', conductor_documento: '1' })))).toMatchObject({
      message: 'Escribe la referencia',
    });
    const { columnas } = await r.resolver(proveedor({ empresa: 'X', conductor_nombre: 'Ana', conductor_documento: '1', kilometraje: 5, conductor_usuario: 'jperez' }));
    expect(columnas).toMatchObject({
      referencia_texto: 'Repuestos', empresa: 'X', conductor_nombre: 'Ana', conductor_documento: '1',
      conductor_usuario: null, conductor_otro: false, kilometraje: null,
    });
  });

  test('conductor "otro" exige nombre', async () => {
    const { r, conductores } = resolutor();
    expect(await errorDe(() => r.resolver(propio({ conductor_usuario: null, conductor_otro: true })))).toMatchObject({ message: 'Escribe el nombre del conductor' });
    const { columnas } = await r.resolver(propio({ conductor_usuario: null, conductor_otro: true, conductor_nombre: 'Pedro' }));
    expect(columnas).toMatchObject({ conductor_usuario: null, conductor_nombre: 'Pedro', conductor_otro: true });
    expect(conductores.buscar).not.toHaveBeenCalled();
  });

  test('conductor fuera de la lista: 422 si la lista está completa; aceptado si el AD no respondió', async () => {
    expect(await errorDe(() => resolutor().r.resolver(propio({ conductor_usuario: 'nadie', conductor_nombre: 'Nadie' })))).toMatchObject({
      statusCode: 422, message: 'El conductor no está en la lista. Elige "otro" y escribe el nombre.',
    });
    expect(await errorDe(() => resolutor().r.resolver(propio({ conductor_usuario: null })))).toMatchObject({ message: 'Selecciona el conductor' });
    const { r } = resolutor({ listaCompleta: false });
    expect(await errorDe(() => r.resolver(propio({ conductor_usuario: 'nadie' })))).toMatchObject({ statusCode: 422 });
    const { columnas } = await r.resolver(propio({ conductor_usuario: 'nadie', conductor_nombre: 'Nadie N' }));
    expect(columnas).toMatchObject({ conductor_usuario: 'nadie', conductor_nombre: 'Nadie N', conductor_otro: false });
  });

  test('conservar copia referencia y conductor sin consultar H360 ni el AD', async () => {
    const { r, h360, conductores } = resolutor();
    const datos = {
      motivo_id: 2, asistencia_id: 11, exequia_id: null, referencia_texto: null, referencia_snapshot: { codigo: 'VIEJA' },
      conductor_usuario: 'retirado', conductor_nombre: 'Retirado', conductor_documento: null, conductor_otro: false, empresa: null,
      kilometraje: 7, observaciones: null,
    };
    const { columnas } = await r.resolver({ tipo: 'PROPIO', sentido: 'SALIDA', datos, conservar: { referencia: true, conductor: true } });
    expect(columnas).toMatchObject({ asistencia_id: 11, referencia_snapshot: { codigo: 'VIEJA' }, conductor_usuario: 'retirado', kilometraje: 7 });
    expect(h360.obtenerAsistenciaVigente).not.toHaveBeenCalled();
    expect(conductores.buscar).not.toHaveBeenCalled();
  });
});
