// ÚNICA salida de datos de participantes (REST y sockets). Lista blanca por nivel (RNF-5).
const { primerNombre } = require('./normalizar');

const CAMPOS_PUBLICOS = [
  'id', 'categoria_id', 'mascota_nombre', 'especie', 'raza', 'edad_texto', 'sexo', 'disfraz_nombre',
  'foto_inscripcion_url', 'estado', 'orden_pasarela', 'llegada_at'
];
const CAMPOS_SOLO_COMPLETO = [
  'categoria_propuesta_id', 'responsable_nombre', 'responsable_documento', 'responsable_telefono', 'responsable_correo',
  'autoriza_datos', 'autoriza_reglamento', 'fecha_inscripcion', 'notas_importacion', 'advertencias_importacion',
  'origen', 'fusionado_en_id', 'desempate_manual', 'foto_oficial_at', 'created_at', 'updated_at'
];

function urlFoto(nombreArchivo) {
  if (!nombreArchivo) return null;
  return `${process.env.TRK_FOTOS_URL_BASE || '/uploads/trk/fotos'}/${nombreArchivo}`;
}

function serializarParticipante(participante, nivel) {
  if (!participante) return null;
  const plano = typeof participante.get === 'function' ? participante.get({ plain: true }) : participante;
  const campos = nivel === 'COMPLETO' ? [...CAMPOS_PUBLICOS, ...CAMPOS_SOLO_COMPLETO] : CAMPOS_PUBLICOS;
  const salida = {};
  for (const campo of campos) if (campo in plano) salida[campo] = plano[campo];
  salida.responsable_primer_nombre = primerNombre(plano.responsable_nombre);
  salida.foto_url = urlFoto(plano.foto_oficial_path);
  if (plano.categoria) salida.categoria = { id: plano.categoria.id, codigo: plano.categoria.codigo, nombre: plano.categoria.nombre, color: plano.categoria.color ?? null };
  return salida;
}

module.exports = { serializarParticipante, urlFoto, CAMPOS_PUBLICOS };
