// Correo del módulo (spec §10.2). Transporte nodemailer propio con las mismas variables EMAIL_* de Mantix, pero
// sin el emailService genérico: ese interpola HTML sin escapar y atrapa los errores, y el outbox necesita que un
// fallo lance para reintentar. Un solo destinatario por envío; nunca lo decide la petición del usuario.
const nodemailer = require('nodemailer');

const UN_CORREO = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

function crearTransporteMantix(env = process.env) {
  return nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: Number(env.EMAIL_PORT) || 587,
    secure: Number(env.EMAIL_PORT) === 465,
    auth: env.EMAIL_USER ? { user: env.EMAIL_USER, pass: env.EMAIL_PASSWORD } : undefined,
    requireTLS: Number(env.EMAIL_PORT) !== 465, // STARTTLS obligatorio: la cita no viaja en claro
  });
}

function crearCorreo({ transporte, remitente }) {
  if (!remitente) throw new Error('CORREO_SIN_REMITENTE');

  /** `mensaje` = { asunto, html, texto } de plantillas. Devuelve el messageId del servidor. */
  async function enviar(para, mensaje) {
    if (typeof para !== 'string' || !UN_CORREO.test(para) || para.length > 150) throw new Error('CORREO_DESTINATARIO_INVALIDO');
    const info = await transporte.sendMail({
      from: remitente,
      to: para,
      subject: String(mensaje.asunto).replace(/[\r\n]+/g, ' '),
      html: mensaje.html,
      text: mensaje.texto,
      disableFileAccess: true, // el contenido nunca incluye archivos ni URLs que nodemailer deba leer
      disableUrlAccess: true,
    });
    return info && info.messageId ? String(info.messageId) : null;
  }

  return { enviar };
}

module.exports = { crearCorreo, crearTransporteMantix };
