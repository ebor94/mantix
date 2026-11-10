const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar, insertarBeneficiario, insertarSemana, insertarCita, insertarBloqueo } = require('../testing/fabricas');
const { configDePrueba } = require('../testing/appPrueba');
const { crearServicioDisponibilidad } = require('../services/disponibilidad.service');
const { enTransaccion } = require('../utils/transaccion');

let conn;
let bd;
let servicio;
const ahora = new Date('2026-11-20T13:00:00Z'); // viernes 20-nov 8:00 local
const lun9 = new Date('2026-11-23T14:00:00Z');
beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  servicio = crearServicioDisponibilidad({ bd, obtenerConfig: configDePrueba, reloj: () => ahora });
});
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(() => limpiar(conn));

const SEMANA_23 = { desde: '2026-11-23', hasta: '2026-11-27' };
const estadoDe = (r, inicio) => (r.franjas.find((f) => f.inicio === inicio.toISOString()) || {}).estado;
const cita = async (semanaId, inicio, extra = {}) => {
  const b = await insertarBeneficiario(conn, { nombre: extra.nombre || 'Ana Perez' });
  const fin = new Date(inicio.getTime() + 3600000);
  return insertarCita(conn, { beneficiario_id: b, semana_id: semanaId, inicio, fin, periodo: '2026-11', slot_key: `${inicio.toISOString()}#1`, cupo_key: `${b}:2026-11`, ...extra.cita });
};

describe('consultar', () => {
  test('semana publicada sin citas → 30 franjas libres', async () => {
    await insertarSemana(conn, { fecha_inicio: '2026-11-23', estado: 'publicada' });
    const r = await servicio.consultar({ ...SEMANA_23, esAdmin: false });
    expect(r.franjas).toHaveLength(30);
    expect(new Set(r.franjas.map((f) => f.estado))).toEqual(new Set(['libre']));
  });

  test('borrador: el empleado no la ve, el admin sí', async () => {
    await insertarSemana(conn, { fecha_inicio: '2026-11-23', estado: 'borrador' });
    expect((await servicio.consultar({ ...SEMANA_23, esAdmin: false })).franjas).toEqual([]);
    expect((await servicio.consultar({ ...SEMANA_23, esAdmin: true })).franjas).toHaveLength(30);
  });

  test('cita activa → ocupada y sin datos del beneficiario para el empleado; cancelada no ocupa', async () => {
    const s = await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    await cita(s, lun9, { nombre: 'Ana Perez' });
    const b2 = await insertarBeneficiario(conn, { nombre: 'Luis Gomez' });
    const mar9 = new Date('2026-11-24T14:00:00Z');
    await insertarCita(conn, { beneficiario_id: b2, semana_id: s, inicio: mar9, fin: new Date(mar9.getTime() + 3600000), periodo: '2026-11', estado: 'cancelada' });
    const r = await servicio.consultar({ ...SEMANA_23, esAdmin: false });
    expect(estadoDe(r, lun9)).toBe('ocupada');
    expect(estadoDe(r, mar9)).toBe('libre');
    expect(JSON.stringify(r)).not.toMatch(/Ana|Perez|Luis|beneficiario/);
    const a = await servicio.consultar({ ...SEMANA_23, esAdmin: true });
    expect(a.franjas.find((f) => f.inicio === lun9.toISOString()).citas[0].beneficiario.nombre).toBe('Ana Perez');
  });

  test('bloqueo de 08:00 a 12:00 → 3 franjas bloqueadas', async () => {
    const s = await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    await insertarBloqueo(conn, { semana_id: s, inicio: new Date('2026-11-23T13:00:00Z'), fin: new Date('2026-11-23T17:00:00Z') });
    const r = await servicio.consultar({ ...SEMANA_23, esAdmin: false });
    expect(r.franjas.filter((f) => f.estado === 'bloqueada').map((f) => f.inicio)).toEqual([
      '2026-11-23T13:00:00.000Z', '2026-11-23T14:00:00.000Z', '2026-11-23T15:00:00.000Z',
    ]);
  });

  test('semana con el festivo del 16-nov → 24 franjas', async () => {
    await insertarSemana(conn, { fecha_inicio: '2026-11-16' });
    const r = await servicio.consultar({ desde: '2026-11-16', hasta: '2026-11-20', esAdmin: true });
    expect(r.franjas).toHaveLength(24);
  });

  test('un rango que empieza a mitad de semana incluye esa semana', async () => {
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    const r = await servicio.consultar({ desde: '2026-11-26', hasta: '2026-12-02', esAdmin: false });
    expect(r.franjas).toHaveLength(12); // jueves y viernes
  });

  test('rango inválido → VALIDACION sin consultar', async () => {
    await expect(servicio.consultar({ desde: '2026-11-01', hasta: '2026-12-31', esAdmin: true })).rejects.toMatchObject({ motivo: 'VALIDACION' });
  });
});

describe('esFranjaHabilitada', () => {
  const habilitada = (inicio) => enTransaccion(bd, (c) => servicio.esFranjaHabilitada(c, inicio));

  test('franja válida de una semana publicada → { semanaId, capacidad }', async () => {
    const s = await insertarSemana(conn, { fecha_inicio: '2026-11-23', capacidad_franja: 2 });
    expect(await habilitada(lun9)).toEqual({ semanaId: s, capacidad: 2 });
  });

  test.each([
    ['semana en borrador', { estado: 'borrador' }, lun9],
    ['semana cerrada', { estado: 'cerrada' }, lun9],
    ['hora que no es una franja (11:00)', {}, new Date('2026-11-23T16:00:00Z')],
    ['sábado', {}, new Date('2026-11-28T13:00:00Z')],
    ['sin semana creada', null, new Date('2026-12-07T14:00:00Z')],
  ])('%s → null', async (_, semana, inicio) => {
    if (semana) await insertarSemana(conn, { fecha_inicio: '2026-11-23', ...semana });
    expect(await habilitada(inicio)).toBeNull();
  });

  test('franja bloqueada → null', async () => {
    const s = await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    await insertarBloqueo(conn, { semana_id: s, inicio: lun9, fin: new Date(lun9.getTime() + 3600000) });
    expect(await habilitada(lun9)).toBeNull();
  });

  test('festivo aunque nadie lo haya bloqueado → null', async () => {
    await insertarSemana(conn, { fecha_inicio: '2026-11-16' });
    expect(await habilitada(new Date('2026-11-16T14:00:00Z'))).toBeNull();
  });

  test('mantiene un bloqueo compartido sobre la semana hasta el commit (serializa con crear bloqueos)', async () => {
    const s = await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    const otra = await abrirConexion();
    try {
      await otra.query('SET SESSION innodb_lock_wait_timeout = 1');
      let liberar;
      const espera = new Promise((r) => { liberar = r; });
      const transaccion = enTransaccion(bd, async (c) => {
        expect(await servicio.esFranjaHabilitada(c, lun9)).toEqual({ semanaId: s, capacidad: 1 });
        await espera; // la transacción sigue abierta mientras la otra conexión intenta bloquear la semana
      });
      await new Promise((r) => setTimeout(r, 100));
      await otra.beginTransaction();
      await expect(otra.execute('SELECT id FROM msj_semanas WHERE id = ? FOR UPDATE', [s])).rejects.toMatchObject({ code: 'ER_LOCK_WAIT_TIMEOUT' });
      await otra.rollback();
      liberar();
      await transaccion;
      await otra.beginTransaction();
      await otra.execute('SELECT id FROM msj_semanas WHERE id = ? FOR UPDATE', [s]); // ya liberada
      await otra.rollback();
    } finally {
      await otra.end();
    }
  });
});
