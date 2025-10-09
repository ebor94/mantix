
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
  }
};

module.exports = emailService;