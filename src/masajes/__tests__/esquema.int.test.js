const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { aplicarMigraciones } = require('../scripts/migrador');
const { insertarBeneficiario, insertarSemana, insertarCita, limpiar } = require('../testing/fabricas');

let conn;
beforeAll(async () => { conn = await abrirConexion(); });
afterAll(async () => { await conn.end(); });
beforeEach(() => limpiar(conn));

// CHECK exige MySQL ≥ 8.0.16 (antes se acepta y se ignora sin avisar): ver docs/masajes/verificarProduccion.sql.
const violaCheck = (nombre) => expect.objectContaining({ code: 'ER_CHECK_CONSTRAINT_VIOLATED', sqlMessage: expect.stringContaining(nombre) });
const duplicado = (indice) => expect.objectContaining({ code: 'ER_DUP_ENTRY', sqlMessage: expect.stringContaining(indice) });

async function semanaYDos() {
  const b1 = await insertarBeneficiario(conn, { correo: 'compartido@losolivos.co' });
  const b2 = await insertarBeneficiario(conn, { correo: 'compartido@losolivos.co' }); // correo repetido: válido
  const s = await insertarSemana(conn);
  const base = { semana_id: s, inicio: '2026-11-24 09:00:00', fin: '2026-11-24 10:00:00', periodo: '2026-11' };
  return { b1, b2, s, base };
}

describe('migraciones', () => {
  test('quedan registradas y un segundo intento no aplica nada', async () => {
    const [filas] = await conn.query('SELECT nombre FROM msj_migraciones ORDER BY nombre');
    expect(filas.map((f) => f.nombre)).toEqual(['001_esquema.sql']);
    expect(await aplicarMigraciones(conn)).toEqual([]);
  });

  test('todas las tablas son InnoDB con utf8mb4_unicode_ci', async () => {
    const [tablas] = await conn.query(
      `SELECT TABLE_NAME AS t, ENGINE AS e, TABLE_COLLATION AS c FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'msj\\_%' ORDER BY TABLE_NAME`,
    );
    expect(tablas.map((x) => x.t)).toEqual([
      'msj_beneficiarios', 'msj_bloqueos', 'msj_cita_historial', 'msj_citas', 'msj_migraciones', 'msj_notificaciones', 'msj_semanas',
    ]);
    for (const x of tablas) expect([x.t, x.e, x.c]).toEqual([x.t, 'InnoDB', 'utf8mb4_unicode_ci']);
  });
});

describe('concurrencia por índices UNIQUE con nombre explícito', () => {
  test('slot_key es único pero admite múltiples NULL', async () => {
    const { b1, b2, base } = await semanaYDos();
    await insertarCita(conn, { ...base, beneficiario_id: b1, slot_key: '2026-11-24T09:00#1', cupo_key: `${b1}:2026-11` });
    await expect(insertarCita(conn, { ...base, beneficiario_id: b2, slot_key: '2026-11-24T09:00#1', cupo_key: `${b2}:2026-11` }))
      .rejects.toEqual(duplicado('uq_msj_citas_slot_key'));
    await insertarCita(conn, { ...base, beneficiario_id: b2, estado: 'cancelada' });
    await insertarCita(conn, { ...base, beneficiario_id: b2, estado: 'cancelada' });
  });

  test('cupo_key: una cita activa por beneficiario y periodo', async () => {
    const { b1, base } = await semanaYDos();
    await insertarCita(conn, { ...base, beneficiario_id: b1, slot_key: '2026-11-24T09:00#1', cupo_key: `${b1}:2026-11` });
    await expect(insertarCita(conn, {
      ...base, inicio: '2026-11-25 09:00:00', fin: '2026-11-25 10:00:00', beneficiario_id: b1, slot_key: '2026-11-25T09:00#1', cupo_key: `${b1}:2026-11`,
    })).rejects.toEqual(duplicado('uq_msj_citas_cupo_key'));
  });

  test('ad_usuario único, con NULL repetido permitido', async () => {
    await insertarBeneficiario(conn, { ad_usuario: 'eortega' });
    await insertarBeneficiario(conn);
    await insertarBeneficiario(conn);
    await expect(insertarBeneficiario(conn, { ad_usuario: 'eortega' })).rejects.toEqual(duplicado('uq_msj_beneficiarios_ad_usuario'));
  });

  test('una sola semana por lunes', async () => {
    await insertarSemana(conn, { fecha_inicio: '2026-11-30' });
    await expect(insertarSemana(conn, { fecha_inicio: '2026-11-30' })).rejects.toEqual(duplicado('uq_msj_semanas_fecha_inicio'));
  });
});

describe('integridad (CHECK y FK)', () => {
  test('una cita cancelada nunca retiene franja ni cupo', async () => {
    const { b1, base } = await semanaYDos();
    await expect(insertarCita(conn, { ...base, beneficiario_id: b1, estado: 'cancelada', slot_key: 'x#1', cupo_key: null }))
      .rejects.toEqual(violaCheck('ck_msj_citas_claves'));
    await expect(insertarCita(conn, { ...base, beneficiario_id: b1, estado: 'cancelada', slot_key: null, cupo_key: 'x' }))
      .rejects.toEqual(violaCheck('ck_msj_citas_claves'));
  });

  test('una cita que consume cupo siempre tiene sus dos claves', async () => {
    const { b1, base } = await semanaYDos();
    for (const estado of ['agendada', 'asistio', 'no_asistio']) {
      await expect(insertarCita(conn, { ...base, beneficiario_id: b1, estado, slot_key: null, cupo_key: `${b1}:2026-11` }))
        .rejects.toEqual(violaCheck('ck_msj_citas_claves'));
    }
  });

  test('cancelar en sitio (UPDATE) sin limpiar las claves → rechazado', async () => {
    const { b1, base } = await semanaYDos();
    const id = await insertarCita(conn, { ...base, beneficiario_id: b1, slot_key: '2026-11-24T09:00#1', cupo_key: `${b1}:2026-11` });
    await expect(conn.execute("UPDATE msj_citas SET estado = 'cancelada' WHERE id = ?", [id])).rejects.toEqual(violaCheck('ck_msj_citas_claves'));
    await conn.execute("UPDATE msj_citas SET estado = 'cancelada', slot_key = NULL, cupo_key = NULL WHERE id = ?", [id]);
  });

  test('fin posterior al inicio y periodo con formato YYYY-MM', async () => {
    const { b1, base } = await semanaYDos();
    await expect(insertarCita(conn, { ...base, beneficiario_id: b1, fin: base.inicio, estado: 'cancelada' })).rejects.toEqual(violaCheck('ck_msj_citas_fin'));
    await expect(insertarCita(conn, { ...base, beneficiario_id: b1, periodo: '2026-13', estado: 'cancelada' })).rejects.toEqual(violaCheck('ck_msj_citas_periodo'));
  });

  test('una semana empieza en lunes y su capacidad está entre 1 y 20', async () => {
    await expect(insertarSemana(conn, { fecha_inicio: '2026-11-24' })).rejects.toEqual(violaCheck('ck_msj_semanas_lunes'));
    await expect(insertarSemana(conn, { fecha_inicio: '2026-11-30', capacidad_franja: 0 })).rejects.toEqual(violaCheck('ck_msj_semanas_capacidad'));
  });

  test('un bloqueo termina después de empezar', async () => {
    const s = await insertarSemana(conn);
    await expect(conn.execute(
      "INSERT INTO msj_bloqueos (semana_id, inicio, fin, motivo, creado_por) VALUES (?, '2026-11-24 10:00:00', '2026-11-24 10:00:00', 'spa', 't')", [s],
    )).rejects.toEqual(violaCheck('ck_msj_bloqueos_fin'));
  });

  test('cita con beneficiario o semana inexistente → FK', async () => {
    const { s, base } = await semanaYDos();
    await expect(insertarCita(conn, { ...base, semana_id: s, beneficiario_id: 999999, estado: 'cancelada' }))
      .rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });

  test('no se puede borrar un beneficiario con citas (RESTRICT)', async () => {
    const { b1, base } = await semanaYDos();
    await insertarCita(conn, { ...base, beneficiario_id: b1, estado: 'cancelada' });
    await expect(conn.execute('DELETE FROM msj_beneficiarios WHERE id = ?', [b1])).rejects.toMatchObject({ code: 'ER_ROW_IS_REFERENCED_2' });
  });

  test('historial: la autovinculación no lleva cita; las demás acciones sí', async () => {
    const b = await insertarBeneficiario(conn);
    await conn.execute(
      "INSERT INTO msj_cita_historial (beneficiario_id, cita_id, accion, usuario) VALUES (?, NULL, 'autovinculacion', 'eortega')", [b],
    );
    await expect(conn.execute(
      "INSERT INTO msj_cita_historial (beneficiario_id, cita_id, accion, usuario) VALUES (?, NULL, 'creada', 'eortega')", [b],
    )).rejects.toEqual(violaCheck('ck_msj_historial_cita'));
  });

  test('notificaciones: la clave de idempotencia es única', async () => {
    const { b1, base } = await semanaYDos();
    const c = await insertarCita(conn, { ...base, beneficiario_id: b1, slot_key: 'k#1', cupo_key: `${b1}:2026-11` });
    const sql = "INSERT INTO msj_notificaciones (cita_id, tipo, canal, clave) VALUES (?, 'spa_nueva', 'email', ?)";
    await conn.execute(sql, [c, `${c}:spa_nueva:email:2026-11-24T14:00:00.000Z`]);
    await expect(conn.execute(sql, [c, `${c}:spa_nueva:email:2026-11-24T14:00:00.000Z`])).rejects.toEqual(duplicado('uq_msj_notificaciones_clave'));
    const [[n]] = await conn.execute('SELECT estado, intentos FROM msj_notificaciones WHERE cita_id = ?', [c]);
    expect(n).toEqual({ estado: 'pendiente', intentos: 0 });
  });
});

describe('zona horaria (spec §6.5)', () => {
  test('el pool del módulo guarda los Date en hora Colombia y los devuelve como el mismo instante', async () => {
    const bd = crearBdDePrueba();
    try {
      const { b1, s } = await semanaYDos();
      const inicio = new Date('2026-11-24T14:00:00.000Z'); // 09:00 en Bogotá
      const [r] = await bd.obtener().execute(
        `INSERT INTO msj_citas (beneficiario_id, semana_id, inicio, fin, periodo, estado, slot_key, cupo_key, creado_por, actualizado_por)
         VALUES (?, ?, ?, ?, '2026-11', 'agendada', 'tz#1', ?, 't', 't')`,
        [b1, s, inicio, new Date(inicio.getTime() + 3600000), `${b1}:2026-11`],
      );
      const [[fila]] = await bd.obtener().execute(
        "SELECT inicio, DATE_FORMAT(inicio, '%Y-%m-%d %H:%i') AS local, @@session.time_zone AS tz FROM msj_citas WHERE id = ?", [r.insertId],
      );
      expect(fila.tz).toBe('-05:00');
      expect(fila.local).toBe('2026-11-24 09:00');
      expect(fila.inicio.toISOString()).toBe('2026-11-24T14:00:00.000Z');
    } finally {
      await bd.cerrar();
    }
  });
});
