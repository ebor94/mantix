// ============================================================================
// scripts/informe-nomina-faltantes.js
// Genera un informe Excel con los registros de `empresa_nomina` de una empresa
// que AÚN NO están registrados en `afiliados` (cruce por numeroDocumento +
// empresaId). Solo lectura.
//
// Uso:
//   node scripts/informe-nomina-faltantes.js [empresaId]
//   node scripts/informe-nomina-faltantes.js 6
//
// Si no se pasa empresaId, usa 6.
// Genera: informe-nomina-faltantes-empresa-<id>-<YYYYMMDD-HHmmss>.xlsx
// ============================================================================

require('dotenv').config();
const path = require('path');
const ExcelJS = require('exceljs');
const { sequelize, Empresa } = require('../src/models');
const { QueryTypes } = require('sequelize');

const empresaId = parseInt(process.argv[2], 10) || 6;

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

(async () => {
  try {
    const empresa = await Empresa.findByPk(empresaId);
    const nombreEmpresa = empresa ? empresa.nombre : `Empresa ${empresaId}`;

    // Totales (para el encabezado del informe)
    const [tot] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM empresa_nomina WHERE empresa_id = :empresaId) AS total_nomina,
         (SELECT COUNT(*) FROM empresa_nomina n
            WHERE n.empresa_id = :empresaId
              AND NOT EXISTS (
                SELECT 1 FROM afiliados a
                WHERE a.empresaId = :empresaId
                  AND a.numeroDocumento = n.numero_documento
              )
         ) AS faltan`,
      { replacements: { empresaId }, type: QueryTypes.SELECT }
    );

    // Registros de nómina que faltan por registrar en afiliados
    const faltantes = await sequelize.query(
      `SELECT n.id, n.numero_documento, n.primer_nombre, n.segundo_nombre,
              n.primer_apellido, n.segundo_apellido, n.estado_civil,
              n.fecha_nacimiento, n.celular, n.email, n.direccion,
              n.plan_tipo, n.activo
         FROM empresa_nomina n
        WHERE n.empresa_id = :empresaId
          AND NOT EXISTS (
            SELECT 1 FROM afiliados a
            WHERE a.empresaId = :empresaId
              AND a.numeroDocumento = n.numero_documento
          )
        ORDER BY n.primer_apellido, n.primer_nombre`,
      { replacements: { empresaId }, type: QueryTypes.SELECT }
    );

    // ── Construir el Excel ──────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Los Olivos — informe nómina';
    wb.created = new Date();
    const ws = wb.addWorksheet('Faltan por registrar');

    // Encabezado del informe
    ws.mergeCells('A1:L1');
    ws.getCell('A1').value = `Nómina sin registrar en afiliados — ${nombreEmpresa} (empresa_id ${empresaId})`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.mergeCells('A2:L2');
    ws.getCell('A2').value =
      `Total nómina: ${tot.total_nomina}   ·   Faltan por registrar: ${tot.faltan}   ·   Generado: ${new Date().toLocaleString('es-CO')}`;
    ws.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
    ws.addRow([]);

    // Cabecera de la tabla
    const headers = [
      '#', 'Documento', 'Primer nombre', 'Segundo nombre', 'Primer apellido',
      'Segundo apellido', 'Estado civil', 'Fecha nacimiento', 'Celular',
      'Email', 'Dirección', 'Plan', 'Activo'
    ];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    });

    // Filas
    faltantes.forEach((r, i) => {
      ws.addRow([
        i + 1,
        r.numero_documento,
        r.primer_nombre || '',
        r.segundo_nombre || '',
        r.primer_apellido || '',
        r.segundo_apellido || '',
        r.estado_civil || '',
        r.fecha_nacimiento ? String(r.fecha_nacimiento).slice(0, 10) : '',
        r.celular || '',
        r.email || '',
        r.direccion || '',
        r.plan_tipo || '',
        Number(r.activo) === 1 ? 'Sí' : 'No'
      ]);
    });

    // Anchos de columna
    const widths = [5, 16, 16, 16, 18, 18, 14, 16, 14, 28, 30, 14, 8];
    ws.columns.forEach((col, i) => { col.width = widths[i] || 14; });

    // Documento como texto (evita notación científica en Excel)
    ws.getColumn(2).numFmt = '@';

    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

    const out = path.join(
      process.cwd(),
      `informe-nomina-faltantes-empresa-${empresaId}-${stamp()}.xlsx`
    );
    await wb.xlsx.writeFile(out);

    console.log(`\n✓ Empresa: ${nombreEmpresa} (id ${empresaId})`);
    console.log(`  Total en nómina:        ${tot.total_nomina}`);
    console.log(`  Faltan por registrar:   ${tot.faltan}`);
    console.log(`  Excel generado:         ${out}\n`);
  } catch (err) {
    console.error('Error generando el informe:', err.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
