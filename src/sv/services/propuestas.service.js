/**
 * sv/services/propuestas.service.js
 * CRUD de propuestas B2B + generación PDF + envío email + registro de gestión.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');
const {
  sequelize, SvPropuesta, SvPropuestaItem, SvEmpresa, SvProspecto,
  SvPersona, SvUsuario, SvProducto, SvResultado, SvEstado
} = require('../models');
const gestiones = require('./gestiones.service');
const logger = require('../../utils/logger');

const UPLOAD_DIR = path.join(__dirname, '../../../uploads/sv/propuestas');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Paleta SerVentas
const COLORS = {
  brown:  '#2C1A0E',
  gold:   '#C8902A',
  cream:  '#F6F1E9',
  text:   '#1A0E06',
  text2:  '#4A2E1A',
  text3:  '#8A6A52',
  emp:    '#1A5C8A'
};

async function nuevoNumero() {
  const year = new Date().getFullYear();
  const last = await SvPropuesta.findOne({
    where: { prop_numero: { [Op.like]: `PROP-${year}-%` } },
    order: [['prop_id', 'DESC']]
  });
  let n = 1;
  if (last) {
    const m = last.prop_numero.match(/PROP-\d{4}-(\d+)/);
    if (m) n = parseInt(m[1]) + 1;
  }
  return `PROP-${year}-${String(n).padStart(4, '0')}`;
}

function calcSubtotal(item) {
  const bruto = item.pi_cantidad * parseFloat(item.pi_precio_unitario);
  const desc = bruto * (parseFloat(item.pi_descuento_pct || 0) / 100);
  return +(bruto - desc).toFixed(2);
}

async function crear(payload, asesorId) {
  const t = await sequelize.transaction();
  try {
    const numero = await nuevoNumero();
    const items = payload.items || [];

    // Calcular subtotales y total
    let total = 0;
    const itemsCalc = items.map((it, i) => {
      const sub = calcSubtotal(it);
      total += sub;
      return { ...it, pi_subtotal: sub, pi_orden: it.pi_orden ?? i };
    });
    const descTotal = parseFloat(payload.prop_descuento_pct || 0);
    const totalFinal = +(total * (1 - descTotal / 100)).toFixed(2);

    const prop = await SvPropuesta.create({
      prop_numero:        numero,
      prop_prospecto_id:  payload.prop_prospecto_id,
      prop_empresa_id:    payload.prop_empresa_id || null,
      prop_contacto_id:   payload.prop_contacto_id || null,
      prop_creado_por:    asesorId,
      prop_valor_total:   totalFinal,
      prop_descuento_pct: descTotal,
      prop_vigencia_dias: payload.prop_vigencia_dias || 30,
      prop_estado:        'borrador',
      prop_notas:         payload.prop_notas || null
    }, { transaction: t });

    for (const it of itemsCalc) {
      await SvPropuestaItem.create({
        pi_prop_id:         prop.prop_id,
        pi_prod_id:         it.pi_prod_id || null,
        pi_descripcion:     it.pi_descripcion,
        pi_cantidad:        it.pi_cantidad,
        pi_precio_unitario: it.pi_precio_unitario,
        pi_descuento_pct:   it.pi_descuento_pct || 0,
        pi_subtotal:        it.pi_subtotal,
        pi_orden:           it.pi_orden
      }, { transaction: t });
    }
    await t.commit();
    return obtener(prop.prop_id);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

async function obtener(id) {
  return SvPropuesta.findByPk(id, {
    include: [
      { model: SvPropuestaItem, as: 'items', include: ['producto'] },
      { model: SvEmpresa,  as: 'empresa' },
      { model: SvPersona,  as: 'contacto' },
      { model: SvUsuario,  as: 'creador', attributes: ['usr_id','usr_nombre','usr_apellido','usr_email','usr_telefono'] },
      { model: SvProspecto, as: 'prospecto' }
    ]
  });
}

async function list({ filtros = {}, scope, page = 1, limit = 20 }) {
  const where = {};
  if (filtros.estado)       where.prop_estado = filtros.estado;
  if (filtros.empresa_id)   where.prop_empresa_id = filtros.empresa_id;
  if (filtros.prospecto_id) where.prop_prospecto_id = filtros.prospecto_id;
  if (scope?.asesorId)      where.prop_creado_por = scope.asesorId;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows, count } = await SvPropuesta.findAndCountAll({
    where,
    include: [
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id','empresa_razon_social','empresa_nit'] },
      { model: SvUsuario, as: 'creador', attributes: ['usr_id','usr_nombre','usr_apellido'] }
    ],
    order: [['prop_created_at', 'DESC']],
    limit: parseInt(limit), offset
  });
  return { items: rows, total: count, page: parseInt(page), limit: parseInt(limit) };
}

async function actualizar(id, payload) {
  const prop = await SvPropuesta.findByPk(id);
  if (!prop) { const e = new Error('Propuesta no encontrada'); e.code = 'NOT_FOUND'; throw e; }
  if (prop.prop_estado !== 'borrador') {
    const e = new Error('Solo se pueden editar propuestas en borrador'); e.code = 'VALIDATION_ERROR'; throw e;
  }

  const t = await sequelize.transaction();
  try {
    const editables = ['prop_notas', 'prop_vigencia_dias', 'prop_descuento_pct', 'prop_destinatario'];
    const data = {};
    for (const k of editables) if (payload[k] !== undefined) data[k] = payload[k];

    // Si se mandan items, reemplazar
    if (Array.isArray(payload.items)) {
      await SvPropuestaItem.destroy({ where: { pi_prop_id: id }, transaction: t });
      let total = 0;
      const itemsCalc = payload.items.map((it, i) => {
        const sub = calcSubtotal(it); total += sub;
        return { ...it, pi_subtotal: sub, pi_orden: it.pi_orden ?? i };
      });
      const descTotal = parseFloat(payload.prop_descuento_pct ?? prop.prop_descuento_pct);
      data.prop_valor_total = +(total * (1 - descTotal / 100)).toFixed(2);
      for (const it of itemsCalc) {
        await SvPropuestaItem.create({
          pi_prop_id: id, pi_prod_id: it.pi_prod_id || null,
          pi_descripcion: it.pi_descripcion, pi_cantidad: it.pi_cantidad,
          pi_precio_unitario: it.pi_precio_unitario, pi_descuento_pct: it.pi_descuento_pct || 0,
          pi_subtotal: it.pi_subtotal, pi_orden: it.pi_orden
        }, { transaction: t });
      }
    }
    await prop.update(data, { transaction: t });
    await t.commit();
    return obtener(id);
  } catch (e) { await t.rollback(); throw e; }
}

function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

/**
 * Genera el PDF de la propuesta y lo guarda en disco. Devuelve { archivo_url, fullPath }.
 */
async function generarPDF(id) {
  const prop = await obtener(id);
  if (!prop) throw new Error('Propuesta no encontrada');

  const fileName = `${prop.prop_numero}.pdf`;
  const fullPath = path.join(UPLOAD_DIR, fileName);
  const urlPath  = `/uploads/sv/propuestas/${fileName}`;

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(fullPath);
    doc.pipe(stream);

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill(COLORS.brown);
    doc.fillColor(COLORS.gold).fontSize(22).font('Helvetica-Bold')
       .text('SerVentas', 50, 25)
       .fontSize(10).fillColor(COLORS.cream).font('Helvetica')
       .text('Serfunorte Los Olivos · Cúcuta', 50, 52);

    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
       .text('PROPUESTA COMERCIAL', doc.page.width - 250, 30, { width: 200, align: 'right' })
       .fontSize(9).font('Helvetica')
       .text(prop.prop_numero, doc.page.width - 250, 48, { width: 200, align: 'right' })
       .text(new Date().toLocaleDateString('es-CO'), doc.page.width - 250, 62, { width: 200, align: 'right' });

    doc.fillColor(COLORS.text);
    doc.y = 110;

    // Cliente
    doc.fontSize(8).fillColor(COLORS.text3).text('CLIENTE', 50, doc.y);
    doc.fontSize(14).fillColor(COLORS.text).font('Helvetica-Bold')
       .text(prop.empresa?.empresa_razon_social || 'Cliente', 50, doc.y + 12);
    doc.fontSize(10).fillColor(COLORS.text2).font('Helvetica')
       .text(`NIT: ${prop.empresa?.empresa_nit || '—'}`, 50, doc.y + 4);
    if (prop.empresa?.empresa_direccion) doc.text(prop.empresa.empresa_direccion);
    if (prop.contacto)
      doc.text(`Contacto: ${prop.contacto.persona_nombre} ${prop.contacto.persona_apellido || ''} · ${prop.contacto.persona_email || prop.contacto.persona_telefono_principal}`);

    doc.moveDown(1.5);

    // Tabla items
    const tableTop = doc.y;
    doc.rect(50, tableTop, doc.page.width - 100, 24).fill(COLORS.emp);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
    doc.text('Descripción', 60, tableTop + 8, { width: 240 });
    doc.text('Cant.',     310, tableTop + 8, { width: 40, align: 'right' });
    doc.text('Precio',    355, tableTop + 8, { width: 70, align: 'right' });
    doc.text('Desc.',     430, tableTop + 8, { width: 45, align: 'right' });
    doc.text('Subtotal',  480, tableTop + 8, { width: 65, align: 'right' });

    doc.fillColor(COLORS.text).font('Helvetica').fontSize(10);
    let y = tableTop + 32;
    for (const it of (prop.items || [])) {
      if (y > doc.page.height - 100) { doc.addPage(); y = 60; }
      doc.text(it.pi_descripcion, 60, y, { width: 240 });
      doc.text(String(it.pi_cantidad), 310, y, { width: 40, align: 'right' });
      doc.text(fmtCOP(it.pi_precio_unitario), 355, y, { width: 70, align: 'right' });
      doc.text(it.pi_descuento_pct + '%', 430, y, { width: 45, align: 'right' });
      doc.text(fmtCOP(it.pi_subtotal), 480, y, { width: 65, align: 'right' });
      y += 22;
    }

    // Totales
    y += 10;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(COLORS.text3).stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text);
    if (parseFloat(prop.prop_descuento_pct) > 0) {
      doc.fontSize(9).text(`Descuento adicional: ${prop.prop_descuento_pct}%`, 360, y, { width: 185, align: 'right' });
      y += 14;
    }
    doc.fontSize(13).fillColor(COLORS.emp)
       .text(`TOTAL: ${fmtCOP(prop.prop_valor_total)}`, 360, y, { width: 185, align: 'right' });
    y += 30;

    // Notas
    if (prop.prop_notas) {
      doc.fontSize(9).fillColor(COLORS.text3).font('Helvetica-Bold').text('CONDICIONES Y NOTAS', 50, y);
      doc.fontSize(10).fillColor(COLORS.text2).font('Helvetica').text(prop.prop_notas, 50, y + 14, { width: doc.page.width - 100 });
      y = doc.y + 10;
    }

    // Vigencia y firma
    y = Math.max(y + 20, doc.page.height - 140);
    doc.fontSize(9).fillColor(COLORS.text3)
       .text(`Vigencia: ${prop.prop_vigencia_dias} días desde la fecha de envío.`, 50, y);

    y += 30;
    doc.fontSize(10).fillColor(COLORS.text);
    doc.text('Atentamente,', 50, y);
    y += 28;
    doc.font('Helvetica-Bold').text(`${prop.creador?.usr_nombre || ''} ${prop.creador?.usr_apellido || ''}`, 50, y);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.text3)
       .text(`Ejecutivo Empresariales · ${prop.creador?.usr_email || ''}`, 50, y + 14)
       .text(`${prop.creador?.usr_telefono || ''}`, 50, y + 26);

    // Footer
    doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill(COLORS.cream);
    doc.fillColor(COLORS.text3).fontSize(8).text(
      `Serfunorte Los Olivos · Cúcuta, Colombia · www.losolivos.co`,
      0, doc.page.height - 20, { width: doc.page.width, align: 'center' }
    );

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  await SvPropuesta.update({ prop_archivo_url: urlPath }, { where: { prop_id: id } });
  return { archivo_url: urlPath, fullPath };
}

/**
 * Marca como enviada + registra gestión + (opcional) envía email.
 */
async function enviar(id, { canal = 'correo', destinatario, asunto, mensaje } = {}, asesorId) {
  const prop = await obtener(id);
  if (!prop) { const e = new Error('Propuesta no encontrada'); e.code = 'NOT_FOUND'; throw e; }

  // Genera PDF si no existe
  let archivoUrl = prop.prop_archivo_url;
  let fullPath;
  if (!archivoUrl) {
    const r = await generarPDF(id);
    archivoUrl = r.archivo_url; fullPath = r.fullPath;
  } else {
    fullPath = path.join(__dirname, '../../..', archivoUrl);
  }

  // Envío email (best-effort, no bloquea)
  let envioInfo = { intentado: false, ok: false };
  if (canal === 'correo' && destinatario && process.env.EMAIL_HOST) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: process.env.EMAIL_USER ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } : undefined
      });
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@serfunorte.com',
        to: destinatario,
        subject: asunto || `Propuesta ${prop.prop_numero} — Serfunorte`,
        text: mensaje || `Hola,\n\nAdjuntamos la propuesta ${prop.prop_numero}.\n\nCordialmente,\n${prop.creador?.usr_nombre || ''}`,
        attachments: [{ filename: path.basename(fullPath), path: fullPath }]
      });
      envioInfo = { intentado: true, ok: true };
    } catch (e) {
      logger.error('[SerVentas] Email propuesta falló:', e.message);
      envioInfo = { intentado: true, ok: false, error: e.message };
    }
  }

  await SvPropuesta.update({
    prop_estado: 'enviada',
    prop_fecha_envio: new Date(),
    prop_canal_envio: canal,
    prop_destinatario: destinatario || null
  }, { where: { prop_id: id } });

  // Registrar gestión automática (resultado "Cotización enviada")
  try {
    const resultado = await SvResultado.findOne({
      where: { resultado_codigo: 'COTIZ_ENVIADA' }
    });
    const estadoCotizacion = await SvEstado.findOne({
      where: { estado_codigo: 'COTIZACION' }
    });
    await gestiones.crear({
      gest_prosp_id: prop.prop_prospecto_id,
      gest_resultado_id: resultado?.resultado_id || null,
      gest_estado_nuevo_id: estadoCotizacion?.estado_id || null,
      gest_canal: canal,
      gest_comentario: `Propuesta ${prop.prop_numero} enviada${destinatario ? ' a ' + destinatario : ''}.`
    }, asesorId);
  } catch (e) {
    logger.error('[SerVentas] Registro de gestión auto-propuesta falló:', e.message);
  }

  return { propuesta: await obtener(id), envio: envioInfo };
}

async function eliminar(id) {
  const prop = await SvPropuesta.findByPk(id);
  if (!prop) { const e = new Error('Propuesta no encontrada'); e.code = 'NOT_FOUND'; throw e; }
  if (prop.prop_estado !== 'borrador') {
    const e = new Error('Solo se pueden eliminar propuestas en borrador'); e.code = 'VALIDATION_ERROR'; throw e;
  }
  await prop.destroy();
  return true;
}

module.exports = { crear, obtener, list, actualizar, generarPDF, enviar, eliminar };
