const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar, insertarBeneficiario, insertarSemana } = require('../testing/fabricas');
const { configDePrueba } = require('../testing/appPrueba');
const { crearServicios } = require('../services');

let conn;
let bd;
let reloj;
let citas;
const AHORA = new Date('2026-11-20T13:00:00Z'); // viernes 20-nov 8:00 local
const lun9 = new Date('2026-11-23T14:00:00Z');
const mar9 = new Date('2026-11-24T14:00:00Z');
beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  ({ citas } = crearServicios({ bd, obtenerConfig: configDePrueba, reloj: () => reloj }));
});
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(async () => {
  reloj = AHORA;
  await limpiar(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  await insertarSemana(conn, { fecha_inicio: '2026-11-30' });
});

const motivo = async (p) => { try { await p; } catch (e) { return e.motivo || e.message; } return 'NO_LANZO'; };
const filas = async (sql, p = []) => (await conn.query(sql, p))[0];
const notifs = async (citaId) => (await filas('SELECT tipo, estado, clave FROM msj_notificaciones WHERE cita_id = ?', [citaId]))
  .map((n) => ({ ...n, inicio: n.clave.split(':').slice(3).join(':') })).sort((a, b) => (a.tipo + a.inicio).localeCompare(b.tipo + b.inicio));
const pendientes = async (citaId) => (await notifs(citaId)).filter((n) => n.estado === 'pendiente').map((n) => `${n.tipo}@${n.inicio}`);
const marcarEnviado = (citaId, tipo) => conn.execute("UPDATE msj_notificaciones SET estado = 'enviado' WHERE cita_id = ? AND tipo = ?", [citaId, tipo]);

async function citaDe(inicio = lun9) {
  const b = await insertarBeneficiario(conn);
  const c = await citas.agendar({ beneficiarioId: b, inicio, actor: 'emp', esAdmin: false });
  return { b, c };
}
const reprogramar = (c, inicio, extra = {}) => citas.reprogramar({ citaId: c.id, inicio, actor: 'emp', esAdmin: false, beneficiarioIdActor: c.beneficiario_id, ...extra });
const cancelar = (c, extra = {}) => citas.cancelar({ citaId: c.id, actor: 'emp', esAdmin: false, beneficiarioIdActor: c.beneficiario_id, ...extra });

describe('cancelar', () => {
  test('libera franja y cupo, deja historial y el beneficiario puede volver a agendar ese mes', async () => {
    const { b, c } = await citaDe();
    const r = await cancelar(c, { motivo: '  Viaje\r\n de trabajo ' });
    expect(r).toMatchObject({ id: c.id, estado: 'cancelada' });
    expect(await filas('SELECT estado, slot_key, cupo_key, motivo_cancelacion, actualizado_por FROM msj_citas WHERE id = ?', [c.id]))
      .toEqual([{ estado: 'cancelada', slot_key: null, cupo_key: null, motivo_cancelacion: 'Viaje de trabajo', actualizado_por: 'emp' }]);
    expect(await filas("SELECT accion, motivo FROM msj_cita_historial WHERE cita_id = ? AND accion = 'cancelada'", [c.id])).toEqual([{ accion: 'cancelada', motivo: 'Viaje de trabajo' }]);
    const otraPersona = await insertarBeneficiario(conn);
    await citas.agendar({ beneficiarioId: otraPersona, inicio: lun9, actor: 'x', esAdmin: false }); // franja libre
    await citas.agendar({ beneficiarioId: b, inicio: mar9, actor: 'emp', esAdmin: false }); // cupo libre
  });

  test('si el spa nunca supo de la cita: se descartan los avisos pendientes y no se le escribe', async () => {
    const { c } = await citaDe();
    await cancelar(c);
    expect(await pendientes(c.id)).toEqual(['calendar_delete@2026-11-23T14:00:00.000Z', 'empleado_cancelacion@2026-11-23T14:00:00.000Z']);
    expect((await notifs(c.id)).filter((n) => n.estado === 'descartado').map((n) => n.tipo).sort()).toEqual(['calendar_upsert', 'empleado_confirmacion', 'empleado_confirmacion', 'spa_nueva']);
  });

  test('si el spa ya recibió la cita: se le avisa la cancelación', async () => {
    const { c } = await citaDe();
    await marcarEnviado(c.id, 'spa_nueva');
    await cancelar(c);
    expect(await pendientes(c.id)).toContain('spa_cancelada@2026-11-23T14:00:00.000Z');
  });

  test('empleado: cita de otra persona → NO_ENCONTRADA y la cita queda intacta', async () => {
    const { c } = await citaDe();
    const intruso = await insertarBeneficiario(conn);
    expect(await motivo(cancelar(c, { beneficiarioIdActor: intruso }))).toBe('NO_ENCONTRADA');
    expect(await motivo(cancelar({ ...c, id: 999999 }))).toBe('NO_ENCONTRADA');
    expect(await filas('SELECT estado FROM msj_citas WHERE id = ?', [c.id])).toEqual([{ estado: 'agendada' }]);
  });

  test('empleado sin beneficiario propio no toca ninguna cita', async () => {
    const { c } = await citaDe();
    expect(await motivo(cancelar(c, { beneficiarioIdActor: undefined }))).toBe('NO_ENCONTRADA');
    expect(await motivo(cancelar(c, { beneficiarioIdActor: null }))).toBe('NO_ENCONTRADA');
  });

  test('con menos de 24 h: el empleado no puede, el admin sí (con motivo obligatorio)', async () => {
    const { c } = await citaDe();
    reloj = new Date('2026-11-22T15:00:00Z'); // domingo 10:00, faltan 23 h
    expect(await motivo(cancelar(c))).toBe('ANTICIPACION_INSUFICIENTE');
    expect(await motivo(cancelar(c, { esAdmin: true, actor: 'admin1' }))).toBe('VALIDACION');
    expect(await motivo(cancelar(c, { esAdmin: true, actor: 'admin1', motivo: '   ' }))).toBe('VALIDACION');
    const r = await cancelar(c, { esAdmin: true, actor: 'admin1', beneficiarioIdActor: undefined, motivo: 'El spa cerró' });
    expect(r.estado).toBe('cancelada');
    expect(await filas("SELECT es_admin, usuario FROM msj_cita_historial WHERE cita_id = ? AND accion = 'cancelada'", [c.id])).toEqual([{ es_admin: 1, usuario: 'admin1' }]);
  });

  test('una cita ya cancelada o atendida → ESTADO_INVALIDO', async () => {
    const { c } = await citaDe();
    await cancelar(c);
    expect(await motivo(cancelar(c))).toBe('ESTADO_INVALIDO');
    const { c: c2 } = await citaDe(mar9);
    await conn.execute("UPDATE msj_citas SET estado = 'asistio' WHERE id = ?", [c2.id]);
    expect(await motivo(cancelar(c2, { esAdmin: true, motivo: 'x' }))).toBe('ESTADO_INVALIDO');
  });

  test('motivo de más de 255 caracteres → VALIDACION', async () => {
    const { c } = await citaDe();
    expect(await motivo(cancelar(c, { motivo: 'x'.repeat(256) }))).toBe('VALIDACION');
  });

  test('dos cancelaciones simultáneas de la misma cita → una gana, una sola vez en el historial', async () => {
    const { c } = await citaDe();
    const r = await Promise.allSettled([cancelar(c), cancelar(c)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected').reason.motivo).toBe('ESTADO_INVALIDO');
    expect(await filas("SELECT COUNT(*) AS n FROM msj_cita_historial WHERE cita_id = ? AND accion = 'cancelada'", [c.id])).toEqual([{ n: 1 }]);
  });
});

describe('reprogramar', () => {
  test('misma fila, nuevo inicio, slot y semana; historial con anterior y nuevo', async () => {
    const { c } = await citaDe();
    const lunSig = new Date('2026-11-30T14:00:00Z');
    const r = await reprogramar(c, lunSig);
    expect(r).toMatchObject({ id: c.id, estado: 'agendada', periodo: '2026-11' });
    const [fila] = await filas("SELECT DATE_FORMAT(inicio, '%Y-%m-%d %H:%i') AS ini, slot_key, cupo_key FROM msj_citas WHERE id = ?", [c.id]);
    expect(fila).toEqual({ ini: '2026-11-30 09:00', slot_key: '2026-11-30T09:00#1', cupo_key: `${c.beneficiario_id}:2026-11` });
    const [h] = await filas("SELECT inicio_anterior, inicio_nuevo FROM msj_cita_historial WHERE cita_id = ? AND accion = 'reprogramada'", [c.id]);
    expect([h.inicio_anterior.toISOString(), h.inicio_nuevo.toISOString()]).toEqual([lun9.toISOString(), lunSig.toISOString()]);
    expect(await filas('SELECT COUNT(*) AS n FROM msj_citas')).toEqual([{ n: 1 }]);
  });

  test('avisos: descarta los pendientes del horario anterior y encola los del nuevo', async () => {
    const { c } = await citaDe();
    await reprogramar(c, mar9);
    expect(await pendientes(c.id)).toEqual([
      'calendar_upsert@2026-11-24T14:00:00.000Z', 'empleado_confirmacion@2026-11-24T14:00:00.000Z', 'empleado_confirmacion@2026-11-24T14:00:00.000Z', 'spa_nueva@2026-11-24T14:00:00.000Z',
    ]);
  });

  test('si el spa ya conocía la cita recibe "reprogramada" en vez de "nueva"', async () => {
    const { c } = await citaDe();
    await marcarEnviado(c.id, 'spa_nueva');
    await reprogramar(c, mar9);
    const p = await pendientes(c.id);
    expect(p).toContain('spa_reprogramada@2026-11-24T14:00:00.000Z');
    expect(p.some((x) => x.startsWith('spa_nueva'))).toBe(false);
  });

  test('a una franja ocupada → SLOT_OCUPADO y la cita original queda intacta (rollback)', async () => {
    const { c } = await citaDe();
    await citaDe(mar9);
    expect(await motivo(reprogramar(c, mar9))).toBe('SLOT_OCUPADO');
    const [f] = await filas('SELECT inicio, slot_key FROM msj_citas WHERE id = ?', [c.id]);
    expect([f.inicio.toISOString(), f.slot_key]).toEqual([lun9.toISOString(), '2026-11-23T09:00#1']);
    expect(await pendientes(c.id)).toHaveLength(4); // ni descartó ni encoló nada
  });

  test('a otro mes donde ya tiene cita → CUPO_MES_USADO; a otro mes libre → cambia periodo y cupo', async () => {
    await insertarSemana(conn, { fecha_inicio: '2026-12-07' });
    const { b, c } = await citaDe();
    const dic = await citas.agendar({ beneficiarioId: b, inicio: new Date('2026-12-01T14:00:00Z'), actor: 'emp', esAdmin: false });
    expect(await motivo(reprogramar(c, new Date('2026-12-02T14:00:00Z')))).toBe('CUPO_MES_USADO');
    await cancelar(dic);
    const r = await reprogramar(c, new Date('2026-12-02T14:00:00Z'));
    expect(r.periodo).toBe('2026-12');
    expect(await filas('SELECT cupo_key FROM msj_citas WHERE id = ?', [c.id])).toEqual([{ cupo_key: `${b}:2026-12` }]);
  });

  test('dos reprogramaciones simultáneas de la misma cita: se aplican en serie y el historial queda encadenado', async () => {
    const { c } = await citaDe();
    const destinos = [mar9, new Date('2026-11-25T14:00:00Z')];
    const r = await Promise.allSettled(destinos.map((d) => reprogramar(c, d)));
    expect(r.every((x) => x.status === 'fulfilled')).toBe(true);
    const h = await filas("SELECT inicio_anterior, inicio_nuevo FROM msj_cita_historial WHERE cita_id = ? AND accion = 'reprogramada' ORDER BY id", [c.id]);
    expect(h).toHaveLength(2);
    expect(h[0].inicio_anterior.toISOString()).toBe(lun9.toISOString());
    expect(h[1].inicio_anterior.toISOString()).toBe(h[0].inicio_nuevo.toISOString()); // la segunda partió de donde dejó la primera
    const [f] = await filas('SELECT inicio FROM msj_citas WHERE id = ?', [c.id]);
    expect(f.inicio.toISOString()).toBe(h[1].inicio_nuevo.toISOString());
  });

  test('un empleado no puede hacer más de 4 cambios en 24 h (cada uno escribe al spa); el admin sí', async () => {
    const { c } = await citaDe();
    const destinos = ['2026-11-24T14:00:00Z', '2026-11-25T14:00:00Z', '2026-11-26T14:00:00Z', '2026-11-27T14:00:00Z', '2026-11-24T15:00:00Z'].map((x) => new Date(x));
    for (const d of destinos.slice(0, 4)) await reprogramar(c, d);
    const r = await reprogramar(c, destinos[4]).catch((e) => e);
    expect(r).toMatchObject({ statusCode: 429, motivo: 'DEMASIADOS_CAMBIOS' });
    expect(await motivo(cancelar(c))).toBe('DEMASIADOS_CAMBIOS');
    expect((await reprogramar(c, destinos[4], { esAdmin: true, actor: 'admin1' })).estado).toBe('agendada');
  });

  test('a la misma franja → VALIDACION', async () => {
    const { c } = await citaDe();
    expect(await motivo(reprogramar(c, lun9))).toBe('VALIDACION');
  });

  test('empleado con menos de 24 h para la cita actual → ANTICIPACION_INSUFICIENTE; admin pasa', async () => {
    const { c } = await citaDe();
    reloj = new Date('2026-11-22T15:00:00Z');
    expect(await motivo(reprogramar(c, mar9))).toBe('ANTICIPACION_INSUFICIENTE');
    expect((await reprogramar(c, mar9, { esAdmin: true, actor: 'admin1' })).estado).toBe('agendada');
  });

  test('empleado: el destino también necesita 24 h de anticipación', async () => {
    const { c } = await citaDe(mar9);
    reloj = new Date('2026-11-22T15:00:00Z'); // domingo 10:00
    expect(await motivo(reprogramar(c, new Date('2026-11-23T14:00:00Z')))).toBe('ANTICIPACION_INSUFICIENTE'); // lunes 9:00, faltan 23 h
  });

  test.each([
    ['destino en semana no publicada', new Date('2026-12-07T14:00:00Z')],
    ['destino que no es franja', new Date('2026-11-24T16:00:00Z')],
    ['destino inválido', 'mañana'],
  ])('%s → FUERA_DE_VENTANA', async (_, destino) => {
    const { c } = await citaDe();
    expect(await motivo(reprogramar(c, destino))).toBe('FUERA_DE_VENTANA');
  });

  test('empleado: cita de otra persona → NO_ENCONTRADA y nada cambia', async () => {
    const { c } = await citaDe();
    const intruso = await insertarBeneficiario(conn);
    expect(await motivo(reprogramar(c, mar9, { beneficiarioIdActor: intruso }))).toBe('NO_ENCONTRADA');
    const [f] = await filas('SELECT inicio FROM msj_citas WHERE id = ?', [c.id]);
    expect(f.inicio.toISOString()).toBe(lun9.toISOString());
  });

  test('cita cancelada → ESTADO_INVALIDO', async () => {
    const { c } = await citaDe();
    await cancelar(c);
    expect(await motivo(reprogramar(c, mar9, { esAdmin: true }))).toBe('ESTADO_INVALIDO');
  });

  test('id que no es entero positivo → NO_ENCONTRADA sin consultar', async () => {
    for (const citaId of ['1', 0, -1, 1.5, null]) {
      expect(await motivo(citas.reprogramar({ citaId, inicio: mar9, actor: 'emp', esAdmin: true }))).toBe('NO_ENCONTRADA');
    }
  });
});
