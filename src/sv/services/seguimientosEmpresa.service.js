/**
 * sv/services/seguimientosEmpresa.service.js
 * Migración 019 — Seguimientos automáticos post-firma de convenio.
 *
 * Modelo: cada empresa con `empresa_periodicidad_seguimiento` (BIMENSUAL /
 * TRIMESTRAL / ANUAL) genera eventos en cadena en la agenda del asesor.
 * Solo existe 1 seguimiento futuro pendiente en cualquier momento; al
 * completarlo se programa el siguiente. Si se reasigna el asesor de la
 * empresa, los seguimientos futuros no completados pasan al nuevo asesor.
 *
 * Hooks de invocación:
 *   - renovaciones.service → marcarConvenioFirmado: programarPrimero(...)
 *   - eventosAgenda.service → marcarCompletado:    programarSiguiente(ev)
 *   - empresas.service → reasignarAsesor:          reasignarFuturos(...)
 */
const { Op } = require('sequelize');
const { SvEmpresa, SvEventoAgenda } = require('../models');

const INTERVALO_MESES = { BIMENSUAL: 2, TRIMESTRAL: 3, ANUAL: 12 };

function sumarMeses(fechaISO, meses) {
  const d = new Date(fechaISO);
  d.setMonth(d.getMonth() + meses);
  // Devolver string YYYY-MM-DD HH:MM:SS preservando la hora original
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function tituloSeguimiento(periodicidad, empresaNombre) {
  const map = { BIMENSUAL: 'bimensual', TRIMESTRAL: 'trimestral', ANUAL: 'anual' };
  return `Seguimiento ${map[periodicidad] || ''} — ${empresaNombre}`.trim();
}

/**
 * Crea el primer evento de seguimiento al firmar el convenio.
 *
 *   programarPrimero({ empresaId, asesorId, fechaFirma })
 *
 * No-op silencioso si la empresa no tiene periodicidad configurada.
 * Idempotente: si ya existe un seguimiento futuro pendiente para esa
 * empresa, no crea otro.
 */
async function programarPrimero({ empresaId, asesorId, fechaFirma, creadoPor = null }) {
  const empresa = await SvEmpresa.findByPk(empresaId);
  if (!empresa || !empresa.empresa_periodicidad_seguimiento) return null;
  const periodicidad = empresa.empresa_periodicidad_seguimiento;
  const meses = INTERVALO_MESES[periodicidad];
  if (!meses) return null;

  // No duplicar si ya hay uno futuro pendiente
  const existente = await SvEventoAgenda.findOne({
    where: {
      evento_empresa_id: empresaId,
      evento_tipo: 'SEGUIMIENTO',
      evento_completado: 0,
      evento_fecha_hora: { [Op.gte]: new Date() }
    }
  });
  if (existente) return existente;

  // Hora por defecto: 09:00 del día calculado
  const fechaBase = `${fechaFirma} 09:00:00`;
  const proxima   = sumarMeses(fechaBase, meses);

  return SvEventoAgenda.create({
    evento_asesor_id:   asesorId,
    evento_creado_por:  creadoPor || asesorId,
    evento_titulo:      tituloSeguimiento(periodicidad, empresa.empresa_razon_social),
    evento_descripcion: `Seguimiento ${periodicidad.toLowerCase()} programado automáticamente a partir de la firma del convenio (${fechaFirma}).`,
    evento_tipo:        'SEGUIMIENTO',
    evento_fecha_hora:  proxima,
    evento_empresa_id:  empresaId,
    evento_completado:  0
  });
}

/**
 * Programa el siguiente seguimiento cuando se completa uno actual.
 * Devuelve el nuevo evento o null si no aplica.
 */
async function programarSiguiente(eventoCompletado) {
  if (!eventoCompletado) return null;
  if (eventoCompletado.evento_tipo !== 'SEGUIMIENTO') return null;
  if (!eventoCompletado.evento_empresa_id) return null;

  const empresa = await SvEmpresa.findByPk(eventoCompletado.evento_empresa_id);
  if (!empresa || !empresa.empresa_periodicidad_seguimiento) return null;
  const meses = INTERVALO_MESES[empresa.empresa_periodicidad_seguimiento];
  if (!meses) return null;

  const baseISO = eventoCompletado.evento_fecha_hora instanceof Date
    ? eventoCompletado.evento_fecha_hora.toISOString().replace('T', ' ').slice(0, 19)
    : String(eventoCompletado.evento_fecha_hora);
  const proxima = sumarMeses(baseISO, meses);

  return SvEventoAgenda.create({
    evento_asesor_id:   eventoCompletado.evento_asesor_id,
    evento_creado_por:  eventoCompletado.evento_asesor_id,
    evento_titulo:      tituloSeguimiento(empresa.empresa_periodicidad_seguimiento, empresa.empresa_razon_social),
    evento_descripcion: `Seguimiento ${empresa.empresa_periodicidad_seguimiento.toLowerCase()} (encadenado tras completar el anterior).`,
    evento_tipo:        'SEGUIMIENTO',
    evento_fecha_hora:  proxima,
    evento_empresa_id:  empresa.empresa_id,
    evento_completado:  0
  });
}

/**
 * Cuando se reasigna el asesor de una empresa, mover sus seguimientos
 * FUTUROS NO completados al nuevo asesor. Los completados quedan
 * históricos atribuidos al asesor original.
 *
 * Devuelve el conteo de eventos reasignados.
 */
async function reasignarFuturos({ empresaId, nuevoAsesorId }) {
  const [count] = await SvEventoAgenda.update(
    { evento_asesor_id: nuevoAsesorId },
    {
      where: {
        evento_empresa_id: empresaId,
        evento_tipo: 'SEGUIMIENTO',
        evento_completado: 0,
        evento_fecha_hora: { [Op.gte]: new Date() }
      }
    }
  );
  return count;
}

module.exports = { programarPrimero, programarSiguiente, reasignarFuturos, INTERVALO_MESES };
