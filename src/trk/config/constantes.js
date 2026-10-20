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

module.exports = { ESTADOS, ESTADOS_VISIBLES_PUBLICO, ROLES_OPERATIVOS, ROL_JURADO, PERMISOS_TRK, MODULOS_API };
