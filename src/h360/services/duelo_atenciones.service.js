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

const MODALIDADES_ATENCION = ['PRESENCIAL', 'TELEFONICA', 'VIRTUAL']

async function atencionesDeGestion(gestionId) {
  const [f] = await db.query(
    'SELECT * FROM h360_duelo_atenciones WHERE gestion_id = ? ORDER BY momento ASC, id ASC',
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
