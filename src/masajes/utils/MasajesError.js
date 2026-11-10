const AppError = require('../../utils/AppError');

// Error operativo de Masajes: status HTTP + motivo estable + mensaje para el usuario (mismo contrato que Portería).
class MasajesError extends AppError {
  constructor(statusCode, motivo, message, errors) {
    super(message, statusCode);
    this.motivo = motivo;
    if (errors) this.errors = errors;
  }
}

const horas = (h) => (h === 1 ? '1 hora' : `${h} horas`);

/**
 * Errores de dominio (spec §8). Fábricas: cada llamada crea un error nuevo con su propio stack.
 * Los mensajes van directo al usuario: nunca incluyen datos de otras personas ni detalles internos.
 */
const E = Object.freeze({
  NO_AUTENTICADO: () => new MasajesError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida.'),
  NO_BENEFICIARIO: () => new MasajesError(403, 'NO_BENEFICIARIO', 'No estás en el listado de beneficiarios. Comunícate con Talento Humano.'),
  NO_ADMIN: () => new MasajesError(403, 'NO_ADMIN', 'No tienes permisos de administrador de la agenda.'),
  // Mismo mensaje si no existe o si es de otra persona: no revela qué ids existen (spec §8).
  NO_ENCONTRADA: () => new MasajesError(404, 'NO_ENCONTRADA', 'La cita no existe.'),
  SLOT_OCUPADO: () => new MasajesError(409, 'SLOT_OCUPADO', 'Esa franja acaba de ser tomada. Elige otra.'),
  CUPO_MES_USADO: () => new MasajesError(409, 'CUPO_MES_USADO', 'Ya tienes una sesión agendada para ese mes.'),
  SLOT_CON_CITA: () => new MasajesError(409, 'SLOT_CON_CITA', 'Esa franja tiene una cita activa: reprográmala antes de bloquearla.'),
  SEMANA_DUPLICADA: () => new MasajesError(409, 'SEMANA_DUPLICADA', 'Ya existe una semana que empieza ese lunes.'),
  FUERA_DE_VENTANA: () => new MasajesError(422, 'FUERA_DE_VENTANA', 'Esa franja no está habilitada.'),
  ANTICIPACION_INSUFICIENTE: (h = 24) => new MasajesError(
    422, 'ANTICIPACION_INSUFICIENTE', `Los cambios se permiten hasta ${horas(h)} antes de la cita.`,
  ),
  ESTADO_INVALIDO: () => new MasajesError(422, 'ESTADO_INVALIDO', 'La cita ya no se puede modificar.'),
  VALIDACION: (errors) => new MasajesError(400, 'VALIDACION', 'Revisa los datos enviados.', errors),
});

module.exports = MasajesError;
module.exports.E = E;
