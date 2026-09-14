/**
 * sv/services/jornadaObligatoria.service.js
 * Lógica del popup bloqueante de inicio de jornada (SP-4).
 *
 * Reglas de negocio:
 *  - `requiere_popup = true` sólo si el usuario es operativo y hoy no tiene
 *    jornada abierta/cerrada ni ausencia declarada.
 *  - Roles NO operativos: SUPER_ADMIN, GERENTE_GENERAL, DIRECTOR_COMERCIAL.
 *  - Un usuario sólo puede tener 1 ausencia por día (unique key).
 */
const { SvJornada, SvJornadaAusencia } = require('../models');
const { hoyISO } = require('../utils/fechas');

const ROLES_NO_OPERATIVOS = new Set([
  'SUPER_ADMIN',
  'GERENTE_GENERAL',
  'DIRECTOR_COMERCIAL'
]);

function esOperativo(usuario) {
  const codigo = usuario?.rol?.rol_codigo;
  return !ROLES_NO_OPERATIVOS.has(codigo);
}

async function estadoHoy(usuario) {
  const fecha = hoyISO();
  const [jornada, ausencia] = await Promise.all([
    SvJornada.findOne({ where: { jor_usr_id: usuario.usr_id, jor_fecha: fecha } }),
    SvJornadaAusencia.findOne({ where: { aus_usr_id: usuario.usr_id, aus_fecha: fecha } })
  ]);

  let estado = 'sin_iniciar';
  if (ausencia)          estado = 'ausente';
  else if (jornada)      estado = jornada.jor_estado === 'activa' ? 'activa' : 'finalizada';

  const requiere_popup = esOperativo(usuario) && estado === 'sin_iniciar';

  return { estado, jornada, ausencia, requiere_popup };
}

async function registrarAusencia(usuarioId, { tipo, motivo }) {
  try {
    return await SvJornadaAusencia.create({
      aus_usr_id: usuarioId,
      aus_fecha:  hoyISO(),
      aus_tipo:   tipo,
      aus_motivo: motivo
    });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      const err = new Error('Ya declaraste ausencia hoy');
      err.code = 'AUSENCIA_DUPLICADA';
      throw err;
    }
    throw e;
  }
}

async function eliminarAusenciaHoy(usuarioId) {
  return SvJornadaAusencia.destroy({
    where: { aus_usr_id: usuarioId, aus_fecha: hoyISO() }
  });
}

module.exports = { esOperativo, estadoHoy, registrarAusencia, eliminarAusenciaHoy };
