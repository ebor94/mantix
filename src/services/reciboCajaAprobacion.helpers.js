// Formas de pago clasificadas para el cuadre de caja (fuente única).
const FORMAS_EFECTIVO  = ['EFECTIVO', 'PAGO_EN_CAJA'];
const FORMAS_BANCARIAS = ['TRANSFERENCIA', 'CORRESPONSAL', 'POSFECHADO_COBRADO', 'EFECTY', 'SUPER_GIROS'];

/**
 * Normaliza el mapa erpPorRecibo: claves a string, valores trimmeados,
 * descartando entradas vacías. { 5: ' ERP-1 ', 6: '' } -> { '5': 'ERP-1' }
 */
function normalizarErp(erpPorRecibo = {}) {
  const out = {};
  for (const [k, v] of Object.entries(erpPorRecibo || {})) {
    const val = (v == null ? '' : String(v)).trim();
    if (val) out[String(k)] = val;
  }
  return out;
}

/**
 * Recibos bancarios que NO tienen un N° ERP no vacío en erpNorm.
 * (erpNorm ya normalizado con normalizarErp.)
 */
function recibosBancariosSinErp(recibos, erpNorm = {}) {
  return (recibos || []).filter(
    r => FORMAS_BANCARIAS.includes(r.formaPago) && !erpNorm[String(r.id)]
  );
}

/**
 * Normaliza los ítems del masivo: numeroRecibo trim+UPPERCASE, erp trim,
 * descarta sin numeroRecibo, y dedupe por numeroRecibo (gana el último).
 */
function normalizarItemsMasivo(items) {
  const porNumero = new Map();
  for (const it of (items || [])) {
    const numeroRecibo = String(it?.numeroRecibo ?? '').trim().toUpperCase();
    if (!numeroRecibo) continue;
    const numeroReciboErp = String(it?.numeroReciboErp ?? '').trim();
    porNumero.set(numeroRecibo, { numeroRecibo, numeroReciboErp });
  }
  return [...porNumero.values()];
}

/**
 * Clasifica cada ítem (ya normalizado) contra los recibos cargados y el
 * contexto de permisos/sede. Devuelve aprobables y fallidos con motivo.
 * ctx = { permisos: { efectivo, bancarios, superAdmin }, esCajeroScoped, sedeUsuario }
 */
function clasificarItemsMasivo(items, recibosPorNumero = {}, ctx = {}) {
  const { permisos = {}, esCajeroScoped = false, sedeUsuario = null } = ctx;
  const aprobables = [];
  const fallidos = [];
  for (const it of (items || [])) {
    const recibo = recibosPorNumero[it.numeroRecibo];
    if (!recibo) {
      fallidos.push({ numeroRecibo: it.numeroRecibo, motivo: 'No encontrado o ya aprobado' });
      continue;
    }
    const esEfectivo = FORMAS_EFECTIVO.includes(recibo.formaPago);
    const esBancario = FORMAS_BANCARIAS.includes(recibo.formaPago);
    const puedeForma = permisos.superAdmin
      || (esEfectivo && permisos.efectivo)
      || (esBancario && permisos.bancarios);
    if (!puedeForma) {
      fallidos.push({ numeroRecibo: it.numeroRecibo, motivo: 'Sin permiso para esta forma de pago' });
      continue;
    }
    if (esCajeroScoped && recibo.asesor?.sede_id !== sedeUsuario) {
      fallidos.push({ numeroRecibo: it.numeroRecibo, motivo: 'Recibo de otra sede' });
      continue;
    }
    if (esBancario && !it.numeroReciboErp) {
      fallidos.push({ numeroRecibo: it.numeroRecibo, motivo: 'Falta N° de recibo ERP (bancario)' });
      continue;
    }
    aprobables.push({ recibo, erp: it.numeroReciboErp || null });
  }
  return { aprobables, fallidos };
}

module.exports = { FORMAS_EFECTIVO, FORMAS_BANCARIAS, normalizarErp, recibosBancariosSinErp, normalizarItemsMasivo, clasificarItemsMasivo };
