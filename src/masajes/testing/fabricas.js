// Inserciones mínimas para las pruebas de integración. Siempre con placeholders: nada de interpolar valores.
let secuencia = 0;
const siguiente = () => { secuencia += 1; return secuencia; };

async function insertarBeneficiario(conn, datos = {}) {
  const n = siguiente();
  const d = { nombre: `Beneficiario ${n}`, cargo: 'Asesor', celular: `5730000${String(n).padStart(5, '0')}`, correo: `b${n}@losolivos.co`, ad_usuario: null, activo: 1, ...datos };
  const [r] = await conn.execute(
    'INSERT INTO msj_beneficiarios (nombre, cargo, celular, correo, ad_usuario, activo) VALUES (?, ?, ?, ?, ?, ?)',
    [d.nombre, d.cargo, d.celular, d.correo, d.ad_usuario, d.activo],
  );
  return r.insertId;
}

async function insertarSemana(conn, datos = {}) {
  const d = { fecha_inicio: '2026-11-23', estado: 'publicada', capacidad_franja: 1, creado_por: 'test', ...datos };
  const [r] = await conn.execute(
    'INSERT INTO msj_semanas (fecha_inicio, estado, capacidad_franja, creado_por) VALUES (?, ?, ?, ?)',
    [d.fecha_inicio, d.estado, d.capacidad_franja, d.creado_por],
  );
  return r.insertId;
}

async function insertarCita(conn, d) {
  const [r] = await conn.execute(
    `INSERT INTO msj_citas (beneficiario_id, semana_id, inicio, fin, periodo, estado, slot_key, cupo_key, creado_por, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.beneficiario_id, d.semana_id, d.inicio, d.fin, d.periodo, d.estado ?? 'agendada',
      d.slot_key ?? null, d.cupo_key ?? null, d.creado_por ?? 'test', d.actualizado_por ?? 'test'],
  );
  return r.insertId;
}

async function insertarBloqueo(conn, d) {
  const [r] = await conn.execute(
    'INSERT INTO msj_bloqueos (semana_id, inicio, fin, motivo, detalle, creado_por) VALUES (?, ?, ?, ?, ?, ?)',
    [d.semana_id, d.inicio, d.fin, d.motivo ?? 'spa', d.detalle ?? null, d.creado_por ?? 'test'],
  );
  return r.insertId;
}

/** Borra los datos de las tablas del módulo entre pruebas (en orden de dependencias). */
async function limpiar(conn) {
  for (const t of ['msj_notificaciones', 'msj_cita_historial', 'msj_citas', 'msj_bloqueos', 'msj_semanas', 'msj_beneficiarios']) {
    await conn.query(`DELETE FROM ${t}`); // nombre de tabla de una lista fija, no de una entrada
  }
}

module.exports = { insertarBeneficiario, insertarSemana, insertarCita, insertarBloqueo, limpiar };
