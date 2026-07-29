/**
 * Semántica del campo `afiliados.origen`.
 *
 * ASESOR    → lo registró un asesor con sesión iniciada (JWT).
 * VEOLIA    → registro público del formulario de Veolia, sin sesión.
 * CONVENIO  → registro público de un convenio empresarial, sin sesión.
 *             Cuál convenio se identifica con `convenioId`, no con el ENUM.
 *
 * La distinción que importa para seguridad no es "¿es Veolia?" sino
 * "¿entró sin sesión?": esas afiliaciones no tienen un usuario autenticado
 * detrás, así que las operaciones sensibles (por ejemplo reenviar una
 * corrección) tienen que exigir OTP en lugar de confiar en req.usuario.
 *
 * Antes esto se comprobaba con `origen === 'VEOLIA'` en cada sitio, lo que
 * habría dejado a los convenios sin OTP en cuanto se agregara el tercer valor.
 */

const ORIGEN_ASESOR = 'ASESOR';

/** true para cualquier afiliación creada sin sesión (Veolia o convenio). */
function esOrigenPublico(afiliado) {
  if (!afiliado) return false;
  return afiliado.origen !== ORIGEN_ASESOR;
}

/** true solo para las registradas por un asesor autenticado. */
function esOrigenAsesor(afiliado) {
  return !!afiliado && afiliado.origen === ORIGEN_ASESOR;
}

/** Etiqueta legible para notificaciones y badges. */
function etiquetaOrigen(afiliado) {
  if (!afiliado) return '—';
  if (afiliado.origen === 'VEOLIA') return 'Veolia';
  if (afiliado.origen === 'CONVENIO') {
    return afiliado.convenio?.nombre || afiliado.nombreEmpresa || 'Convenio';
  }
  return 'Asesor';
}

module.exports = { esOrigenPublico, esOrigenAsesor, etiquetaOrigen, ORIGEN_ASESOR };
