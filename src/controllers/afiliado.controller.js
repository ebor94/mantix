const afiliadoService = require('../services/afiliado.service');
const AppError = require('../utils/AppError');
const { sendAceptacion, sendOTP, sendImagenRecibo, sendTemplateImagenTexto } = require('../services/whatsappService');
const axios = require('axios');
const { notificarNuevoVeolia, notificarCorreccionVeolia, notificarNuevoPublico } = require('../services/googleChatService');
const convenioService = require('../services/convenio.service');
const invitacionService = require('../services/invitacion.service');
const emailService = require('../services/emailService');
const { esOrigenPublico } = require('../utils/origen');
const { notificarCertificadoAfiliacion, notificarFirma } = require('../services/n8nService');
const pdfService   = require('../services/pdfService');
const excelService = require('../services/excelService');
const { sincronizarAfiliado } = require('../services/crmSync.service');
const { Afiliado, ReciboCaja, Usuario } = require('../models');
const { Op } = require('sequelize');
const otpStore  = require('../utils/otpStore');
const { encodeId, decodeId } = require('../utils/hashId');
const logger = require('../utils/logger');

/**
 * Construye la URL pública del PDF de un recibo, usando la variable de
 * entorno PUBLIC_API_URL. En desarrollo (sin variable), retorna ruta relativa.
 */
function buildPublicPdfUrl(pdfUrlRelativa) {
  const base = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
  if (!base) return pdfUrlRelativa;
  return `${base}${pdfUrlRelativa}`;
}

// ── Carné digital de afiliación ──────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');

// Imagen base empaquetada localmente (evita depender de la red/TLS del host
// remoto — la descarga remota fallaba de forma intermitente con EPROTO).
const CARNET_BASE_LOCAL = path.join(__dirname, '../../assets/carnet-base.png');
const CARNET_BASE_URL =
  process.env.CARNET_BASE_URL ||
  'https://losolivoscucuta.com/difusiones/img/carnet.png';

// Cache de la imagen base con TTL de 5 min (permite actualizar el diseño sin reiniciar)
let _carnetBaseCache = { buf: null, ts: 0 };
const CARNET_BASE_TTL_MS = 5 * 60 * 1000;

async function obtenerCarnetBase() {
  // 1) Preferir el archivo local (robusto, sin red).
  try {
    if (fs.existsSync(CARNET_BASE_LOCAL)) {
      return fs.readFileSync(CARNET_BASE_LOCAL);
    }
  } catch (_) { /* si falla la lectura local, se intenta el remoto */ }

  // 2) Fallback: descargar de CARNET_BASE_URL (cacheada).
  if (_carnetBaseCache.buf && (Date.now() - _carnetBaseCache.ts) < CARNET_BASE_TTL_MS) {
    return _carnetBaseCache.buf;
  }
  const res = await axios.get(CARNET_BASE_URL, { responseType: 'arraybuffer', timeout: 10000 });
  const buf = Buffer.from(res.data);
  _carnetBaseCache = { buf, ts: Date.now() };
  return buf;
}

function captionCarnet(afiliado) {
  const nombre = [afiliado.primerNombre, afiliado.primerApellido].filter(Boolean).join(' ');
  return `¡Bienvenido(a) a Los Olivos${nombre ? ', ' + nombre : ''}! Este es tu carné digital de afiliación. Guárdalo para futuras consultas.`;
}

/**
 * Fire-and-forget tras la aprobación: genera el carné digital, lo envía por
 * WhatsApp al afiliado (solo si celularTieneWhatsapp === 1) y dispara el
 * webhook n8n del certificado incluyendo la URL del carné para que n8n lo
 * envíe por correo y lo archive en la carpeta Drive del afiliado.
 */
async function emitirCarnetYCertificado(afiliadoId, aprobadoPor) {
  let carnetUrl = null;
  try {
    const afiliado = await Afiliado.findByPk(afiliadoId);
    if (afiliado) {
      const base   = await obtenerCarnetBase();
      const carnet = await pdfService.generarCarnetImagen(afiliado.toJSON(), base);
      carnetUrl    = buildPublicPdfUrl(carnet.url);

      if (Number(afiliado.celularTieneWhatsapp) === 1 && afiliado.celular) {
        await sendTemplateImagenTexto(afiliado.celular, carnetUrl, captionCarnet(afiliado));
      }
    }
  } catch (e) {
    logger.warn(`[Carnet] No se pudo generar/enviar el carné del afiliado ${afiliadoId}: ${e.message || e}`);
  }
  // Siempre disparar el certificado (con carnetUrl si se generó → correo + Drive en n8n)
  await notificarCertificadoAfiliacion(afiliadoId, aprobadoPor, carnetUrl);
}

/**
 * Fire-and-forget: genera el PDF del recibo recién emitido y lo envía
 * por WhatsApp al cliente. No bloquea la respuesta HTTP de la afiliación.
 */
async function emitirPdfYEnviarWhatsapp(afiliadoId) {
  try {
    const recibo = await ReciboCaja.findOne({
      where: { afiliadoId },
      include: [{ model: Usuario, as: 'asesor' }]
    });
    if (!recibo) return; // POSFECHADO u otra forma sin recibo

    const afiliado = await Afiliado.findByPk(afiliadoId);
    if (!afiliado) return;

    const reciboJson   = recibo.toJSON();
    const afiliadoJson = afiliado.toJSON();
    const asesorJson   = recibo.asesor ? recibo.asesor.toJSON() : null;

    // 1) Generar PDF — solo para que quede disponible en /mis-recibos
    const pdfInfo = await pdfService.generarReciboCajaPDF(reciboJson, afiliadoJson, asesorJson);
    await recibo.update({ pdfUrl: pdfInfo.url });

    // Pago en caja: el recibo existe para el cuadre de la cajera, pero NO se
    // envía el voucher por WhatsApp al cliente.
    if (recibo.formaPago === 'PAGO_EN_CAJA') return;

    // 2) Generar la imagen-voucher PNG. Se descarga en el servidor en
    //    uploads/recibos/{numeroRecibo}.png y queda accesible via PUBLIC_API_URL.
    const imgInfo = await pdfService.generarReciboCajaImagen(
      reciboJson, afiliadoJson, asesorJson
    );

    // 3) Enviar la imagen al cliente por WhatsApp usando la plantilla
    //    texto_imagen_generico (header=image.link, body=texto). El payload
    //    se construye exactamente como exige 1msg.
    const urlImagenPublica = buildPublicPdfUrl(imgInfo.url);
    const result = await sendImagenRecibo(
      afiliado.celular,
      urlImagenPublica,
      recibo.numeroRecibo,
      recibo.valor
    );

    if (result.success) {
      await recibo.update({
        whatsappEnviado: true,
        whatsappEnviadoAt: new Date()
      });
    }
  } catch (err) {
    logger.error('[ReciboCaja] Error en emitirPdfYEnviarWhatsapp:', err.message || err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractFiles(req, body) {
  if (req.files?.soporte?.[0])             body.soportePago          = req.files.soporte[0].filename;
  if (req.files?.cedulaFrontal?.[0])       body.cedulaFrontal        = req.files.cedulaFrontal[0].filename;
  if (req.files?.cedulaReverso?.[0])       body.cedulaReverso        = req.files.cedulaReverso[0].filename;
  if (req.files?.contratoCompetencia?.[0]) body.contratoCompetencia  = req.files.contratoCompetencia[0].filename;

  if (Array.isArray(body.beneficiarios)) {
    body.beneficiarios = body.beneficiarios.map((b, i) => {
      const campo = `beneficiario_doc_${i}`;
      const file  = req.files?.[campo]?.[0];
      return file ? { ...b, documentoUrl: file.filename } : b;
    });
  }
}

/**
 * Enmascara un teléfono mostrando solo los últimos 3 dígitos.
 * "3143678786" → "3XX XXX X786"
 */
function maskPhone(phone) {
  const p = String(phone).replace(/\D/g, '');
  if (p.length < 4) return '****';
  const visible = p.slice(-3);
  const hidden = p.slice(0, -3).replace(/\d/g, 'X');
  // Formato: primero dígito + XX XXX X + últimos 3
  if (p.length === 10) {
    return `${p[0]}XX XXX X${visible}`;
  }
  return `${hidden}${visible}`;
}

/** Genera un OTP numérico de 5 dígitos */
function generarOtp() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

// ── Registros ─────────────────────────────────────────────────────────────────

async function create(req, res, next) {
  try {
    const body = { ...req.body };
    extractFiles(req, body);
    body.asesorId = req.usuario.id;
    body.origen = 'ASESOR';
    const result = await afiliadoService.createAfiliadoWithBeneficiarios(body);
    Afiliado.count({ where: { celular: body.celular } })
      .then(count => { if (count <= 1) sendAceptacion(body.celular).catch(() => {}); })
      .catch(() => {});
    // Fire-and-forget: generar PDF del recibo (si se emitió) y enviarlo por WhatsApp
    emitirPdfYEnviarWhatsapp(result.id).catch(() => {});

    // Fire-and-forget: solicitar envío de la firma electrónica via n8n
    // (solo canal ASESOR estándar; createPublico/Veolia NO debe disparar esto).
    notificarFirma(result.id).catch(() => {});

    // Fire-and-forget: sincronizar con sv_crm_personas + prospecto (estado AFILIADO,
    // asignado al equivalente del asesor en el CRM vía el puente de identidad SSO).
    sincronizarAfiliado(result, req.usuario).catch(() => {});

    res.status(201).json({ success: true, message: 'Afiliado registrado exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

async function createPublico(req, res, next) {
  try {
    const body = { ...req.body };
    extractFiles(req, body);
    body.asesorId = null;
    body.origen = 'VEOLIA';
    body.notificacionRecibo = 0;
    const result = await afiliadoService.createAfiliadoWithBeneficiarios(body);
    Afiliado.count({ where: { celular: body.celular } })
      .then(count => { if (count <= 1) sendAceptacion(body.celular).catch(() => {}); })
      .catch(() => {});
    // Notificación Google Chat — fire-and-forget
    notificarNuevoVeolia({ ...body, beneficiarios: body.beneficiarios || [] });

    res.status(201).json({ success: true, message: 'Afiliado registrado exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /afiliados/convenio/:slug
 *
 * Registro público de un convenio empresarial. Mismo canal que Veolia (sin
 * sesión), pero con dos diferencias que importan:
 *
 *  1. Los datos de la empresa y los defaults comerciales se FUERZAN desde la
 *     fila del convenio, pisando lo que venga del cliente. En /veolia el NIT
 *     viaja en el cuerpo y afiliado.service lo usa para crear la empresa si no
 *     existe, lo que permite a un anónimo insertar empresas arbitrarias. Aquí
 *     eso no puede pasar: el cliente no elige ni el NIT ni el plan.
 *
 *  2. El grupo familiar se valida contra las reglas del convenio dentro de
 *     afiliado.service (ver assertReglasConvenio), así que un POST con curl
 *     saltándose el formulario recibe 400 con el detalle de lo que incumple.
 */
async function createPublicoConvenio(req, res, next) {
  try {
    const convenio = await convenioService.obtenerPorSlug(req.params.slug);
    if (!convenio) throw new AppError('Convenio no encontrado o no disponible', 404);

    const body = { ...req.body };
    extractFiles(req, body);

    body.asesorId = null;
    body.origen = 'CONVENIO';
    body.notificacionRecibo = 0;

    // Datos que define el convenio, no el cliente.
    body.convenioId    = convenio.id;
    body.nit           = convenio.nit || null;
    body.nombreEmpresa = convenio.nombre;
    body.canal         = convenio.canal;
    body.producto      = convenio.producto;
    body.grupo         = convenio.grupo;

    // Campos propios de Veolia: no aplican a un convenio.
    body.unidadNegocio = null;
    body.planVeolia    = null;

    const result = await afiliadoService.createAfiliadoWithBeneficiarios(body);

    Afiliado.count({ where: { celular: body.celular } })
      .then(count => { if (count <= 1) sendAceptacion(body.celular).catch(() => {}); })
      .catch(() => {});

    // Notificaciones fire-and-forget: si fallan no rompen la respuesta.
    const contacto = convenio.json('contacto') || {};
    const formulario = convenio.json('formulario') || {};
    if (contacto.googleChat?.notificar !== false) {
      notificarNuevoPublico(
        { ...body, beneficiarios: body.beneficiarios || [] },
        {
          etiqueta: contacto.googleChat?.etiqueta || convenio.nombre,
          mostrarAsistencia: formulario.mostrarAsistenciaFueraDeCasa !== false
        }
      );
    }
    if (contacto.notificarA) {
      notificarRegistroConvenio(contacto.notificarA, convenio, result).catch(() => {});
    }

    res.status(201).json({ success: true, message: 'Afiliado registrado exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * Aviso a talento humano de la empresa por cada registro nuevo del convenio.
 * El destinatario se configura en `convenios.contacto.notificarA`.
 */
async function notificarRegistroConvenio(destinatario, convenio, afiliado) {
  const nombre = [afiliado.primerNombre, afiliado.segundoNombre, afiliado.primerApellido, afiliado.segundoApellido]
    .filter(Boolean).join(' ');
  const beneficiarios = afiliado.beneficiarios?.length ?? 0;

  return emailService.enviarNotificacion(
    destinatario,
    `Nueva afiliación registrada — ${convenio.nombre}`,
    `Se registró una nueva afiliación por el convenio <strong>${convenio.nombre}</strong>.
     <ul>
       <li><strong>Colaborador:</strong> ${nombre}</li>
       <li><strong>Documento:</strong> ${afiliado.tipoDocumento} ${afiliado.numeroDocumento}</li>
       <li><strong>Grupo familiar:</strong> ${beneficiarios} beneficiario(s)</li>
     </ul>
     La afiliación quedó pendiente de aprobación por parte de Los Olivos.`
  );
}

/**
 * POST /afiliados/convenio/invitacion/:token
 *
 * Registro público de autoafiliación por invitación de nómina (Task 4).
 * Mismo canal público que createPublicoConvenio (sin sesión), con dos
 * diferencias respecto a ese:
 *
 *  1. El convenio NO se identifica por slug en la URL sino por el token de
 *     invitación: invitacionService.resolverToken hace las cinco
 *     comprobaciones (token existe, no usado, no vencido, convenio activo,
 *     empleado activo en la nómina) antes de dejar seguir.
 *
 *  2. La identidad del titular (documento y nombres) se fuerza desde el
 *     empleado de nómina, igual que el convenio fuerza nit/canal/producto/
 *     grupo en createPublicoConvenio: el cliente no puede autoafiliar a otra
 *     persona con un link ajeno cambiando el documento en el payload.
 *
 * La invitación se marca usada DENTRO de la misma transacción que crea el
 * afiliado (afiliadoService.createAfiliadoConInvitacion), así que un doble
 * submit concurrente con el mismo token no puede generar dos afiliados — ver
 * el docstring de esa función y de invitacionService.marcarUsada.
 */
async function createPublicoConvenioInvitacion(req, res, next) {
  try {
    const token = req.params.token;
    const { convenio: convenioPublico, empleado } = await invitacionService.resolverToken(token);

    // resolverToken devuelve la proyección pública del convenio (toPublicJSON),
    // que deliberadamente no incluye el id ni datos internos de contacto. Se
    // vuelve a cargar por slug — mismo helper que usa createPublicoConvenio —
    // para tener el registro completo (id, nit, contacto, etc.) sin tocar
    // invitacion.service.js.
    const convenio = await convenioService.obtenerPorSlug(convenioPublico.slug);
    if (!convenio) throw new AppError('Convenio no encontrado o no disponible', 404);

    const body = { ...req.body };
    extractFiles(req, body);

    body.asesorId = null;
    body.origen = 'CONVENIO';
    body.notificacionRecibo = 0;

    // Datos que define el convenio, no el cliente (igual que createPublicoConvenio).
    body.convenioId    = convenio.id;
    body.nit           = convenio.nit || null;
    body.nombreEmpresa = convenio.nombre;
    body.canal         = convenio.canal;
    body.producto      = convenio.producto;
    body.grupo         = convenio.grupo;

    // Identidad del titular: se fuerza desde el empleado de nómina, nunca
    // desde el body — el cliente no puede autoafiliar a otra persona con un
    // link de invitación ajeno.
    body.tipoDocumento   = empleado.tipoDocumento;
    body.numeroDocumento = empleado.numeroDocumento;
    body.primerNombre    = empleado.primerNombre;
    body.primerApellido  = empleado.primerApellido;

    // Campos propios de Veolia: no aplican a un convenio.
    body.unidadNegocio = null;
    body.planVeolia    = null;

    const result = await afiliadoService.createAfiliadoConInvitacion(body, token);

    Afiliado.count({ where: { celular: body.celular } })
      .then(count => { if (count <= 1) sendAceptacion(body.celular).catch(() => {}); })
      .catch(() => {});

    // Notificaciones fire-and-forget: si fallan no rompen la respuesta.
    const contacto = convenio.json('contacto') || {};
    const formulario = convenio.json('formulario') || {};
    if (contacto.googleChat?.notificar !== false) {
      notificarNuevoPublico(
        { ...body, beneficiarios: body.beneficiarios || [] },
        {
          etiqueta: contacto.googleChat?.etiqueta || convenio.nombre,
          mostrarAsistencia: formulario.mostrarAsistenciaFueraDeCasa !== false
        }
      );
    }
    if (contacto.notificarA) {
      notificarRegistroConvenio(contacto.notificarA, convenio, result).catch(() => {});
    }

    res.status(201).json({ success: true, message: 'Afiliado registrado exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

// ── Consultas ─────────────────────────────────────────────────────────────────

async function getAll(req, res, next) {
  try {
    const afiliados = await afiliadoService.getAllAfiliados(req.usuario);
    res.json({ success: true, data: afiliados });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /afiliados/por-hash/:hash
 * Carga pública de una afiliación rechazada/parcial usando el hash cifrado.
 * No requiere autenticación — el hash es el control de acceso.
 */
async function getByHash(req, res, next) {
  try {
    const id = decodeId(req.params.hash);
    if (!id) throw new AppError('Enlace inválido o expirado', 400);
    const afiliado = await afiliadoService.getAfiliadoById(id);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
    if (!afiliado.rechazado && !afiliado.rechazadoParcial) {
      throw new AppError('Esta afiliación no está pendiente de corrección', 400);
    }
    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    // Se pasa req.usuario para aplicar whereConFiltroAsesor + whereConFiltroEmpresa
    // (Task 4): un usuario con empresa_id no puede ver afiliados de otra
    // empresa. El chequeo manual de abajo (ownership por asesorId) se
    // conserva sin tocar para el canal ASESOR existente.
    const afiliado = await afiliadoService.getAfiliadoById(req.params.id, req.usuario);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
    const usuario = req.usuario;
    if (!usuario.es_super_admin) {
      const permisos = typeof usuario.rol?.permisos === 'string'
        ? JSON.parse(usuario.rol.permisos)
        : (usuario.rol?.permisos || {});
      const pAfil = permisos.afiliaciones || {};
      const pEmpresa = permisos.empresa || {};
      // El chequeo de ownership por asesorId es la dimensión ASESOR
      // (ver_todas la exime); un usuario EMPRESA_RRHH nunca es dueño por
      // asesorId (no es asesor), así que se lo exime de ESTA verificación
      // vía `empresa.ver_afiliaciones` — su alcance real ya quedó acotado a
      // su propia empresa por whereConFiltroEmpresa en la consulta de arriba
      // (Fix 4.4: si el afiliado fuera de otra empresa, la consulta ya
      // habría devuelto null y ni siquiera llegaríamos aquí).
      if (!pAfil.ver_todas && !pEmpresa.ver_afiliaciones && afiliado.asesorId !== usuario.id) {
        throw new AppError('No tienes permiso para ver esta afiliación', 403);
      }
    }
    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function getPendientes(req, res, next) {
  try {
    const afiliados = await afiliadoService.getPendientes(req.usuario);
    res.json({ success: true, data: afiliados });
  } catch (error) {
    next(error);
  }
}

async function getRechazados(req, res, next) {
  try {
    const afiliados = await afiliadoService.getRechazados(req.usuario);
    // Usar hashCorreccion guardado en BD; si no existe (ej. rechazo total), calcular al vuelo
    const data = afiliados.map(a => ({
      ...a.toJSON(),
      hash: a.hashCorreccion || encodeId(a.id)
    }));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ── Aprobación / rechazo ──────────────────────────────────────────────────────

async function aprobar(req, res, next) {
  try {
    const afiliado = await afiliadoService.aprobarAfiliado(req.params.id, req.usuario.id);

    // Fire-and-forget: disparar webhook de n8n para generar/enviar el
    // certificado de afiliación. No bloquea la respuesta al frontend
    // y si falla solo queda en logs (la aprobación ya persistió).
    const aprobadoPor = [req.usuario?.nombre, req.usuario?.apellido]
      .filter(Boolean).join(' ').trim() || `user:${req.usuario?.id || 'desconocido'}`;
    // Genera el carné (WhatsApp al afiliado) y dispara el certificado n8n
    // (correo + Drive) incluyendo la URL del carné. Fire-and-forget.
    emitirCarnetYCertificado(afiliado.id, aprobadoPor).catch((err) => {
      logger.warn(`[Afiliado.aprobar] Carné/certificado falló: ${err?.message || err}`);
    });

    res.json({ success: true, message: 'Registro aprobado exitosamente', data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function rechazar(req, res, next) {
  try {
    const { motivo } = req.body;
    const afiliado = await afiliadoService.rechazarAfiliado(req.params.id, motivo, req.usuario.id);
    res.json({ success: true, message: 'Registro rechazado', data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function rechazarParcial(req, res, next) {
  try {
    const { motivo, beneficiarioIds } = req.body;
    if (!Array.isArray(beneficiarioIds) || beneficiarioIds.length === 0) {
      throw new AppError('Debe enviar al menos un beneficiarioId', 400);
    }
    const afiliado = await afiliadoService.rechazarBeneficiarios(
      req.params.id, beneficiarioIds, motivo, req.usuario.id
    );

    res.json({ success: true, message: 'Beneficiarios inactivados', data: afiliado });
  } catch (error) {
    next(error);
  }
}

// ── Reenvío ───────────────────────────────────────────────────────────────────

async function reenviar(req, res, next) {
  try {
    const body = { ...req.body };

    // Cargar el origen del afiliado para decidir el flujo
    const afiliadoActual = await Afiliado.findByPk(req.params.id, {
      attributes: ['id', 'origen']
    });
    if (!afiliadoActual) throw new AppError('Afiliado no encontrado', 404);

    // OTP obligatorio para TODO origen público (Veolia y convenios): son
    // clientes externos sin JWT, y el hash de la URL por sí solo no alcanza
    // como control de acceso. El canal ASESOR se controla por sesión (req.usuario).
    //
    // Antes esto comparaba `origen === 'VEOLIA'`. Con los datos previos el
    // resultado es idéntico fila por fila, pero de haberlo dejado así los
    // convenios habrían podido reenviar correcciones sin OTP.
    const esPublico = esOrigenPublico(afiliadoActual);

    if (esPublico) {
      const { otp } = body;
      if (!otp) throw new AppError('Se requiere el código OTP para reenviar', 400);
      if (!otpStore.verify(`reenvio:${req.params.id}`, otp)) {
        return res.status(401).json({ success: false, message: 'Código OTP inválido o expirado' });
      }
    }

    // Eliminar otp del body antes de pasarlo al servicio (si vino)
    delete body.otp;
    extractFiles(req, body);
    const result = await afiliadoService.reenviarAfiliacion(req.params.id, body, req.usuario);

    // Notificación Google Chat para toda corrección reenviada (Veolia y Asesor).
    // Fire-and-forget — si el chat falla no rompe la respuesta al cliente.
    notificarCorreccionVeolia(result);

    res.json({ success: true, message: 'Afiliación reenviada para aprobación', data: result });
  } catch (error) {
    next(error);
  }
}

// ── OTP Consulta pública ──────────────────────────────────────────────────────

/**
 * POST /afiliados/consulta/solicitar-otp
 * Genera y envía OTP al celular del afiliado encontrado por documento.
 */
async function solicitarOtp(req, res, next) {
  try {
    const { numeroDocumento } = req.body;
    if (!numeroDocumento) throw new AppError('Número de documento requerido', 400);

    const afiliado = await afiliadoService.getAfiliadoByDocumento(numeroDocumento);
    if (!afiliado) throw new AppError('No se encontró un afiliado con ese número de documento', 404);

    const otp = generarOtp();
    otpStore.set(numeroDocumento, otp);

    await sendOTP(afiliado.celular, otp, 'Consulta de afiliado Serfunorte');

    res.json({
      success: true,
      celularMasked: maskPhone(afiliado.celular)
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /afiliados/consulta/verificar-otp
 * Valida el OTP e retorna los datos del afiliado si es correcto.
 */
async function verificarOtp(req, res, next) {
  try {
    const { numeroDocumento, otp } = req.body;
    if (!numeroDocumento || !otp) throw new AppError('Documento y OTP son requeridos', 400);

    const valid = otpStore.verify(numeroDocumento, otp);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Código incorrecto o expirado' });
    }

    const afiliado = await afiliadoService.getAfiliadoByDocumento(numeroDocumento);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);

    // Trazabilidad
    afiliadoService.registrarConsulta(
      afiliado.id,
      req.usuario?.id || null,
      'Consulta verificada con OTP'
    ).catch(() => {});

    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /afiliados/:id/datos-contacto
 * Actualiza solo campos de contacto editables por el afiliado.
 */
async function actualizarDatosContacto(req, res, next) {
  try {
    const result = await afiliadoService.actualizarDatosContacto(
      req.params.id,
      req.body,
      req.usuario?.id || null
    );
    res.json({ success: true, message: 'Datos de contacto actualizados', data: result });
  } catch (error) {
    next(error);
  }
}

// ── OTP Reenvío ───────────────────────────────────────────────────────────────

/**
 * POST /afiliados/:id/solicitar-otp-reenvio
 * Genera y envía OTP al celular del afiliado para confirmar el reenvío.
 */
async function solicitarOtpReenvio(req, res, next) {
  try {
    const afiliado = await afiliadoService.getAfiliadoById(req.params.id);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);

    const otp = generarOtp();
    otpStore.set(`reenvio:${afiliado.id}`, otp);

    await sendOTP(afiliado.celular, otp, 'Reenvío de afiliación Serfunorte');

    res.json({
      success: true,
      celularMasked: maskPhone(afiliado.celular)
    });
  } catch (error) {
    next(error);
  }
}

// ── Beneficiarios (consulta pública) ─────────────────────────────────────────

async function consultarPorDocumento(req, res, next) {
  try {
    const afiliado = await afiliadoService.getAfiliadoByDocumento(req.params.numerodocumento);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
    afiliadoService.registrarConsulta(
      afiliado.id, req.usuario?.id || null,
      `Consulta por documento: ${req.params.numerodocumento}`
    ).catch(() => {});
    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/afiliados/buscar/:numeroDocumento
 * Búsqueda interna usada por el formulario de registro cuando el asesor
 * quiere precargar los datos personales de un cliente recurrente.
 *
 * - Devuelve 200 con data=null si no hay coincidencias (en vez de 404)
 *   para que la UI muestre un toast info sin tratar como error.
 * - Retorna el afiliado MÁS RECIENTE con ese documento (orden por createdAt DESC).
 * - Registra la consulta en trazabilidad.
 */
async function buscarPorDocumento(req, res, next) {
  try {
    const { numeroDocumento } = req.params;
    // Se pasa req.usuario para aplicar whereConFiltroAsesor: un asesor sin
    // permiso ver_todas no debe ver afiliados de otro asesor. Si el afiliado
    // existe pero es de otro asesor, se responde igual que "sin coincidencias"
    // (mismo contrato de la UI) en vez de revelar que el registro existe.
    const afiliado = await afiliadoService.getAfiliadoByDocumento(numeroDocumento, req.usuario);
    if (!afiliado) {
      return res.json({ success: true, data: null, message: 'Sin coincidencias' });
    }
    afiliadoService.registrarConsulta(
      afiliado.id, req.usuario?.id || null,
      `Búsqueda en formulario por documento: ${numeroDocumento}`
    ).catch(() => {});
    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function actualizarBeneficiariosConsulta(req, res, next) {
  try {
    const { beneficiarios = [] } = req.body;
    const result = await afiliadoService.actualizarBeneficiariosConsulta(
      req.params.id, beneficiarios, req.usuario?.id || null
    );
    res.json({ success: true, message: 'Beneficiarios actualizados', data: result });
  } catch (error) {
    next(error);
  }
}

async function getVeoliaUnidades(req, res, next) {
  try {
    const { VeoliaUnidadNegocio } = require('../models');
    const unidades = await VeoliaUnidadNegocio.findAll({
      where: { activo: 1 },
      attributes: ['id', 'nombre'],
      order: [['nombre', 'ASC']]
    });
    res.json({ success: true, data: unidades });
  } catch (err) {
    next(err);
  }
}

async function getTrazabilidad(req, res, next) {
  try {
    const registros = await afiliadoService.getTrazabilidad(req.params.id, req.usuario);
    // null = el afiliado no existe o no pasa whereConFiltroAsesor. Se responde
    // 404 (no 403) para no revelar a un asesor que el registro existe.
    if (registros === null) throw new AppError('Afiliado no encontrado', 404);
    res.json({ success: true, data: registros });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /afiliados/mis-del-dia
 * Retorna las afiliaciones del asesor logueado en un rango de fechas,
 * sin filtrar por estado (pendientes, aprobadas y rechazadas).
 * Query: ?fecha=YYYY-MM-DD | ?fechaDesde&fechaHasta
 */
async function getMisDelDia(req, res, next) {
  try {
    const { fecha, fechaDesde, fechaHasta } = req.query;
    const data = await afiliadoService.getMisDelDia(req.usuario, { fecha, fechaDesde, fechaHasta });
    // Incluir hash de corrección para los rechazados, igual que getRechazados
    const enriched = data.map(a => {
      const json = a.toJSON();
      if (a.rechazado || a.rechazadoParcial) {
        json.hash = a.hashCorreccion || encodeId(a.id);
      }
      return json;
    });
    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /afiliados/legalizar
 * Marca un lote de afiliaciones como legalizadas con un número de planilla.
 * Body: { afiliadoIds: number[], numeroPlanilla: string }
 * Permiso: afiliaciones.legalizar
 */
async function legalizarAfiliaciones(req, res, next) {
  try {
    const { afiliadoIds, numeroPlanilla } = req.body;
    const result = await afiliadoService.legalizarAfiliaciones(
      afiliadoIds,
      req.usuario,
      numeroPlanilla
    );
    const msg = result.legalizados > 0
      ? `${result.legalizados} afiliación(es) legalizadas con planilla N° ${numeroPlanilla}`
      : 'Todas las afiliaciones seleccionadas ya estaban legalizadas';
    res.json({ success: true, message: msg, data: result });
  } catch (err) { next(err); }
}

/**
 * POST /api/afiliados/liquidacion-pdf
 * Genera y descarga el PDF de liquidación de las afiliaciones seleccionadas.
 * Body: { afiliadoIds: number[] }
 * Permiso: afiliaciones.ver_propias (el servicio filtra por asesorId)
 */
async function liquidacionPdf(req, res, next) {
  try {
    const { afiliadoIds } = req.body || {};

    // Calcula agregados + valida ownership y estado APROBADO
    const { afiliaciones, totales } = await afiliadoService.calcularLiquidacion(
      afiliadoIds, req.usuario
    );

    // Cargar prefijo del asesor para el nombre del archivo
    const asesor = await Usuario.findByPk(req.usuario.id, {
      attributes: ['id', 'nombre', 'apellido', 'prefijo_recibo']
    });
    const prefijo = asesor?.prefijo_recibo || 'GEN';

    // Nombre con timestamp local (YYYYMMDD-HHmm)
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const fileName = `liquidacion-${prefijo}-${stamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await pdfService.generarLiquidacionPDF(
      afiliaciones,
      totales,
      asesor ? asesor.toJSON() : { nombre: '', apellido: '', prefijo_recibo: prefijo },
      res
    );
  } catch (err) { next(err); }
}

module.exports = {
  create,
  createPublico,
  createPublicoConvenio,
  createPublicoConvenioInvitacion,
  getAll,
  getById,
  getByHash,
  getPendientes,
  aprobar,
  rechazar,
  rechazarParcial,
  getRechazados,
  reenviar,
  solicitarOtp,
  verificarOtp,
  actualizarDatosContacto,
  solicitarOtpReenvio,
  consultarPorDocumento,
  buscarPorDocumento,
  actualizarBeneficiariosConsulta,
  getTrazabilidad,
  getVeoliaUnidades,
  getMisDelDia,
  legalizarAfiliaciones,
  liquidacionPdf,
  planoExcel,
  carnet
};

/**
 * GET /api/afiliados/:id/plano-excel
 * Genera y descarga el plano de póliza en formato Excel (.xlsx).
 * Permiso: afiliaciones.aprobar
 */
async function planoExcel(req, res, next) {
  try {
    const { id } = req.params;
    const fileName = `plano-afiliado-${id}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await excelService.generarPlanoExcel(Number(id), res);
    res.end();
  } catch (err) { next(err); }
}

/**
 * GET /api/afiliados/:id/carnet
 * Genera y devuelve el PNG del carné digital del afiliado. Útil para validar
 * el diseño sin re-aprobar. El mismo carné se envía automáticamente en la
 * aprobación (WhatsApp + n8n correo/Drive).
 */
async function carnet(req, res, next) {
  try {
    const afiliado = await Afiliado.findByPk(Number(req.params.id));
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
    const base   = await obtenerCarnetBase();
    const carnetInfo = await pdfService.generarCarnetImagen(afiliado.toJSON(), base);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="carnet-${afiliado.numeroDocumento}.png"`);
    require('fs').createReadStream(carnetInfo.filePath).pipe(res);
  } catch (err) { next(err); }
}
