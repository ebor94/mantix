// ============================================
// src/controllers/certificado.controller.js
// Endpoint: POST /api/certificados/generar
// Genera certificado de afiliacion exequial en PDF (stream binario)
// ============================================

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Afiliado, Beneficiario, Usuario, ContratoValor, Tarifa, Seguro } = require('../models');
const AppError = require('../utils/AppError');

const LOGO_PATH = path.join(__dirname, '../../assets/logoConv.png');
const ICONTEC_LOGO_URL = 'https://losolivoscucuta.com/img/icontec.png';

let icontecLogoCache = null;
let icontecLogoFailed = false;

async function obtenerIcontecLogo() {
  if (icontecLogoCache) return icontecLogoCache;
  if (icontecLogoFailed) return null;
  try {
    const response = await axios.get(ICONTEC_LOGO_URL, {
      responseType: 'arraybuffer',
      timeout: 5000
    });
    icontecLogoCache = Buffer.from(response.data);
    return icontecLogoCache;
  } catch (err) {
    console.error('No se pudo descargar logo Icontec:', err.message);
    icontecLogoFailed = true;
    return null;
  }
}

const tipoBeneficiarioLabel = (tipo) => {
  if (tipo === 'ADICIONAL') return 'Adicional';
  if (tipo === 'DE_LEY') return 'Beneficiario';
  return tipo || '';
};

// ── Helpers de formato ─────────────────────────────────────────────────────
const formatFecha = (fecha) => {
  if (!fecha) return '';
  const d = new Date(fecha);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const formatMoneda = (valor) => {
  if (valor === null || valor === undefined) return '$ 0';
  return '$ ' + Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const nombreCompleto = (p) => [p.primerNombre, p.segundoNombre, p.primerApellido, p.segundoApellido]
  .filter(Boolean).join(' ').toUpperCase();

const calcularEdad = (fechaNac) => {
  if (!fechaNac) return '';
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
};

const productoComercial = (producto) => {
  const mapa = {
    'VERDE': 'PLAN VERDE',
    'INTEGRAL': 'PLAN INTEGRAL',
    'CENS': 'PLAN CENS'
  };
  return mapa[producto] || 'PLAN EXEQUIAL';
};

// ── Controlador ────────────────────────────────────────────────────────────
async function generar(req, res, next) {
  let doc;
  try {
    const { afiliadoId } = req.body || {};

    if (!afiliadoId) {
      return next(new AppError('afiliadoId es requerido', 400));
    }

    const afiliado = await Afiliado.findByPk(afiliadoId);
    if (!afiliado) {
      return next(new AppError(`Afiliado ${afiliadoId} no encontrado`, 404));
    }

    const beneficiarios = await Beneficiario.findAll({
      where: { afiliadoId, activo: 1 },
      order: [['parentesco', 'ASC']]
    });

    const contrato = await ContratoValor.findOne({
      where: { afiliadoId },
      include: [{ model: Tarifa, as: 'tarifa' }]
    });

    const seguros = await Seguro.findAll({
      where: { afiliadoId },
      order: [['nombre', 'ASC']]
    });

    let nombreAsesor = '';
    if (afiliado.asesorId) {
      const asesor = await Usuario.findByPk(afiliado.asesorId);
      if (asesor) {
        nombreAsesor = `${asesor.nombre || ''} ${asesor.apellido || ''}`.trim().toUpperCase();
      }
    }

    doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Certificado Afiliacion - ${afiliado.numeroDocumento}`,
        Author: 'Serfunorte Los Olivos',
        Subject: 'Certificado de Afiliacion Exequial'
      }
    });

    const nombreArchivo = `certificado_${afiliado.numeroDocumento}_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    doc.pipe(res);

    // ── ENCABEZADO ─────────────────────────────────────────────────────────
    // Banner Icontec full-width al tope (aspect ratio 512:82 preservado por PDFKit con solo `width`)
    const icontecBuffer = await obtenerIcontecLogo();
    if (icontecBuffer) {
      try {
        doc.image(icontecBuffer, 40, 12, { width: 515 });
      } catch (e) {
        console.error('Error insertando logo Icontec:', e.message);
      }
    }

    // Logo Olivos a la izquierda, debajo del banner
    if (fs.existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, 40, 105, { width: 70 });
      } catch (e) {
        console.error('Error insertando logo Olivos:', e.message);
      }
    }

    doc.fontSize(14).font('Helvetica-Bold')
      .text('CERTIFICADO DE AFILIACION EXEQUIAL', 0, 115, { align: 'center' });

    doc.fontSize(12).font('Helvetica-Bold')
      .text('SERFUNORTE LOS OLIVOS', 0, 135, { align: 'center' });

    doc.fontSize(9).font('Helvetica')
      .text('NIT: 800.254.697-5', 0, 153, { align: 'center' })
      .text('Teléfono: (607) 578 4777', 0, 165, { align: 'center' });

    doc.moveTo(40, 190).lineTo(555, 190).strokeColor('#006838').lineWidth(1).stroke();

    let y = 205;

    // ── CABECERA: PUNTO DE VENTA / TIPO / CONTRATO ─────────────────────────
    doc.fontSize(8).font('Helvetica-Bold').fillColor('black');
    doc.text('Punto de Venta:', 40, y);
    doc.font('Helvetica').text(afiliado.sucursal || 'CUCUTA', 130, y);
    doc.font('Helvetica-Bold').text('Tipo de Negocio:', 280, y);
    doc.font('Helvetica').text(afiliado.novedad || 'NUEVO', 360, y);

    y += 15;
    doc.font('Helvetica-Bold').text('Fecha Expedición:', 40, y);
    doc.font('Helvetica').text(formatFecha(new Date()), 130, y);
    doc.font('Helvetica-Bold').text('Vigencia Desde:', 230, y);
    doc.font('Helvetica').text(formatFecha(afiliado.vigenciaDesde), 310, y);
    doc.font('Helvetica-Bold').text('Vigencia Hasta:', 410, y);
    doc.font('Helvetica').text(formatFecha(afiliado.vigenciaHasta), 490, y);

    y += 25;

    // ── INFORMACION DEL CONTRATANTE ────────────────────────────────────────
    doc.rect(40, y, 515, 16).fill('#006838');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
      .text('INFORMACIÓN DEL CONTRATANTE', 0, y + 3, { align: 'center' });
    y += 20;

    doc.fontSize(9).fillColor('black');
    doc.font('Helvetica-Bold').text('Documento:', 40, y);
    doc.font('Helvetica').text(`${afiliado.tipoDocumento} ${afiliado.numeroDocumento}`, 110, y);
    doc.font('Helvetica-Bold').text('Nombre Completo:', 240, y);
    doc.font('Helvetica').text(nombreCompleto(afiliado), 340, y, { width: 215 });

    y += 18;
    doc.font('Helvetica-Bold').text('Dirección:', 40, y);
    doc.font('Helvetica').text(afiliado.direccion || '', 100, y, { width: 250 });
    doc.font('Helvetica-Bold').text('Teléfono:', 380, y);
    doc.font('Helvetica').text(afiliado.celular || '', 430, y);

    y += 15;
    doc.font('Helvetica-Bold').text('Departamento:', 40, y);
    doc.font('Helvetica').text(afiliado.departamento || '', 120, y);
    doc.font('Helvetica-Bold').text('Municipio:', 230, y);
    doc.font('Helvetica').text(afiliado.ciudad || '', 290, y);
    doc.font('Helvetica-Bold').text('Barrio:', 400, y);
    doc.font('Helvetica').text(afiliado.barrio || '', 440, y);

    y += 15;
    doc.font('Helvetica-Bold').text('Correo Electrónico:', 40, y);
    doc.font('Helvetica').text(afiliado.email || '', 130, y);

    y += 20;

    // ── INFORMACION DEL TITULAR ────────────────────────────────────────────
    doc.rect(40, y, 515, 16).fill('#006838');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
      .text('INFORMACIÓN DEL TITULAR', 0, y + 3, { align: 'center' });
    y += 20;

    doc.fontSize(9).fillColor('black');
    doc.font('Helvetica-Bold').text('Documento:', 40, y);
    doc.font('Helvetica').text(`${afiliado.tipoDocumento} ${afiliado.numeroDocumento}`, 110, y);
    doc.font('Helvetica-Bold').text('Nombre Completo:', 240, y);
    doc.font('Helvetica').text(nombreCompleto(afiliado), 340, y, { width: 215 });

    y += 18;
    doc.font('Helvetica-Bold').text('Fecha Nacimiento:', 40, y);
    doc.font('Helvetica').text(formatFecha(afiliado.fechaNacimiento), 135, y);
    doc.font('Helvetica-Bold').text('Edad:', 220, y);
    doc.font('Helvetica').text(String(afiliado.edad || calcularEdad(afiliado.fechaNacimiento)), 255, y);
    doc.font('Helvetica-Bold').text('Género:', 300, y);
    doc.font('Helvetica').text(afiliado.sexo || '', 345, y);
    doc.font('Helvetica-Bold').text('Producto:', 380, y);
    doc.font('Helvetica').text(productoComercial(afiliado.producto), 430, y);

    y += 15;
    doc.font('Helvetica-Bold').text('Grupo:', 40, y);
    doc.font('Helvetica').text(afiliado.grupo || '', 90, y);
    doc.font('Helvetica-Bold').text('Canal:', 280, y);
    doc.font('Helvetica').text(afiliado.canal || '', 320, y);

    y += 20;

    // ── INFORMACION DE AFILIADOS (BENEFICIARIOS) ───────────────────────────
    doc.rect(40, y, 515, 16).fill('#006838');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
      .text('INFORMACIÓN DE AFILIADOS', 0, y + 3, { align: 'center' });
    y += 20;

    if (beneficiarios.length > 0) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('black');
      doc.rect(40, y, 515, 15).fillColor('#f0f0f0').fill();
      doc.fillColor('black');
      doc.text('Documento', 45, y + 4);
      doc.text('Nombres', 130, y + 4);
      doc.text('F. Nac.', 290, y + 4);
      doc.text('Edad', 340, y + 4);
      doc.text('Gén.', 370, y + 4);
      doc.text('Parentesco', 400, y + 4);
      doc.text('Tipo', 480, y + 4);
      y += 15;

      doc.font('Helvetica').fontSize(7.5);
      for (const ben of beneficiarios) {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        doc.text(`${ben.tipoDocumento || ''} ${ben.numeroDocumento || ''}`.trim(), 45, y);
        doc.text(nombreCompleto(ben), 130, y, { width: 155 });
        doc.text(formatFecha(ben.fechaNacimiento), 290, y);
        doc.text(String(ben.edad || calcularEdad(ben.fechaNacimiento) || ''), 340, y);
        doc.text(ben.genero || '', 370, y);
        doc.text(ben.parentesco || '', 400, y, { width: 75 });
        doc.text(tipoBeneficiarioLabel(ben.tipoBeneficiario), 480, y, { width: 75 });
        y += 14;
      }
    } else {
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('gray')
        .text('Sin beneficiarios registrados', 40, y, { align: 'center', width: 515 });
      y += 15;
    }

    y += 10;

    // ── SERVICIOS ADICIONALES ──────────────────────────────────────────────
    if (y > 650) { doc.addPage(); y = 50; }

    doc.rect(40, y, 515, 16).fill('#006838');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
      .text('SERVICIOS ADICIONALES', 0, y + 3, { align: 'center' });
    y += 20;

    doc.fontSize(9).font('Helvetica-Bold').fillColor('black')
      .text(`${nombreCompleto(afiliado)} - AFILIADO PRINCIPAL`, 40, y);
    y += 15;

    if (afiliado.asistenciaFueraDeCasa === 'SI') {
      doc.font('Helvetica').text('Asistencia fuera de casa', 40, y);
      doc.text('Con servicio', 450, y);
      y += 15;
    }

    y += 10;

    // ── SEGUROS ────────────────────────────────────────────────────────────
    if (seguros.length > 0) {
      if (y > 620) { doc.addPage(); y = 50; }
      doc.rect(40, y, 515, 16).fill('#006838');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
        .text('SEGUROS', 0, y + 3, { align: 'center' });
      y += 20;

      doc.fontSize(8).font('Helvetica-Bold').fillColor('black');
      doc.rect(40, y, 515, 15).fillColor('#f0f0f0').fill();
      doc.fillColor('black');
      doc.text('Seguro', 45, y + 4);
      doc.text('Valor Asegurado', 230, y + 4);
      doc.text('Prima Mensual', 400, y + 4);
      y += 15;

      doc.font('Helvetica').fontSize(8.5);
      for (const s of seguros) {
        if (y > 700) { doc.addPage(); y = 50; }
        doc.text(s.nombre || '', 45, y);
        doc.text(formatMoneda(s.monto), 230, y);
        doc.text(formatMoneda(s.prima) + ' / mes', 400, y);
        y += 13;
      }
      y += 10;
    }

    // ── DETALLE COSTO ANUAL ────────────────────────────────────────────────
    if (y > 600) { doc.addPage(); y = 50; }

    doc.rect(40, y, 515, 16).fill('#006838');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
      .text('DETALLE COSTO ANUAL', 0, y + 3, { align: 'center' });
    y += 20;

    doc.fontSize(9).fillColor('black');

    const tarifa = contrato && contrato.tarifa ? contrato.tarifa : null;
    const valorPlan = Number((contrato && contrato.valorPlanExequial) || (tarifa && tarifa.valorBase) || 0);
    const valorAdicionales = Number((contrato && contrato.valorAdicionales) || 0);
    const valorAsistencia = afiliado.asistenciaFueraDeCasa === 'SI' && tarifa ? Number(tarifa.valorAsistencia || 0) : 0;
    const totalSegurosAnual = seguros.reduce((acc, s) => acc + Number(s.prima || 0) * 12, 0);

    doc.font('Helvetica-Bold').text(`PLAN ${productoComercial(afiliado.producto)} - TITULAR`, 40, y);
    doc.font('Helvetica').text(formatMoneda(valorPlan), 450, y);
    y += 15;

    if (valorAdicionales > 0) {
      const numAdic = beneficiarios.filter(b => b.tipoBeneficiario === 'ADICIONAL').length;
      doc.font('Helvetica-Bold').text(`BENEFICIARIOS ADICIONALES${numAdic > 0 ? ' (' + numAdic + ')' : ''}`, 40, y);
      doc.font('Helvetica').text(formatMoneda(valorAdicionales), 450, y);
      y += 15;
    }

    if (valorAsistencia > 0) {
      doc.font('Helvetica-Bold').text('ASISTENCIA FUERA DE CASA', 40, y);
      doc.font('Helvetica').text(formatMoneda(valorAsistencia), 450, y);
      y += 15;
    }

    if (totalSegurosAnual > 0) {
      doc.font('Helvetica-Bold').text('SEGUROS (prima anualizada)', 40, y);
      doc.font('Helvetica').text(formatMoneda(totalSegurosAnual), 450, y);
      y += 15;
    }

    y += 5;
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#006838').lineWidth(0.5).stroke();
    y += 8;

    // ── Total y modalidad ────────────────────────────────────────────────
    doc.fontSize(9).fillColor('black');
    const periodicidad = (contrato && contrato.periodicidad) || afiliado.formaPago || 'MENSUAL';
    const valorTotal = Number((contrato && contrato.valorTotal) || 0) + totalSegurosAnual;
    const valorCuota = Number((contrato && contrato.valorCuota) || 0);

    doc.font('Helvetica-Bold').text('Periodicidad:', 40, y);
    doc.font('Helvetica').text(periodicidad, 115, y);
    doc.font('Helvetica-Bold').text('Total Anual:', 230, y);
    doc.font('Helvetica').text(formatMoneda(valorTotal), 305, y);
    doc.font('Helvetica-Bold').text('Valor Cuota:', 410, y);
    doc.font('Helvetica').text(formatMoneda(valorCuota), 480, y);

    y += 25;

    // ── TEXTO LEGAL ────────────────────────────────────────────────────────
    doc.fontSize(8).font('Helvetica').fillColor('black')
      .text('El contratante declara que ha leído, analizado, revisado y comprendido a cabalidad las presentes condiciones generales, las cláusulas que la componen y la asesoría brindada aceptándolas en su integridad. Este certificado hace parte integral del contrato de previsión exequial adquirido con SERFUNORTE LOS OLIVOS.',
        40, y, { width: 515, align: 'justify' });

    y += 50;

    // ── ASESOR ─────────────────────────────────────────────────────────────
    if (y > 740) { doc.addPage(); y = 50; }

    doc.fontSize(9).font('Helvetica-Bold').fillColor('black').text('Asesor:', 40, y);
    doc.font('Helvetica').text(nombreAsesor || 'Asesor Serfunorte', 90, y, { width: 400 });

    // ── PIE DE PAGINA ──────────────────────────────────────────────────────
    doc.fontSize(7).font('Helvetica-Oblique').fillColor('gray')
      .text(`Documento generado automáticamente el ${formatFecha(new Date())} - Serfunorte Los Olivos`,
        40, 800, { width: 515, align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generando certificado:', error);
    if (!res.headersSent) {
      return next(error);
    }
    try { doc && doc.end(); } catch (_) {}
    try { res.end(); } catch (_) {}
  }
}

module.exports = { generar };
