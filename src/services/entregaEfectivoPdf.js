// ============================================
// src/services/entregaEfectivoPdf.js
// Comprobante (acta) de recibido de efectivo confirmado por OTP.
// Ajustar la librería para que coincida con src/services/pdfService.js.
// ============================================
const PDFDocument = require('pdfkit');

function fmtCOP(v) {
  return '$ ' + Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}
function nombre(u) {
  if (!u) return '—';
  return [u.nombre, u.apellido].filter(Boolean).join(' ');
}
function fmtFecha(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}
const numeroActa = (id) => 'RE-' + String(id).padStart(6, '0');

function generar(entrega) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(18).text('Comprobante de recibido de efectivo', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#666')
        .text('Los Olivos / Serfunorte', { align: 'center' });
      doc.moveDown(1.2);

      doc.fillColor('#000').fontSize(12);
      const linea = (label, valor) => {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(valor);
        doc.moveDown(0.4);
      };
      linea('N° de acta', numeroActa(entrega.id));
      linea('Asesor que entregó', nombre(entrega.asesor));
      linea('Recibido por (cajera)', nombre(entrega.cajero));
      linea('Monto', fmtCOP(entrega.monto));
      linea('Fecha de confirmación', fmtFecha(entrega.fechaConfirmacion));
      if (entrega.observacion) linea('Observación', entrega.observacion);

      doc.moveDown(1);
      doc.fontSize(11).fillColor('#0a7d33')
        .text('✓ Confirmado por OTP vía WhatsApp por el asesor.', { align: 'left' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { generar };
