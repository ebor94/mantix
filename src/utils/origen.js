/**
 * Semántica del campo `afiliados.origen`.
 *
 * ASESOR            → lo registró un asesor con sesión iniciada (JWT).
 * VEOLIA            → registro público del formulario de Veolia, sin sesión.
 * CONVENIO          → registro público de un convenio empresarial, sin sesión.
 *                      Cuál convenio se identifica con `convenioId`, no con el ENUM.
 * CONVENIO_PUBLICO  → registro público del canal empresarial (subsistema C) por
 *                      slug de empresa, sin sesión.
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

/**
 * Extrae el valor del ENUM `origen` sin importar si se recibió el afiliado
 * completo (uso normal en controladores: `esOrigenPublico(afiliadoActual)`)
 * o el valor crudo del ENUM como string (uso en tests/utilidades).
 */
function _valorOrigen(afiliadoOValor) {
  if (!afiliadoOValor) return null;
  if (typeof afiliadoOValor === 'string') return afiliadoOValor;
  return afiliadoOValor.origen || null;
}

/** true para cualquier afiliación creada sin sesión (Veolia, convenio o convenio público). */
function esOrigenPublico(afiliadoOValor) {
  const origen = _valorOrigen(afiliadoOValor);
  if (!origen) return false;
  return origen !== ORIGEN_ASESOR;
}

/** true solo para las registradas por un asesor autenticado. */
function esOrigenAsesor(afiliadoOValor) {
  return _valorOrigen(afiliadoOValor) === ORIGEN_ASESOR;
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
