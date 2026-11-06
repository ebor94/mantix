/**
 * duelo.catalogos.js
 * Vocabulario del R-56. Va en código y no en tabla de catálogo: los seis
 * servicios no han cambiado en un año y agregar uno es una línea. Si empiezan
 * a cambiar seguido, conviene la tabla.
 *
 * Los valores salen de medir el Excel que llevan hoy, no de inventarlos.
 */
const SERVICIOS = [
  'CARTILLA_RENACER', 'CONFERENCIA_RENACER', 'MISA_DE_MES',
  'TALLER_NINOS', 'GRUPO_APOYO_HIJOS', 'TALLER_JOVENES',
]

/**
 * El Excel metía tres cosas distintas en una celda: si la familia acepta, por
 * qué medio se le ofreció, y por qué no le aplica. Acá son columnas separadas.
 */
const ESTADOS_SERVICIO = [
  'ACEPTA', 'NO_DESEA', 'NO_APLICA',
  'OFRECIDO_SIN_RESPUESTA', 'FUERA_DE_CIUDAD', 'DESISTE',
]

const MODALIDADES = ['PRESENCIAL', 'VIRTUAL', 'MENSAJE']

/**
 * La modalidad de una ATENCIÓN psicológica: el ENUM de la tabla de atenciones.
 *
 * Son DOS vocabularios distintos y el parecido de los nombres es la trampa:
 * MODALIDADES (arriba) es por qué medio se ofreció o se entregó un servicio del
 * R-56 —el SI/SIV del Excel— y esta es cómo se atendió a la familia. Ninguna
 * sirve para validar lo de la otra: un servicio por MENSAJE no es una atención y
 * una atención TELEFONICA no es una modalidad de servicio. Están las dos acá
 * porque todo el vocabulario del módulo vive en este archivo; así la diferencia
 * se lee de una sola vez, en vez de en dos archivos que nadie compara.
 */
const MODALIDADES_ATENCION = ['PRESENCIAL', 'TELEFONICA', 'VIRTUAL']

/** Solo aplica a la misa de mes. */
const RELIGIONES_MISA = ['CRISTIANA', 'CATOLICA', 'MIXTA', 'MUSULMANA', 'TESTIGOS_JEHOVA']

/** La palabra que el R-56 exige en su columna de tipificación. */
const TIPIFICACIONES = [
  'OFRECIDO_EN_HOMENAJE', 'ATENCION_EN_HOMENAJE',
  'OFRECIDO_POR_LLAMADA', 'ATENCION_POR_LLAMADA',
  'OFRECIDO_POR_MENSAJE', 'COORDINA_ASISTENCIA',
  'NO_CONTESTO', 'REPETIDO',
]

/** Lo que mueve la bandeja. No es lo mismo que la tipificación. */
const ESTADOS_GESTION = [
  'PENDIENTE', 'EN_GESTION', 'GESTIONADA', 'NO_LOGRADA', 'NO_APLICA', 'REPETIDA',
]

const CANALES_INTENTO = [
  'VISITA_SALA', 'VISITA_RESIDENCIA', 'LLAMADA', 'MENSAJE', 'WHATSAPP',
]

const RESULTADOS_INTENTO = [
  'CONTACTADO', 'NO_CONTESTO', 'NUMERO_ERRADO', 'NO_DISPONIBLE', 'RECHAZA',
]

const UBICACIONES = ['SALA', 'RESIDENCIA', 'OTRA_CIUDAD', 'EXTERNA', 'OTRO']

/**
 * La sede del ERP, comparable: en mayúsculas, con un solo espacio entre palabras
 * y recortada. El ERP la escribe a mano («Sede  Arauca» llega con dos espacios).
 *
 * Es UNA función y la usan los dos sitios que miran la sede: esMascota (acá
 * abajo) y la rama de otra ciudad del controlador. Antes cada uno normalizaba y
 * comparaba a su manera —uno con === sobre el texto completo, el otro por
 * contenido—, y entonces una sede como «MASCOTAS CUCUTA» era local para la rama
 * y no era mascota acá: la insignia de la bandeja habría dicho persona mientras
 * la fila guardada decía mascota, y la fila es la que alimenta el informe.
 */
const normalizarSede = sede => String(sede ?? '').toUpperCase().replace(/\s+/g, ' ').trim()

/**
 * El ERP mezcla servicios de mascotas con los de personas: 41 al mes. Se
 * reconocen por el prefijo de la orden o por su centro de costo propio.
 * Entran a la bandeja marcadas, no se esconden.
 *
 * El centro de costo se busca por CONTENIDO y no con ===, igual que las sedes
 * locales del controlador (donde «MASCOTAS» es una de ellas): así una variante
 * como «Sede Mascotas» cae del mismo lado en los dos sitios.
 */
function esMascota(orden) {
  const num  = String(orden?.orden_servicio ?? '').trim().toUpperCase()
  const sede = normalizarSede(orden?.sede)
  return num.startsWith('MAS-') || (sede !== '' && sede.includes('MASCOTAS'))
}

module.exports = {
  SERVICIOS, ESTADOS_SERVICIO, MODALIDADES, MODALIDADES_ATENCION, RELIGIONES_MISA,
  TIPIFICACIONES, ESTADOS_GESTION, CANALES_INTENTO, RESULTADOS_INTENTO,
  UBICACIONES, normalizarSede, esMascota,
}
