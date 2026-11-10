const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar, insertarBeneficiario } = require('../testing/fabricas');
const { configDePrueba } = require('../testing/appPrueba');
const { crearServicios } = require('../services');
const { enTransaccion } = require('../utils/transaccion');
const citasRepo = require('../repositorios/citas');

let conn;
let bd;
let reloj;
let s;
const AHORA = new Date('2026-11-20T13:00:00Z'); // viernes 20-nov 8:00 local
const lun9 = new Date('2026-11-23T14:00:00Z');
beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  s = crearServicios({ bd, obtenerConfig: configDePrueba, reloj: () => reloj });
});
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(async () => { reloj = AHORA; await limpiar(conn); });

const motivo = async (p) => { try { await p; } catch (e) { return (e.errors && e.errors[0] && e.errors[0].motivo) || e.motivo || e.message; } return 'NO_LANZO'; };
const filas = async (sql, p = []) => (await conn.query(sql, p))[0];
const crear = (fecha = '2026-11-23', extra = {}) => s.semanas.crear({ fechaInicio: fecha, actor: 'admin1', ...extra });
const bloquear = (semanaId, inicio, fin, extra = {}) => s.semanas.agregarBloqueo({ semanaId, inicio, fin, motivo: 'spa', actor: 'admin1', ...extra });

describe('crear', () => {
  test('crea en borrador con capacidad 1 por defecto', async () => {
    const r = await crear();
    expect(r).toMatchObject({ fecha_inicio: '2026-11-23', estado: 'borrador', capacidad: 1 });
    expect(await filas('SELECT creado_por FROM msj_semanas')).toEqual([{ creado_por: 'admin1' }]);
  });

  test('genera el bloqueo del festivo (lunes 16-nov)', async () => {
    const r = await crear('2026-11-16');
    const b = await filas("SELECT DATE_FORMAT(inicio, '%Y-%m-%d %H:%i') AS i, DATE_FORMAT(fin, '%Y-%m-%d %H:%i') AS f, motivo FROM msj_bloqueos WHERE semana_id = ?", [r.id]);
    expect(b).toEqual([{ i: '2026-11-16 00:00', f: '2026-11-17 00:00', motivo: 'festivo' }]);
    expect(r.festivos).toEqual(['2026-11-16']);
  });

  test.each([
    ['no lunes', '2026-11-24', 'LUNES_REQUERIDO'],
    ['fecha inválida', '2026-02-30', 'LUNES_REQUERIDO'],
    ['texto', 'lunes', 'LUNES_REQUERIDO'],
  ])('%s → VALIDACION', async (_, fecha, m) => expect(await motivo(crear(fecha))).toBe(m));

  test.each([[0], [21], [1.5], ['2']])('capacidad %p → VALIDACION', async (capacidad) => {
    expect(await motivo(crear('2026-11-23', { capacidad }))).toBe('CAPACIDAD_INVALIDA');
  });

  test('duplicada → SEMANA_DUPLICADA (409)', async () => {
    await crear();
    expect(await motivo(crear())).toBe('SEMANA_DUPLICADA');
  });

  test('notas: se limpian y se limitan a 255', async () => {
    expect((await crear('2026-11-23', { notas: '  Cabina\r\n2 ' })).notas).toBe('Cabina 2');
    expect(await motivo(crear('2026-11-30', { notas: 'x'.repeat(256) }))).toBe('NOTAS_MUY_LARGAS');
  });
});

describe('publicar y cerrar', () => {
  test('borrador → publicada → cerrada; cerrar no toca las citas', async () => {
    const w = await crear();
    await s.semanas.publicar({ semanaId: w.id, actor: 'admin1' });
    const b = await insertarBeneficiario(conn);
    const c = await s.citas.agendar({ beneficiarioId: b, inicio: lun9, actor: 'e', esAdmin: false });
    await s.semanas.cerrar({ semanaId: w.id, actor: 'admin1' });
    expect(await filas('SELECT estado FROM msj_semanas WHERE id = ?', [w.id])).toEqual([{ estado: 'cerrada' }]);
    expect(await filas('SELECT estado FROM msj_citas WHERE id = ?', [c.id])).toEqual([{ estado: 'agendada' }]);
    expect(await motivo(s.citas.agendar({ beneficiarioId: await insertarBeneficiario(conn), inicio: new Date('2026-11-24T14:00:00Z'), actor: 'e', esAdmin: false }))).toBe('FUERA_DE_VENTANA');
  });

  test('transiciones inválidas → ESTADO_INVALIDO', async () => {
    const w = await crear();
    expect(await motivo(s.semanas.cerrar({ semanaId: w.id, actor: 'a' }))).toBe('ESTADO_INVALIDO'); // borrador → cerrada
    await s.semanas.publicar({ semanaId: w.id, actor: 'a' });
    expect(await motivo(s.semanas.publicar({ semanaId: w.id, actor: 'a' }))).toBe('ESTADO_INVALIDO');
  });

  test('semana inexistente → NO_ENCONTRADA', async () => {
    expect(await motivo(s.semanas.publicar({ semanaId: 999999, actor: 'a' }))).toBe('NO_ENCONTRADA');
    expect(await motivo(s.semanas.publicar({ semanaId: '1', actor: 'a' }))).toBe('NO_ENCONTRADA');
  });
});

describe('bloqueos', () => {
  test('agregar y eliminar; la franja queda libre otra vez', async () => {
    const w = await crear();
    await s.semanas.publicar({ semanaId: w.id, actor: 'a' });
    const bl = await bloquear(w.id, new Date('2026-11-23T13:00:00Z'), new Date('2026-11-23T17:00:00Z'), { detalle: 'Mantenimiento' });
    let d = await s.disponibilidad.consultar({ desde: '2026-11-23', hasta: '2026-11-23', esAdmin: false });
    expect(d.franjas.filter((f) => f.estado === 'bloqueada')).toHaveLength(3);
    await s.semanas.eliminarBloqueo({ semanaId: w.id, bloqueoId: bl.id, actor: 'a' });
    d = await s.disponibilidad.consultar({ desde: '2026-11-23', hasta: '2026-11-23', esAdmin: false });
    expect(d.franjas.filter((f) => f.estado === 'bloqueada')).toHaveLength(0);
  });

  test('sobre una franja con cita activa → SLOT_CON_CITA; si la cita se canceló, sí se puede', async () => {
    const w = await crear();
    await s.semanas.publicar({ semanaId: w.id, actor: 'a' });
    const b = await insertarBeneficiario(conn);
    const c = await s.citas.agendar({ beneficiarioId: b, inicio: lun9, actor: 'e', esAdmin: false });
    expect(await motivo(bloquear(w.id, new Date('2026-11-23T13:00:00Z'), new Date('2026-11-23T17:00:00Z')))).toBe('SLOT_CON_CITA');
    await s.citas.cancelar({ citaId: c.id, actor: 'e', esAdmin: false, beneficiarioIdActor: b });
    await bloquear(w.id, new Date('2026-11-23T13:00:00Z'), new Date('2026-11-23T17:00:00Z'));
  });

  test.each([
    ['fin antes del inicio', new Date('2026-11-23T17:00:00Z'), new Date('2026-11-23T13:00:00Z'), 'RANGO_INVALIDO'],
    ['fuera de la semana', new Date('2026-11-30T13:00:00Z'), new Date('2026-11-30T17:00:00Z'), 'FUERA_DE_LA_SEMANA'],
    ['fecha inválida', 'x', new Date('2026-11-23T17:00:00Z'), 'RANGO_INVALIDO'],
  ])('%s → VALIDACION', async (_, ini, fin, m) => {
    const w = await crear();
    expect(await motivo(bloquear(w.id, ini, fin))).toBe(m);
  });

  test('motivo fuera de la lista → VALIDACION', async () => {
    const w = await crear();
    expect(await motivo(bloquear(w.id, lun9, new Date(lun9.getTime() + 3600000), { motivo: 'vacaciones' }))).toBe('MOTIVO_INVALIDO');
  });

  test('eliminar un bloqueo de OTRA semana desde esta → NO_ENCONTRADA y no se borra', async () => {
    const w1 = await crear('2026-11-23');
    const w2 = await crear('2026-11-30');
    const bl = await bloquear(w2.id, new Date('2026-11-30T13:00:00Z'), new Date('2026-11-30T14:00:00Z'));
    expect(await motivo(s.semanas.eliminarBloqueo({ semanaId: w1.id, bloqueoId: bl.id, actor: 'a' }))).toBe('NO_ENCONTRADA');
    expect(await filas('SELECT COUNT(*) AS n FROM msj_bloqueos')).toEqual([{ n: 1 }]);
  });

  test('carrera: una reserva sin confirmar y un bloqueo de la misma franja → el bloqueo espera y se rechaza', async () => {
    const w = await crear();
    await s.semanas.publicar({ semanaId: w.id, actor: 'a' });
    const b = await insertarBeneficiario(conn);
    let liberar;
    const espera = new Promise((r) => { liberar = r; });
    const reserva = enTransaccion(bd, async (c) => {
      const hab = await s.disponibilidad.esFranjaHabilitada(c, lun9);
      await citasRepo.insertarActiva(c, { beneficiarioId: b, semanaId: hab.semanaId, inicio: lun9, fin: new Date(lun9.getTime() + 3600000), periodo: '2026-11', slotKey: 'x#1', cupoKey: `${b}:2026-11`, actor: 'e' });
      await espera;
    });
    await new Promise((r) => setTimeout(r, 100));
    const bloqueo = bloquear(w.id, lun9, new Date(lun9.getTime() + 3600000));
    await new Promise((r) => setTimeout(r, 200));
    liberar();
    await reserva;
    expect(await motivo(bloqueo)).toBe('SLOT_CON_CITA');
    expect(await filas('SELECT COUNT(*) AS n FROM msj_bloqueos')).toEqual([{ n: 0 }]);
  });
});

// La carrera difícil: la reserva ya validó la franja (sin bloqueo a la vista) pero aún no inserta cuando el
// admin pide el bloqueo. Con REPEATABLE READ los gap locks de InnoDB ya la evitan; con READ COMMITTED no hay
// gap locks y lo único que la evita es el bloqueo de la fila de la semana (FOR SHARE vs FOR UPDATE).
// No sabemos qué aislamiento usa producción, así que se prueba con ambos.
describe.each(['REPEATABLE READ', 'READ COMMITTED'])('carrera intercalada reserva/bloqueo con %s', (aislamiento) => {
  let bdAislada;
  let sa;
  beforeAll(() => {
    const base = crearBdDePrueba();
    bdAislada = {
      cerrar: () => base.cerrar(),
      obtener: () => ({
        getConnection: async () => {
          const c = await base.obtener().getConnection();
          await c.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${aislamiento}`); // de una lista fija
          return c;
        },
      }),
    };
    sa = crearServicios({ bd: bdAislada, obtenerConfig: configDePrueba, reloj: () => reloj });
  });
  afterAll(() => bdAislada.cerrar());

  test('la reserva ya validó y el bloqueo llega antes del insert → el bloqueo espera y se rechaza', async () => {
    const w = await crear();
    await s.semanas.publicar({ semanaId: w.id, actor: 'a' });
    const b = await insertarBeneficiario(conn);
    let insertar;
    const puedeInsertar = new Promise((r) => { insertar = r; });
    let validada;
    const yaValido = new Promise((r) => { validada = r; });
    const reserva = enTransaccion(bdAislada, async (c) => {
      const hab = await sa.disponibilidad.esFranjaHabilitada(c, lun9);
      expect(hab).not.toBeNull();
      validada();
      await puedeInsertar;
      await citasRepo.insertarActiva(c, { beneficiarioId: b, semanaId: hab.semanaId, inicio: lun9, fin: new Date(lun9.getTime() + 3600000), periodo: '2026-11', slotKey: 'x#1', cupoKey: `${b}:2026-11`, actor: 'e' });
    });
    await yaValido;
    const bloqueo = sa.semanas.agregarBloqueo({ semanaId: w.id, inicio: lun9, fin: new Date(lun9.getTime() + 3600000), motivo: 'spa', actor: 'a' });
    await new Promise((r) => setTimeout(r, 200)); // el bloqueo ya está esperando la semana
    insertar();
    await reserva;
    expect(await motivo(bloqueo)).toBe('SLOT_CON_CITA');
    expect(await filas('SELECT COUNT(*) AS n FROM msj_bloqueos')).toEqual([{ n: 0 }]);
    expect(await filas('SELECT COUNT(*) AS n FROM msj_citas')).toEqual([{ n: 1 }]);
  });
});

describe('resumen de ocupación', () => {
  test('{ franjas, bloqueadas, capacidadTotal, ocupadas, libres }', async () => {
    const w = await crear('2026-11-16', { capacidad: 2 }); // festivo lunes 16 → 24 franjas
    await s.semanas.publicar({ semanaId: w.id, actor: 'a' });
    await bloquear(w.id, new Date('2026-11-17T13:00:00Z'), new Date('2026-11-17T14:00:00Z')); // mar 8:00
    reloj = new Date('2026-11-13T13:00:00Z');
    await s.citas.agendar({ beneficiarioId: await insertarBeneficiario(conn), inicio: new Date('2026-11-18T14:00:00Z'), actor: 'e', esAdmin: false });
    expect(await s.semanas.resumen({ semanaId: w.id })).toEqual({ franjas: 24, bloqueadas: 1, capacidadTotal: 46, ocupadas: 1, libres: 45 });
  });
});

describe('asistencia', () => {
  async function citaPasada() {
    const w = await crear();
    await s.semanas.publicar({ semanaId: w.id, actor: 'a' });
    const b = await insertarBeneficiario(conn);
    const c = await s.citas.agendar({ beneficiarioId: b, inicio: lun9, actor: 'e', esAdmin: false });
    reloj = new Date('2026-11-23T15:00:00Z'); // ya empezó
    return { b, c };
  }

  test('asistió / no asistió: el cupo sigue consumido y queda en historial', async () => {
    const { b, c } = await citaPasada();
    expect((await s.citas.marcarAsistencia({ citaId: c.id, asistio: false, actor: 'admin1' })).estado).toBe('no_asistio');
    expect(await filas('SELECT estado, cupo_key FROM msj_citas WHERE id = ?', [c.id])).toEqual([{ estado: 'no_asistio', cupo_key: `${b}:2026-11` }]);
    expect(await filas("SELECT motivo, es_admin FROM msj_cita_historial WHERE accion = 'asistencia'")).toEqual([{ motivo: 'no_asistio', es_admin: 1 }]);
    expect(await motivo(s.citas.marcarAsistencia({ citaId: c.id, asistio: true, actor: 'admin1' }))).toBe('ESTADO_INVALIDO');
  });

  test('una cita que aún no empieza → VALIDACION', async () => {
    const { c } = await citaPasada();
    reloj = AHORA;
    expect(await motivo(s.citas.marcarAsistencia({ citaId: c.id, asistio: true, actor: 'admin1' }))).toBe('AUN_NO_EMPIEZA');
  });

  test('asistio debe ser booleano', async () => {
    const { c } = await citaPasada();
    expect(await motivo(s.citas.marcarAsistencia({ citaId: c.id, asistio: 'true', actor: 'admin1' }))).toBe('ASISTIO_INVALIDO');
  });
});
