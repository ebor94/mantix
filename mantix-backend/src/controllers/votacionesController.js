// ============================================
// src/controllers/votacionesController.js
// Sistema de Votaciones en Línea - Serfunorte
// ============================================
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const {
  VotacionEvento,
  VotacionVotante,
  VotacionCandidato,
  VotacionVoto,
  Sede,
  sequelize,
} = require('../models');
const { sendOTP } = require('../services/whatsappService');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Genera un token OTP de 5 dígitos */
function generarOTP() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/** Retorna la IP real del cliente */
function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    req.ip
  );
}

/** JWT temporal para proceso de votación (30 min) */
function generarTokenVotacion(payload) {
  const secret = process.env.VOTACION_JWT_SECRET || process.env.JWT_SECRET;
  return jwt.sign(payload, secret, { expiresIn: '30m' });
}

// ─────────────────────────────────────────────
// FLUJO DEL VOTANTE
// ─────────────────────────────────────────────

/**
 * POST /api/votaciones/iniciar
 * Verifica la cédula, genera OTP y lo envía por WhatsApp.
 */
const iniciarSesion = async (req, res, next) => {
  try {
    const { cedula, evento_id } = req.body;

    if (!cedula || !evento_id) {
      return res.status(400).json({
        success: false,
        message: 'Cédula y evento son requeridos',
      });
    }

    // Verificar que el evento existe y está activo
    const evento = await VotacionEvento.findOne({
      where: {
        id: evento_id,
        activo: 1,
        fecha_inicio: { [Op.lte]: new Date() },
        fecha_fin: { [Op.gte]: new Date() },
      },
    });

    if (!evento) {
      return res.status(404).json({
        success: false,
        message: 'El evento de votación no está activo en este momento',
      });
    }

    // Buscar votante habilitado
    const votante = await VotacionVotante.findOne({
      where: { cedula: cedula.trim(), evento_id },
      include: [{ model: Sede, as: 'sede', attributes: ['id', 'nombre', 'codigo'] }],
    });

    if (!votante) {
      return res.status(404).json({
        success: false,
        message: 'No encontramos tu cédula en el padrón electoral. Verifica el número e inténtalo de nuevo.',
      });
    }

    if (votante.ya_voto) {
      return res.status(409).json({
        success: false,
        message: 'Ya realizaste tu voto en este proceso electoral.',
        ya_voto: true,
      });
    }

    // Generar OTP
    const otp = generarOTP();
    const expira = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // UPDATE directo por id para evitar conflictos de Sequelize con include/timestamps
    const [filasActualizadas] = await VotacionVotante.update(
      { token_otp: otp, token_expira: expira },
      { where: { id: votante.id } }
    );

    logger.info(`[Votaciones] OTP generado para votante ${votante.id} (${votante.cedula}) — filas actualizadas: ${filasActualizadas}`);

    if (filasActualizadas === 0) {
      logger.error(`[Votaciones] FALLO al guardar OTP para votante ${votante.id}`);
      return res.status(500).json({
        success: false,
        message: 'Error interno al generar el código. Intenta de nuevo.',
      });
    }

    // Enviar OTP por WhatsApp
    try {
      await sendOTP(votante.telefono, otp, evento.nombre);
      logger.info(`[Votaciones] WhatsApp enviado a ${votante.telefono}`);
    } catch (err) {
      logger.error(`[Votaciones] Error enviando OTP a ${votante.telefono}: ${err.message}`);
      // No bloqueamos el flujo — el OTP ya está guardado en BD
    }

    const respuesta = {
      success: true,
      message: `Código de verificación enviado al número registrado (${enmascararTelefono(votante.telefono)})`,
      votante_nombre: votante.nombre,
      sede: votante.sede?.nombre,
    };

    // En desarrollo, incluir el OTP para facilitar pruebas
    if (process.env.NODE_ENV !== 'production') {
      respuesta.otp_dev = otp;
    }

    return res.json(respuesta);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/votaciones/verificar-token
 * Valida el OTP y retorna un JWT temporal de votación.
 */
const verificarToken = async (req, res, next) => {
  try {
    const { cedula, evento_id, otp } = req.body;

    if (!cedula || !evento_id || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Cédula, evento y código son requeridos',
      });
    }

    const votante = await VotacionVotante.findOne({
      where: { cedula: cedula.trim(), evento_id },
      include: [{ model: Sede, as: 'sede', attributes: ['id', 'nombre', 'codigo'] }],
    });

    if (!votante) {
      return res.status(404).json({
        success: false,
        message: 'Votante no encontrado',
      });
    }

    if (votante.ya_voto) {
      return res.status(409).json({
        success: false,
        message: 'Ya realizaste tu voto en este proceso electoral.',
        ya_voto: true,
      });
    }

    if (!votante.token_otp || votante.token_otp !== otp.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Código de verificación incorrecto',
      });
    }

    if (!votante.token_expira || new Date() > new Date(votante.token_expira)) {
      return res.status(400).json({
        success: false,
        message: 'El código ha expirado. Solicita uno nuevo.',
      });
    }

    // Limpiar OTP (ya fue usado) — UPDATE directo por id
    await VotacionVotante.update(
      { token_otp: null, token_expira: null },
      { where: { id: votante.id } }
    );

    // Emitir JWT de votación
    const token = generarTokenVotacion({
      votante_id: votante.id,
      evento_id: votante.evento_id,
      sede_id: votante.sede_id,
      cedula: votante.cedula,
      tipo: 'votacion',
    });

    return res.json({
      success: true,
      message: 'Verificación exitosa',
      token,
      votante: {
        nombre: votante.nombre,
        sede: votante.sede?.nombre,
        sede_id: votante.sede_id,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/votaciones/candidatos
 * Lista candidatos de la sede del votante autenticado.
 * Requiere JWT de votación en header Authorization.
 */
const getCandidatosVotante = async (req, res, next) => {
  try {
    const { votante_id, evento_id, sede_id } = req.votacion;

    const candidatos = await VotacionCandidato.findAll({
      where: { evento_id, sede_id, activo: 1 },
      include: [{ model: Sede, as: 'sede', attributes: ['id', 'nombre'] }],
      attributes: ['id', 'nombre', 'cedula', 'foto', 'sede_id'],
      order: [['nombre', 'ASC']],
    });

    return res.json({
      success: true,
      data: candidatos,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/votaciones/votar
 * Emite el voto. Idempotente: si ya votó, rechaza.
 * Requiere JWT de votación.
 */
const emitirVoto = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { votante_id, evento_id, sede_id } = req.votacion;
    const { candidato_id } = req.body;

    if (!candidato_id) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar un candidato',
      });
    }

    // Re-verificar que no ha votado (doble check)
    const votante = await VotacionVotante.findByPk(votante_id, { transaction: t });
    if (!votante || votante.ya_voto) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: 'Ya realizaste tu voto en este proceso electoral.',
        ya_voto: true,
      });
    }

    // Verificar que el candidato pertenece a la misma sede del votante
    const candidato = await VotacionCandidato.findOne({
      where: { id: candidato_id, evento_id, sede_id, activo: 1 },
      transaction: t,
    });

    if (!candidato) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Candidato no válido para tu sede',
      });
    }

    const ip = getIp(req);

    // Insertar voto
    await VotacionVoto.create(
      { evento_id, votante_id, candidato_id, sede_id, ip_address: ip },
      { transaction: t }
    );

    // Marcar votante como ya_voto
    await votante.update(
      { ya_voto: 1, fecha_voto: new Date(), ip_voto: ip },
      { transaction: t }
    );

    await t.commit();

    logger.info(`[Votaciones] Voto registrado: votante=${votante_id} candidato=${candidato_id} sede=${sede_id}`);

    return res.json({
      success: true,
      message: '¡Tu voto ha sido registrado exitosamente!',
    });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

// ─────────────────────────────────────────────
// PÚBLICO — Eventos activos (sin autenticación, para LoginView del votante)
// ─────────────────────────────────────────────

const getEventosActivos = async (req, res, next) => {
  try {
    const eventos = await VotacionEvento.findAll({
      where: {
        activo: 1,
        fecha_inicio: { [Op.lte]: new Date() },
        fecha_fin:    { [Op.gte]: new Date() },
      },
      attributes: ['id', 'nombre', 'descripcion', 'fecha_inicio', 'fecha_fin'],
      order: [['fecha_inicio', 'DESC']],
    });
    res.json({ success: true, data: eventos });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// ADMIN — EVENTOS
// ─────────────────────────────────────────────

const getEventos = async (req, res, next) => {
  try {
    const eventos = await VotacionEvento.findAll({ order: [['created_at', 'DESC']] });
    res.json({ success: true, data: eventos });
  } catch (error) {
    next(error);
  }
};

const getEventoById = async (req, res, next) => {
  try {
    const evento = await VotacionEvento.findByPk(req.params.id);
    if (!evento) return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    res.json({ success: true, data: evento });
  } catch (error) {
    next(error);
  }
};

const crearEvento = async (req, res, next) => {
  try {
    const { nombre, descripcion, fecha_inicio, fecha_fin } = req.body;
    const evento = await VotacionEvento.create({ nombre, descripcion, fecha_inicio, fecha_fin });
    res.status(201).json({ success: true, data: evento, message: 'Evento creado exitosamente' });
  } catch (error) {
    next(error);
  }
};

const actualizarEvento = async (req, res, next) => {
  try {
    const evento = await VotacionEvento.findByPk(req.params.id);
    if (!evento) return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    await evento.update(req.body);
    res.json({ success: true, data: evento, message: 'Evento actualizado' });
  } catch (error) {
    next(error);
  }
};

const eliminarEvento = async (req, res, next) => {
  try {
    const evento = await VotacionEvento.findByPk(req.params.id);
    if (!evento) return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    await evento.destroy();
    res.json({ success: true, message: 'Evento eliminado' });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// ADMIN — VOTANTES
// ─────────────────────────────────────────────

const getVotantes = async (req, res, next) => {
  try {
    const { evento_id, sede_id, ya_voto } = req.query;
    const where = {};
    if (evento_id) where.evento_id = evento_id;
    if (sede_id) where.sede_id = sede_id;
    if (ya_voto !== undefined) where.ya_voto = ya_voto;

    const votantes = await VotacionVotante.findAll({
      where,
      include: [
        { model: Sede, as: 'sede', attributes: ['id', 'nombre'] },
        { model: VotacionEvento, as: 'evento', attributes: ['id', 'nombre'] },
      ],
      order: [['nombre', 'ASC']],
    });
    res.json({ success: true, data: votantes });
  } catch (error) {
    next(error);
  }
};

const crearVotante = async (req, res, next) => {
  try {
    const { evento_id, cedula, nombre, telefono, sede_id } = req.body;
    const votante = await VotacionVotante.create({ evento_id, cedula, nombre, telefono, sede_id });
    res.status(201).json({ success: true, data: votante, message: 'Votante registrado' });
  } catch (error) {
    next(error);
  }
};

const actualizarVotante = async (req, res, next) => {
  try {
    const votante = await VotacionVotante.findByPk(req.params.id);
    if (!votante) return res.status(404).json({ success: false, message: 'Votante no encontrado' });
    await votante.update(req.body);
    res.json({ success: true, data: votante, message: 'Votante actualizado' });
  } catch (error) {
    next(error);
  }
};

const eliminarVotante = async (req, res, next) => {
  try {
    const votante = await VotacionVotante.findByPk(req.params.id);
    if (!votante) return res.status(404).json({ success: false, message: 'Votante no encontrado' });
    await votante.destroy();
    res.json({ success: true, message: 'Votante eliminado' });
  } catch (error) {
    next(error);
  }
};

/** Carga masiva de votantes desde array JSON */
const importarVotantes = async (req, res, next) => {
  try {
    const { evento_id, votantes } = req.body;
    if (!Array.isArray(votantes) || votantes.length === 0) {
      return res.status(400).json({ success: false, message: 'Se requiere un array de votantes' });
    }

    const registros = votantes.map(v => ({ ...v, evento_id }));
    const resultado = await VotacionVotante.bulkCreate(registros, {
      ignoreDuplicates: true,
    });

    res.status(201).json({
      success: true,
      message: `${resultado.length} votantes importados`,
      data: { importados: resultado.length, total: votantes.length },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// ADMIN — CANDIDATOS
// ─────────────────────────────────────────────

const getCandidatosAdmin = async (req, res, next) => {
  try {
    const { evento_id, sede_id } = req.query;
    const where = {};
    if (evento_id) where.evento_id = evento_id;
    if (sede_id) where.sede_id = sede_id;

    const candidatos = await VotacionCandidato.findAll({
      where,
      include: [
        { model: Sede, as: 'sede', attributes: ['id', 'nombre'] },
        { model: VotacionEvento, as: 'evento', attributes: ['id', 'nombre'] },
      ],
      order: [['nombre', 'ASC']],
    });
    res.json({ success: true, data: candidatos });
  } catch (error) {
    next(error);
  }
};

const crearCandidato = async (req, res, next) => {
  try {
    const { evento_id, nombre, cedula, sede_id } = req.body;
    const foto = req.file ? `/uploads/votaciones/${req.file.filename}` : null;
    const candidato = await VotacionCandidato.create({ evento_id, nombre, cedula, sede_id, foto });
    res.status(201).json({ success: true, data: candidato, message: 'Candidato registrado' });
  } catch (error) {
    next(error);
  }
};

const actualizarCandidato = async (req, res, next) => {
  try {
    const candidato = await VotacionCandidato.findByPk(req.params.id);
    if (!candidato) return res.status(404).json({ success: false, message: 'Candidato no encontrado' });

    const updateData = { ...req.body };
    if (req.file) {
      updateData.foto = `/uploads/votaciones/${req.file.filename}`;
    }
    await candidato.update(updateData);
    res.json({ success: true, data: candidato, message: 'Candidato actualizado' });
  } catch (error) {
    next(error);
  }
};

const eliminarCandidato = async (req, res, next) => {
  try {
    const candidato = await VotacionCandidato.findByPk(req.params.id);
    if (!candidato) return res.status(404).json({ success: false, message: 'Candidato no encontrado' });
    await candidato.destroy();
    res.json({ success: true, message: 'Candidato eliminado' });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// ADMIN — RESULTADOS Y ESTADÍSTICAS
// ─────────────────────────────────────────────

const getResultadosPorSede = async (req, res, next) => {
  try {
    const { evento_id } = req.params;

    // Votos agrupados por sede y candidato
    const votos = await VotacionVoto.findAll({
      where: { evento_id },
      include: [
        {
          model: VotacionCandidato,
          as: 'candidato',
          attributes: ['id', 'nombre', 'cedula', 'foto'],
          include: [{ model: Sede, as: 'sede', attributes: ['id', 'nombre'] }],
        },
        { model: Sede, as: 'sede', attributes: ['id', 'nombre'] },
      ],
      attributes: ['id', 'sede_id', 'candidato_id', 'fecha_voto'],
    });

    // Agrupar por sede
    const porSede = {};
    votos.forEach(voto => {
      const sedeId = voto.sede_id;
      const sedeNombre = voto.sede?.nombre || 'Sin sede';
      if (!porSede[sedeId]) {
        porSede[sedeId] = { sede_id: sedeId, sede_nombre: sedeNombre, candidatos: {} };
      }
      const candidatoId = voto.candidato_id;
      if (!porSede[sedeId].candidatos[candidatoId]) {
        porSede[sedeId].candidatos[candidatoId] = {
          candidato_id: candidatoId,
          nombre: voto.candidato?.nombre,
          cedula: voto.candidato?.cedula,
          foto: voto.candidato?.foto,
          votos: 0,
        };
      }
      porSede[sedeId].candidatos[candidatoId].votos++;
    });

    // Convertir a array con candidatos como array
    const resultado = Object.values(porSede).map(s => ({
      ...s,
      candidatos: Object.values(s.candidatos).sort((a, b) => b.votos - a.votos),
      total_votos: Object.values(s.candidatos).reduce((sum, c) => sum + c.votos, 0),
    }));

    res.json({ success: true, data: resultado, total_votos: votos.length });
  } catch (error) {
    next(error);
  }
};

const getEstadisticas = async (req, res, next) => {
  try {
    const { evento_id } = req.params;

    const [totalVotantes, votaron, sedes] = await Promise.all([
      VotacionVotante.count({ where: { evento_id } }),
      VotacionVotante.count({ where: { evento_id, ya_voto: 1 } }),
      Sede.findAll({
        include: [
          {
            model: VotacionVotante,
            as: 'votacion_votantes',
            where: { evento_id },
            required: false,
            attributes: ['id', 'ya_voto'],
          },
        ],
        order: [['nombre', 'ASC']],
      }),
    ]);

    const estadisticasPorSede = sedes
      .filter(s => s.votacion_votantes?.length > 0)
      .map(s => {
        const total = s.votacion_votantes.length;
        const votaronEnSede = s.votacion_votantes.filter(v => v.ya_voto).length;
        return {
          sede_id: s.id,
          sede_nombre: s.nombre,
          total_habilitados: total,
          votaron: votaronEnSede,
          pendientes: total - votaronEnSede,
          porcentaje: total > 0 ? Math.round((votaronEnSede / total) * 100) : 0,
        };
      });

    res.json({
      success: true,
      data: {
        total_habilitados: totalVotantes,
        votaron,
        pendientes: totalVotantes - votaron,
        porcentaje_participacion: totalVotantes > 0 ? Math.round((votaron / totalVotantes) * 100) : 0,
        por_sede: estadisticasPorSede,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────

function enmascararTelefono(tel) {
  if (!tel) return '***';
  const s = tel.replace(/\D/g, '');
  if (s.length <= 4) return '****';
  return s.slice(0, 2) + '*'.repeat(s.length - 4) + s.slice(-2);
}

module.exports = {
  // Público
  getEventosActivos,
  // Flujo votante
  iniciarSesion,
  verificarToken,
  getCandidatosVotante,
  emitirVoto,
  // Admin - eventos
  getEventos,
  getEventoById,
  crearEvento,
  actualizarEvento,
  eliminarEvento,
  // Admin - votantes
  getVotantes,
  crearVotante,
  actualizarVotante,
  eliminarVotante,
  importarVotantes,
  // Admin - candidatos
  getCandidatosAdmin,
  crearCandidato,
  actualizarCandidato,
  eliminarCandidato,
  // Admin - resultados
  getResultadosPorSede,
  getEstadisticas,
};
