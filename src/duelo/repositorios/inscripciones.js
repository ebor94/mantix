// Acceso a datos de las inscripciones. Todo el SQL del módulo vive aquí.
const DueloError = require('../utils/DueloError');

const COLUMNAS_LISTADO = `id, nombre_completo, cedula, celular, correo, honra_companero, correo_enviado,
  utm_source, utm_medium, utm_campaign, utm_content, created_at`;

function crearRepositorioInscripciones(bd) {
  async function existeCedula(cedula) {
    const [filas] = await bd.obtener().query('SELECT 1 FROM duelo_inscripciones WHERE cedula = ? LIMIT 1', [cedula]);
    return filas.length > 0;
  }

  async function crear(i, companeros) {
    const conn = await bd.obtener().getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.query(
        `INSERT INTO duelo_inscripciones
           (nombre_completo, cedula, celular, correo, honra_companero, acepta_politica, version_politica,
            fecha_aceptacion, ip, user_agent, utm_source, utm_medium, utm_campaign, utm_content, fbclid)
         VALUES (?, ?, ?, ?, ?, 1, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
        [i.nombre_completo, i.cedula, i.celular, i.correo, i.honra_companero ? 1 : 0, i.version_politica,
          i.ip || null, (i.user_agent || '').slice(0, 500) || null,
          i.utm.utm_source, i.utm.utm_medium, i.utm.utm_campaign, i.utm.utm_content, i.utm.fbclid],
      );
      for (const c of companeros) {
        await conn.query(
          `INSERT INTO duelo_companeros (inscripcion_id, orden, nombre, foto_ruta, foto_mime, foto_bytes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [r.insertId, c.orden, c.nombre, c.foto_ruta, c.foto_mime, c.foto_bytes],
        );
      }
      await conn.commit();
      return r.insertId;
    } catch (err) {
      await conn.rollback();
      // El mensaje de MySQL incluye la cédula: no se propaga ni se registra.
      if (err.code === 'ER_DUP_ENTRY') throw new DueloError(409, 'CEDULA_DUPLICADA', 'Ya tenemos tu inscripción');
      throw err;
    } finally {
      conn.release();
    }
  }

  async function marcarCorreo(id, enviado, error) {
    await bd.obtener().query(
      'UPDATE duelo_inscripciones SET correo_enviado = ?, correo_error = ? WHERE id = ?',
      [enviado ? 1 : 0, error ? String(error).slice(0, 255) : null, id],
    );
  }

  // Todo el listado: el panel filtra en el navegador (cédula y correo nunca viajan en la URL).
  async function listar() {
    const pool = bd.obtener();
    const [inscripciones] = await pool.query(
      `SELECT ${COLUMNAS_LISTADO} FROM duelo_inscripciones ORDER BY id DESC`,
    );
    const [companeros] = await pool.query(
      'SELECT id, inscripcion_id, orden, nombre FROM duelo_companeros ORDER BY inscripcion_id, orden',
    );
    const porInscripcion = new Map();
    for (const { inscripcion_id: inscripcionId, ...c } of companeros) {
      if (!porInscripcion.has(inscripcionId)) porInscripcion.set(inscripcionId, []);
      porInscripcion.get(inscripcionId).push(c);
    }
    const [[totales]] = await pool.query(
      `SELECT COUNT(*) AS inscritos, COALESCE(SUM(honra_companero), 0) AS honran,
              (SELECT COUNT(*) FROM duelo_companeros) AS fotos
       FROM duelo_inscripciones`,
    );
    return {
      inscripciones: inscripciones.map((i) => ({
        ...i,
        honra_companero: i.honra_companero === 1,
        correo_enviado: i.correo_enviado === 1,
        companeros: porInscripcion.get(i.id) || [],
      })),
      totales: { inscritos: Number(totales.inscritos), honran: Number(totales.honran), fotos: Number(totales.fotos) },
    };
  }

  async function companeroPorId(id) {
    const [filas] = await bd.obtener().query('SELECT id, foto_ruta FROM duelo_companeros WHERE id = ?', [id]);
    return filas[0] || null;
  }

  async function fotosParaZip() {
    const [filas] = await bd.obtener().query(
      `SELECT i.cedula, c.orden, c.nombre, c.foto_ruta
       FROM duelo_companeros c JOIN duelo_inscripciones i ON i.id = c.inscripcion_id
       ORDER BY i.id, c.orden`,
    );
    return filas;
  }

  return { existeCedula, crear, marcarCorreo, listar, companeroPorId, fotosParaZip };
}

module.exports = { crearRepositorioInscripciones };
