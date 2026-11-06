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
 * El ERP mezcla servicios de mascotas con los de personas: 41 al mes. Se
 * reconocen por el prefijo de la orden o por su centro de costo propio.
 * Entran a la bandeja marcadas, no se esconden.
 */
function esMascota(orden) {
  const num  = String(orden?.orden_servicio ?? '').trim().toUpperCase()
  const sede = String(orden?.sede ?? '').trim().toUpperCase()
  return num.startsWith('MAS-') || sede === 'MASCOTAS'
}

module.exports = {
  SERVICIOS, ESTADOS_SERVICIO, MODALIDADES, RELIGIONES_MISA,
  TIPIFICACIONES, ESTADOS_GESTION, CANALES_INTENTO, RESULTADOS_INTENTO,
  UBICACIONES, esMascota,
}
