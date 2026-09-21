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

module.exports = { FORMAS_EFECTIVO, FORMAS_BANCARIAS, normalizarErp, recibosBancariosSinErp };
