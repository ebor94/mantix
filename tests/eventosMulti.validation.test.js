const v = require('../src/sv/validations/eventosMulti.validation');

describe('crearEvento', () => {
  const base = {
    titulo: 'Feria del Norte',
    tipo: 'FERIA',
    modo_fechas: 'UNICO',
    fecha_inicio: '2026-10-20T08:00:00.000Z',
    asistentes_ids: [10, 11]
  };

  test('acepta modo UNICO sin fecha_fin ni slots', () => {
    const { error } = v.crearEvento.validate(base);
    expect(error).toBeUndefined();
  });

  test('acepta modo DIA_COMPLETO_MULTI con fecha_fin', () => {
    const { error } = v.crearEvento.validate({
      ...base, modo_fechas: 'DIA_COMPLETO_MULTI', fecha_fin: '2026-10-22T18:00:00.000Z'
    });
    expect(error).toBeUndefined();
  });

  test('rechaza DIA_COMPLETO_MULTI sin fecha_fin', () => {
    const { error } = v.crearEvento.validate({ ...base, modo_fechas: 'DIA_COMPLETO_MULTI' });
    expect(error).toBeDefined();
  });

  test('acepta modo SLOTS con array de slots', () => {
    const { error } = v.crearEvento.validate({
      ...base, modo_fechas: 'SLOTS',
      slots: [{ fecha: '2026-10-20', hora_inicio: '08:00', hora_fin: '12:00' }]
    });
    expect(error).toBeUndefined();
  });

  test('rechaza SLOTS sin slots o slots vacío', () => {
    const { error: e1 } = v.crearEvento.validate({ ...base, modo_fechas: 'SLOTS' });
    const { error: e2 } = v.crearEvento.validate({ ...base, modo_fechas: 'SLOTS', slots: [] });
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();
  });

  test('rechaza título vacío', () => {
    const { error } = v.crearEvento.validate({ ...base, titulo: '' });
    expect(error).toBeDefined();
  });

  test('rechaza asistentes_ids vacío', () => {
    const { error } = v.crearEvento.validate({ ...base, asistentes_ids: [] });
    expect(error).toBeDefined();
  });

  test('rechaza tipo desconocido', () => {
    const { error } = v.crearEvento.validate({ ...base, tipo: 'BLAH' });
    expect(error).toBeDefined();
  });

  test('acepta apoyo_usr_id opcional', () => {
    const { error } = v.crearEvento.validate({ ...base, apoyo_usr_id: 27 });
    expect(error).toBeUndefined();
  });
});

describe('registroPublico', () => {
  test('acepta nombre + teléfono válidos', () => {
    const { error } = v.registroPublico.validate({
      nombre: 'Juan Pérez', telefono: '+57 300 123 4567'
    });
    expect(error).toBeUndefined();
  });

  test('acepta correo opcional', () => {
    const { error } = v.registroPublico.validate({
      nombre: 'Juan', telefono: '3001234567', correo: 'juan@example.com'
    });
    expect(error).toBeUndefined();
  });

  test('acepta correo .local (jparada@olivos.local)', () => {
    const { error } = v.registroPublico.validate({
      nombre: 'Juan', telefono: '3001234567', correo: 'juan@olivos.local'
    });
    expect(error).toBeUndefined();
  });

  test('rechaza teléfono con letras', () => {
    const { error } = v.registroPublico.validate({
      nombre: 'Juan', telefono: 'abc123'
    });
    expect(error).toBeDefined();
  });

  test('rechaza nombre menor a 2 chars', () => {
    const { error } = v.registroPublico.validate({ nombre: 'J', telefono: '3001234567' });
    expect(error).toBeDefined();
  });
});

describe('asignarPool', () => {
  test('acepta asesor_id positivo', () => {
    const { error } = v.asignarPool.validate({ asesor_id: 15 });
    expect(error).toBeUndefined();
  });

  test('rechaza asesor_id faltante', () => {
    const { error } = v.asignarPool.validate({});
    expect(error).toBeDefined();
  });
});

describe('actualizarMetricas', () => {
  test('acepta estado + números', () => {
    const { error } = v.actualizarMetricas.validate({
      estado: 'ASISTIO', leads_captados: 12, prospectos_creados: 3, ventas_cerradas: 1
    });
    expect(error).toBeUndefined();
  });

  test('acepta payload parcial (solo estado)', () => {
    const { error } = v.actualizarMetricas.validate({ estado: 'JUSTIFICADO' });
    expect(error).toBeUndefined();
  });

  test('rechaza estado desconocido', () => {
    const { error } = v.actualizarMetricas.validate({ estado: 'BLAH' });
    expect(error).toBeDefined();
  });

  test('rechaza números negativos', () => {
    const { error } = v.actualizarMetricas.validate({ leads_captados: -1 });
    expect(error).toBeDefined();
  });
});
