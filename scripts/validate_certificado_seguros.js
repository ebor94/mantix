// ============================================================================
// scripts/validate_certificado_seguros.js
// Valida el calculo del bloque SEGUROS y DETALLE COSTO ANUAL en el
// certificado, contra los datos reales de la BD. Imprime para cada afiliado
// con seguros:
//   - valores que mostraba la version vieja (con el bug)
//   - valores que muestra la version corregida
//   - verificacion: cuota * nCuotas == Total Anual
//
// Uso:
//   node scripts/validate_certificado_seguros.js
// ============================================================================

require('dotenv').config();
const { Afiliado, ContratoValor, Tarifa, Seguro } = require('../src/models');

const fmt = v => '$ ' + Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
const ok = (cond) => cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';

(async () => {
  const filas = await Seguro.findAll({ attributes: ['afiliadoId'], group: ['afiliadoId'], raw: true });
  const ids = filas.map(s => s.afiliadoId).slice(0, 8);

  if (ids.length === 0) {
    console.log('No hay afiliados con seguros en la BD.');
    process.exit(0);
  }

  console.log(`\nValidando ${ids.length} afiliados con seguros: [${ids.join(', ')}]\n`);
  console.log('='.repeat(110));

  for (const id of ids) {
    const afi = await Afiliado.findByPk(id, {
      attributes: ['id', 'numeroDocumento', 'primerNombre', 'primerApellido', 'producto']
    });
    const contrato = await ContratoValor.findOne({
      where: { afiliadoId: id },
      include: [{ model: Tarifa, as: 'tarifa' }]
    });
    const segs = await Seguro.findAll({ where: { afiliadoId: id } });
    if (!afi) continue;

    const nCuotas = Math.max(1, Number((contrato && contrato.nCuotas) || 1));
    const valorPlan = Number((contrato && contrato.valorPlanExequial) || 0);
    const valorAdic = Number((contrato && contrato.valorAdicionales) || 0);
    const valorAsis = Number((contrato && contrato.valorAsistencia) || 0);
    const totalSegNuevo = segs.reduce((a, s) => a + Number(s.prima || 0), 0);
    const totalSegBuggy = segs.reduce((a, s) => a + Number(s.prima || 0) * 12, 0);
    const valorContratoTotal = Number((contrato && contrato.valorTotal) || 0);
    const sumaConceptos = valorPlan + valorAdic + valorAsis + totalSegNuevo;
    const totalNuevo = valorContratoTotal >= sumaConceptos ? valorContratoTotal : sumaConceptos;
    const totalBuggy = valorContratoTotal + totalSegBuggy;
    const cuotaContrato = Number((contrato && contrato.valorCuota) || 0);
    const cuotaNuevo = cuotaContrato || (totalNuevo / nCuotas);

    const headerNombre = `${afi.numeroDocumento} ${afi.primerNombre} ${afi.primerApellido}`;
    console.log(`\nAfiliado #${id} — ${headerNombre} (${afi.producto || 'sin producto'})`);
    console.log(`  nCuotas:               ${nCuotas}`);
    console.log(`  contrato.valorTotal:   ${fmt(valorContratoTotal)}`);
    console.log(`  contrato.valorCuota:   ${fmt(cuotaContrato)}`);

    console.log(`  --- TABLA SEGUROS ---`);
    segs.forEach(s => {
      const primaAnual = Number(s.prima || 0);
      const aporte = primaAnual / nCuotas;
      console.log(
        `    ${(s.nombre || '').padEnd(38)} ` +
        `monto=${fmt(s.monto).padStart(12)}  ` +
        `prima_anual=${fmt(primaAnual).padStart(10)}  ` +
        `aporte/cuota=${fmt(aporte).padStart(10)}`
      );
    });

    console.log(`  --- ANTES (bug) ---`);
    console.log(`    Linea SEGUROS:     ${fmt(totalSegBuggy).padStart(14)}   (prima x 12)`);
    console.log(`    Total Anual:       ${fmt(totalBuggy).padStart(14)}   (contrato.valorTotal + prima x 12)`);

    console.log(`  --- AHORA (fix) ---`);
    console.log(`    Linea SEGUROS:     ${fmt(totalSegNuevo).padStart(14)}   (suma de primas anuales)`);
    console.log(`    Suma conceptos:    ${fmt(sumaConceptos).padStart(14)}   (plan + adic + asist + seguros)`);
    console.log(`    Total Anual:       ${fmt(totalNuevo).padStart(14)}   ${totalNuevo === valorContratoTotal ? '(usa contrato.valorTotal)' : '(usa suma manual; contrato.valorTotal < suma)'}`);
    console.log(`    Valor Cuota:       ${fmt(cuotaNuevo).padStart(14)}`);

    const cuotaTotal = cuotaNuevo * nCuotas;
    const coincide = Math.abs(cuotaTotal - totalNuevo) <= Math.max(nCuotas, 1); // tolerancia: $1 por cuota por redondeo
    console.log(`    Verificacion:      cuota x nCuotas = ${fmt(cuotaTotal).padStart(10)}   ${ok(coincide)} ${coincide ? 'coincide con Total Anual (±redondeo)' : 'no coincide — valorCuota fijado en BD'}`);

    const segLineMejoraPct = totalSegBuggy > 0 ? Math.round(100 * (totalSegBuggy - totalSegNuevo) / totalSegBuggy) : 0;
    if (segLineMejoraPct > 0) {
      console.log(`    Mejora visible:    linea SEGUROS bajo ${segLineMejoraPct}%`);
    }
  }

  console.log('\n' + '='.repeat(110));
  console.log('Resumen:');
  console.log('  - "Prima Anual" debe coincidir con seguros.prima (sin multiplicar).');
  console.log('  - "Aporte/Cuota" debe coincidir con prima / nCuotas.');
  console.log('  - El Total Anual del PDF debe coincidir con "Total Anual" arriba.');
  console.log('  - Cuando ✓, cuota x nCuotas debe igualar el Total Anual (±redondeo).');
  console.log('');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
