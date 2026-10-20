// Constantes de dominio TRIKIPELUDOS. NO incluye puntajes ni criterios: esos son datos (trk_criterios).
const ESTADOS = Object.freeze({
  INSCRITO: 'INSCRITO',
  PRESENTE: 'PRESENTE',
  EN_PASARELA: 'EN_PASARELA',
  PRESENTADO: 'PRESENTADO',
  AUSENTE: 'AUSENTE'
});

// Estados que ven comentarista, jurados y pantalla (spec §4)
const ESTADOS_VISIBLES_PUBLICO = [ESTADOS.PRESENTE, ESTADOS.EN_PASARELA, ESTADOS.PRESENTADO];

const ROLES_OPERATIVOS = ['TRK_CABINA', 'TRK_COMENTARISTA', 'TRK_JURADO'];
const ROL_JURADO = 'TRK_JURADO';

const PERMISOS_TRK = [
  'administrar', 'importar', 'editar', 'calificaciones_desbloquear',
  'publicar', 'exportar', 'pasarela', 'cabina', 'calificar'
];

const MODULOS_API = ['AUTH', 'USR', 'IMP', 'PAR', 'PAS', 'EVT', 'RUB', 'CAL', 'CAT', 'RNK', 'EXP'];

// Heurísticas para advertencias del importador (§7.2). No afectan puntajes.
const RAZAS_PEQUENAS = [
  'pinscher', 'yorkie', 'yorkshire', 'chihuahua', 'pomerania', 'pomeranian', 'shih tzu', 'shitzu',
  'maltes', 'poodle toy', 'french poodle', 'pug', 'teckel', 'dachshund', 'salchicha', 'schnauzer mini',
  'bichon', 'pekines', 'jack russell', 'beagle'
];
const RAZAS_GRANDES = [
  'doberman', 'pit bull', 'pitbull', 'labrador', 'golden', 'pastor aleman', 'rottweiler', 'husky',
  'boxer', 'gran danes', 'san bernardo', 'dogo', 'akita', 'malinois', 'weimaraner', 'dalmata', 'bull terrier'
];

module.exports = {
  ESTADOS, ESTADOS_VISIBLES_PUBLICO, ROLES_OPERATIVOS, ROL_JURADO, PERMISOS_TRK, MODULOS_API,
  RAZAS_PEQUENAS, RAZAS_GRANDES
};
