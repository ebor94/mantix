/**
 * duelo_atenciones.service.js
 * Atenciones psicológicas del R-56.
 *
 * Está separado de duelo.service.js a propósito: `notas` es contenido clínico
 * y dato sensible según la Ley 1581 de 2012. Tenerlo en su propio archivo hace
 * que el permiso sea una frontera visible y que nadie lo arrastre por descuido
 * a una consulta general.
 */
const db = require('../config/db')
const { normalizarFechaHora } = require('../utils/fecha_hora')
const { malUso } = require('../utils/errores')
// El vocabulario del R-56 vive todo en duelo.catalogos.js, este incluido: ahí se
// lee de una sola vez que la modalidad de una ATENCIÓN (PRESENCIAL/TELEFONICA/
// VIRTUAL) y la de un SERVICIO (MODALIDADES: PRESENCIAL/VIRTUAL/MENSAJE) son dos
// listas distintas. Se sigue reexportando: es parte de lo que este servicio
// declara sobre la tabla que gobierna.
const { MODALIDADES_ATENCION } = require('../utils/duelo.catalogos')

async function atencionesDeGestion(gestionId) {
  // Las tres columnas DATETIME se formatean en SQL y viajan como texto de hora de
  // pared. El pool no define dateStrings, así que un DATETIME llegaría como Date y
  // Express lo serializaría en UTC: una atención de las 14:30 saldría como 19:30Z,
  // y el frontend solo recupera la hora guardada si el proceso corre en UTC-5.
  // Hoy lo hace, por herencia del entorno; si eso cambiara, la hora a la que se
  // atendió a una familia en duelo se correría en silencio. Con el texto ya
  // armado, ningún consumidor hace aritmética de zonas.
  //
  // La lista de columnas es explícita a propósito (nada de `SELECT *`): esta tabla
  // guarda historia clínica, y que una columna nueva salga en la respuesta tiene
  // que ser una decisión que se vea en el código y en las pruebas, no algo que
  // pase solo. Quien agregue una columna a la tabla decide aquí si sale; la prueba
  // de la lista (duelo.atenciones.test.js) se pone roja hasta que lo decida.
  //
  // El ORDER BY califica `momento` con la tabla: sin el nombre de la tabla MySQL
  // lo resuelve al alias de texto del SELECT, que llega solo hasta el minuto y
  // perdería los segundos. Dos atenciones del mismo minuto quedarían ordenadas por
  // id y no por su hora real. Calificada, ordena por el DATETIME y puede usar el
  // índice idx_gestion (gestion_id, momento).
  const [f] = await db.query(
    `SELECT id, gestion_id,
            DATE_FORMAT(momento, '%Y-%m-%d %H:%i') AS momento,
            modalidad, psicologa, acompanante,
            atendido_nombre, atendido_parentesco, motivo, notas, created_by,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updated_at
       FROM h360_duelo_atenciones WHERE gestion_id = ?
      ORDER BY h360_duelo_atenciones.momento ASC, id ASC`,
    [gestionId])
  return f
}

async function crearAtencion(gestionId, datos) {
  if (!MODALIDADES_ATENCION.includes(datos.modalidad))
    throw malUso('La modalidad de la atención no es válida')
  const cuando = normalizarFechaHora(datos.momento)
  if (!cuando) throw malUso('La fecha y hora de la atención no es válida')

  const [r] = await db.query(
    `INSERT INTO h360_duelo_atenciones
       (gestion_id, momento, modalidad, psicologa, acompanante,
        atendido_nombre, atendido_parentesco, motivo, notas, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [gestionId, cuando, datos.modalidad, datos.psicologa, datos.acompanante ?? null,
     datos.atendido_nombre ?? null, datos.atendido_parentesco ?? null,
     datos.motivo ?? null, datos.notas ?? null, datos.created_by])
  return r.insertId
}

module.exports = { atencionesDeGestion, crearAtencion, MODALIDADES_ATENCION }
