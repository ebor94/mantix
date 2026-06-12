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
const CABECERA_URL = 'https://losolivoscucuta.com/difusiones/img/cabecera%20olivos2.png';
const PIE_URL = 'https://losolivoscucuta.com/difusiones/img/pie%20de%20pagina.png';

// Cache con TTL de 5 minutos — permite actualizar las imágenes remotas sin reiniciar.
const imgCache = new Map();   // url -> { buf, ts }
const TTL_MS   = 5 * 60 * 1000;

async function obtenerImagenRemota(url, label) {
  const cached = imgCache.get(url);
  if (cached && (Date.now() - cached.ts) < TTL_MS) return cached.buf;
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    const buf = Buffer.from(response.data);
    imgCache.set(url, { buf, ts: Date.now() });
    return buf;
  } catch (err) {
    console.error(`No se pudo descargar imagen ${label || url}:`, err.message);
    // Si hay versión en caché (aunque expirada) la usamos como fallback
    return cached ? cached.buf : null;
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

    // ── ENCABEZADO / PIE DE PAGINA (imagenes remotas, render en cada pagina) ──
    // Cabecera: 767x148 -> a 515px de ancho queda ~99px de alto. Top: y=10.
    // Pie:      772x115 -> a 515px de ancho queda ~77px de alto. Bottom: y=740.
    const cabeceraBuffer = await obtenerImagenRemota(CABECERA_URL, 'Cabecera Olivos');
    const pieBuffer = await obtenerImagenRemota(PIE_URL, 'Pie de Pagina Olivos');

    const drawCabecera = () => {
      if (!cabeceraBuffer) return;
      try {
        doc.image(cabeceraBuffer, 40, 10, { width: 515 });
      } catch (e) {
        console.error('Error insertando cabecera:', e.message);
      }
    };

    const drawPie = () => {
      if (!pieBuffer) return;
      try {
        doc.image(pieBuffer, 40, 740, { width: 515 });
      } catch (e) {
        console.error('Error insertando pie:', e.message);
      }
    };

    // pageAdded NO se dispara para la primera pagina, asi que hay que dibujar manual.
    // Las paginas siguientes (manuales o por overflow) si lo disparan.
    doc.on('pageAdded', () => { drawCabecera(); drawPie(); });
    drawCabecera();
    drawPie();

    // ── TÍTULO CERTIFICADO ─────────────────────────────────────────────────
    doc.fontSize(10).font('Helvetica-Bold').fillColor('black');
    doc.text('CERTIFICADO DE AFILIACIÓN EXEQUIAL.', 40, 113, { width: 515, align: 'center' });
    doc.text('SERFUNORTE – CÚCUTA',              40, 126, { width: 515, align: 'center' });
    doc.text('NIT. 800254697-5',                      40, 139, { width: 515, align: 'center' });

    let y = 158;

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
    doc.rect(40, y, 515, 16).fill('#00a57e');
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
    doc.rect(40, y, 515, 16).fill('#00a57e');
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
    doc.rect(40, y, 515, 16).fill('#00a57e');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
      .text('INFORMACIÓN DE AFILIADOS', 0, y + 3, { align: 'center' });
    y += 20;

    if (beneficiarios.length > 0) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('black');
      doc.rect(40, y, 515, 15).fillColor('#cad0d1').fill();
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
        if (y > 720) {
          doc.addPage();
          y = 120;
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
    if (y > 700) { doc.addPage(); y = 120; }

    doc.rect(40, y, 515, 16).fill('#00a57e');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
      .text('SERVICIOS ADICIONALES', 0, y + 3, { align: 'center' });
    y += 20;

    if (afiliado.asistenciaFueraDeCasa === 'SI') {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('black')
        .text(`${nombreCompleto(afiliado)} - AFILIADO PRINCIPAL`, 40, y);
      y += 15;
      doc.font('Helvetica').text('Asistencia fuera de casa', 40, y);
      doc.text('Con servicio', 450, y);
      y += 15;
    }

    y += 10;

    // ── SEGUROS ────────────────────────────────────────────────────────────
    const nCuotas = Math.max(1, Number((contrato && contrato.nCuotas) || 1));
    if (seguros.length > 0) {
      if (y > 680) { doc.addPage(); y = 120; }
      doc.rect(40, y, 515, 16).fill('#00a57e');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
        .text('SEGUROS', 0, y + 3, { align: 'center' });
      y += 20;

      doc.fontSize(8).font('Helvetica-Bold').fillColor('black');
      doc.rect(40, y, 515, 15).fillColor('#cad0d1').fill();
      doc.fillColor('black');
      doc.text('Seguro', 45, y + 4);
      doc.text('Valor Asegurado', 200, y + 4);
      doc.text('Prima Anual', 340, y + 4);
      doc.text(`Aporte/Cuota (${nCuotas})`, 450, y + 4);
      y += 15;

      doc.font('Helvetica').fontSize(8.5);
      for (const s of seguros) {
        if (y > 720) { doc.addPage(); y = 120; }
        const primaAnual = Number(s.prima || 0);
        const aporteCuota = primaAnual / nCuotas;
        doc.text(s.nombre || '', 45, y);
        doc.text(formatMoneda(s.monto), 200, y);
        doc.text(formatMoneda(primaAnual), 340, y);
        doc.text(formatMoneda(aporteCuota), 450, y);
        y += 13;
      }
      y += 10;
    }

    // ── DETALLE COSTO ANUAL ────────────────────────────────────────────────
    if (y > 680) { doc.addPage(); y = 120; }

    doc.rect(40, y, 515, 16).fill('#00a57e');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
      .text('DETALLE COSTO ANUAL', 0, y + 3, { align: 'center' });
    y += 20;

    doc.fontSize(9).fillColor('black');

    const tarifa = contrato && contrato.tarifa ? contrato.tarifa : null;
    const valorPlan = Number((contrato && contrato.valorPlanExequial) || (tarifa && tarifa.valorBase) || 0);
    const valorAdicionales = Number((contrato && contrato.valorAdicionales) || 0);
    const valorAsistencia = afiliado.asistenciaFueraDeCasa === 'SI' && tarifa ? Number(tarifa.valorAsistencia || 0) : 0;
    // La prima viene ANUAL; se distribuye en `nCuotas` para el cobro por cuota.
    const totalSegurosAnual = seguros.reduce((acc, s) => acc + Number(s.prima || 0), 0);

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
      doc.font('Helvetica-Bold').text('SEGUROS', 40, y);
      doc.font('Helvetica').text(formatMoneda(totalSegurosAnual), 450, y);
      y += 15;
    }

    y += 5;
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#00a57e').lineWidth(0.5).stroke();
    y += 8;

    // ── Total y modalidad ────────────────────────────────────────────────
    doc.fontSize(9).fillColor('black');
    const periodicidad = (contrato && contrato.periodicidad) || afiliado.formaPago || 'MENSUAL';
    // Total Anual = suma de los conceptos mostrados. Si contrato.valorTotal ya
    // incluye los seguros, usar ese; de lo contrario, sumar manualmente.
    const valorContratoTotal = Number((contrato && contrato.valorTotal) || 0);
    const sumaConceptos = valorPlan + valorAdicionales + valorAsistencia + totalSegurosAnual;
    const valorTotal = valorContratoTotal >= sumaConceptos ? valorContratoTotal : sumaConceptos;
    const valorCuota = Number((contrato && contrato.valorCuota) || (valorTotal / nCuotas) || 0);

    doc.font('Helvetica-Bold').text('Periodicidad:', 40, y);
    doc.font('Helvetica').text(periodicidad, 115, y);
    doc.font('Helvetica-Bold').text('Total Anual:', 230, y);
    doc.font('Helvetica').text(formatMoneda(valorTotal), 305, y);
    doc.font('Helvetica-Bold').text('Valor Cuota:', 410, y);
    doc.font('Helvetica').text(formatMoneda(valorCuota), 480, y);

    y += 25;

    // ── TEXTO LEGAL ────────────────────────────────────────────────────────
    const tieneSinergia    = seguros.some(s => s.nombre && s.nombre.toUpperCase().includes('SINERGIA OP'));
    const tieneSolicanasta = seguros.some(s => s.nombre && s.nombre.toUpperCase().includes('SOLICANASTA'));
    const sinSeguros       = seguros.length === 0;

    const formas = [];
    if (tieneSinergia)              formas.push('Sinergia Forma SO-01-03-12 04/2021');
    if (tieneSolicanasta || sinSeguros) formas.push('Solicanasta Forma PEX-SO-03-30 03/2021');
    const formaRef = formas.join(' y ');

    const textoLegal = `El contratante declara que ha leído, analizado, revisado y comprendido a cabalidad las Condiciones Generales y las cláusulas contenidas en la ${formaRef}, así como la asesoría brindada, aceptándolas en su integridad. El presente certificado hace parte integral del contrato de previsión exequial adquirido con SERFUNORTE LOS OLIVOS y se encuentra sujeto a las disposiciones contenidas en dicho documento.`;

    doc.fontSize(8).font('Helvetica').fillColor('black')
      .text(textoLegal, 40, y, { width: 515, align: 'justify' });

    y = doc.y + 20;

    // ── ASESOR ─────────────────────────────────────────────────────────────
    if (y > 720) { doc.addPage(); y = 120; }

    doc.fontSize(9).font('Helvetica-Bold').fillColor('black').text('Asesor:', 40, y);
    doc.font('Helvetica').text(nombreAsesor || 'Asesor Serfunorte', 90, y, { width: 400 });

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
