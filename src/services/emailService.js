
// ============================================
// src/services/emailService.js
// ============================================
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Configurar transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const emailService = {
  // Enviar notificación genérica
  async enviarNotificacion(email, titulo, mensaje) {
    try {
      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: titulo,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #667eea;">${titulo}</h2>
            <p>${mensaje}</p>
            <hr style="margin: 20px 0;">
            <p style="color: #718096; font-size: 12px;">
              Este es un mensaje automático de Mantix - Sistema de Gestión de Mantenimiento
            </p>
          </div>
        `
      });

      logger.info(`Email enviado: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error('Error al enviar email:', error);
      return false;
    }
  },

  // Enviar recordatorio de mantenimiento
  async enviarRecordatorioMantenimiento(email, mantenimiento) {
    const titulo = 'Recordatorio: Mantenimiento Programado';
    const mensaje = `
      <p>Te recordamos que tienes un mantenimiento programado:</p>
      <ul>
        <li><strong>Código:</strong> ${mantenimiento.codigo}</li>
        <li><strong>Fecha:</strong> ${mantenimiento.fecha_programada}</li>
        <li><strong>Hora:</strong> ${mantenimiento.hora_programada || 'No especificada'}</li>
      </ul>
    `;
    return await this.enviarNotificacion(email, titulo, mensaje);
  },

  // Enviar alerta de mantenimiento vencido
  async enviarAlertaMantenimientoVencido(email, mantenimiento) {
    const titulo = '⚠️ Alerta: Mantenimiento Vencido';
    const mensaje = `
      <p style="color: #f56565;">El siguiente mantenimiento está vencido:</p>
      <ul>
        <li><strong>Código:</strong> ${mantenimiento.codigo}</li>
        <li><strong>Fecha programada:</strong> ${mantenimiento.fecha_programada}</li>
      </ul>
      <p>Por favor, atiende esta tarea lo antes posible.</p>
    `;
    return await this.enviarNotificacion(email, titulo, mensaje);
  },

  /**
   * Notifica al asesor que debe corregir beneficiarios de una afiliación.
   * Incluye el motivo del rechazo y un enlace directo a la URL de corrección.
   */
  async sendRechazoParcialAfiliacion(destinatario, nombreAfiliado, motivo, urlCorreccion) {
    const titulo = 'Corrección requerida — Afiliación Serfunorte';
    const mensaje = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#dc2626;padding:16px 20px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0;font-size:18px">⚠️ Corrección requerida en afiliación</h2>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="color:#374151;margin:0 0 12px">Estimado asesor,</p>
          <p style="color:#374151;margin:0 0 12px">
            La afiliación del titular <strong>${nombreAfiliado}</strong>
            requiere corrección en los beneficiarios registrados.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 16px;margin:16px 0">
            <p style="color:#991b1b;margin:0"><strong>Motivo:</strong> ${motivo || 'No especificado'}</p>
          </div>
          <p style="color:#374151;margin:0 0 20px">
            Por favor ingresa al siguiente enlace para realizar la corrección:
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="${urlCorreccion}"
               style="background:#0d9488;color:#fff;padding:12px 28px;border-radius:8px;
                      text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              Corregir afiliación
            </a>
          </div>
          <p style="color:#6b7280;font-size:12px;margin:0 0 8px">
            Si el botón no funciona, copia y pega este enlace en tu navegador:
          </p>
          <p style="margin:0">
            <a href="${urlCorreccion}" style="color:#0d9488;font-size:12px;word-break:break-all">
              ${urlCorreccion}
            </a>
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0">
            Serfunorte — Sistema de Afiliaciones
          </p>
        </div>
      </div>
    `;
    return await this.enviarNotificacion(destinatario, titulo, mensaje);
  }
};

module.exports = emailService;