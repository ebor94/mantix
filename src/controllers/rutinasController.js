// =============================================================
// src/controllers/rutinasController.js
// =============================================================
const { Op } = require('sequelize');
const {
  MantenimientoProgramado,
  MantenimientoPreEjecucion,
  MantenimientoEjecutado,
  PlanActividad,
  CategoriaMantenimiento,
  Sede,
  Equipo,
  Usuario,
  Proveedor,
  Estado,
  sequelize
} = require('../models');
const rutinas = require('../services/rutinasService');
const driveEvidencias = require('../services/driveEvidenciasService');

const includeProgramado = () => ([{
  model: PlanActividad,
  as: 'actividad',
  required: false,
  include: [
    { model: Sede, as: 'sede', required: false },
    { model: CategoriaMantenimiento, as: 'categoria', required: false },
    { model: Equipo, as: 'equipo', required: false },
    { model: Proveedor, as: 'responsable_proveedor', required: false },
    { model: Usuario, as: 'responsable_usuario', required: false }
  ]
}]);

function resumenProgramado(mnt) {
  const act = mnt.actividad || {};
  return {
    id: mnt.id,
    codigo: mnt.codigo,
    fecha_programada: mnt.fecha_programada,
    hora_programada: mnt.hora_programada,
    nombre_actividad: act.nombre || '',
    categoria: act.categoria?.nombre || '',
    sede: act.sede ? { codigo: act.sede.codigo, nombre: act.sede.nombre } : null,
    equipo: act.equipo ? {
      codigo: act.equipo.codigo,
      nombre: act.equipo.nombre,
      ubicacion: act.equipo.ubicacion_especifica || '',
      marca: act.equipo.marca || '',
      modelo: act.equipo.modelo || ''
    } : null,
    proveedor: act.responsable_proveedor?.nombre
      || (act.responsable_usuario ? [act.responsable_usuario.nombre, act.responsable_usuario.apellido].filter(Boolean).join(' ') : ''),
    exigencias: mnt.exigencias
  };
}

const rutinasController = {
  // ============================================
  // PÚBLICO (sin auth): consultar info por token
  // ============================================
  async getRutinaPublica(req, res, next) {
    try {
      const { token } = req.params;
      if (!token || !/^[a-f0-9]{32,64}$/i.test(token)) {
        return res.status(400).json({ success: false, message: 'Token inválido' });
      }

      const mnt = await MantenimientoProgramado.findOne({
        where: { token_qr: token },
        include: includeProgramado()
      });
      if (!mnt) {
        return res.status(404).json({ success: false, message: 'Rutina no encontrada' });
      }

      // ¿expirado?
      if (!rutinas.tokenVigente(mnt.fecha_programada)) {
        return res.status(410).json({
          success: false,
          message: 'Este QR está vencido. Solicitá al coordinador una nueva rutina.'
        });
      }

      // ¿ya tiene pre-ejecución pendiente/aprobada?
      const ya = await MantenimientoPreEjecucion.findOne({
        where: {
          mantenimiento_programado_id: mnt.id,
          estado: { [Op.in]: ['pendiente', 'aprobada'] }
        },
        attributes: ['id', 'estado', 'created_at']
      });

      return res.json({
        success: true,
        data: {
          mantenimiento: resumenProgramado(mnt),
          ya_registrada: !!ya,
          estado_pre_ejecucion: ya ? ya.estado : null
        }
      });
    } catch (error) {
      console.error('Error getRutinaPublica:', error);
      next(error);
    }
  },

  // ============================================
  // PÚBLICO (sin auth): registrar pre-ejecución
  // ============================================
  async registrarPreEjecucion(req, res, next) {
    try {
      const { token } = req.params;
      if (!token || !/^[a-f0-9]{32,64}$/i.test(token)) {
        return res.status(400).json({ success: false, message: 'Token inválido' });
      }

      const {
        hora_inicio, hora_fin,
        nombre_recibe, cedula_recibe,
        trabajo_realizado, observaciones, firma_tecnico
      } = req.body || {};

      if (!nombre_recibe || !trabajo_realizado) {
        return res.status(400).json({
          success: false,
          message: 'Faltan campos obligatorios: nombre_recibe y trabajo_realizado'
        });
      }
      if (String(trabajo_realizado).length > 5000) {
        return res.status(400).json({ success: false, message: 'trabajo_realizado supera 5000 caracteres' });
      }

      const mnt = await MantenimientoProgramado.findOne({ where: { token_qr: token } });
      if (!mnt) return res.status(404).json({ success: false, message: 'Rutina no encontrada' });

      if (!rutinas.tokenVigente(mnt.fecha_programada)) {
        return res.status(410).json({ success: false, message: 'Este QR está vencido' });
      }

      const yaPendOAprob = await MantenimientoPreEjecucion.findOne({
        where: {
          mantenimiento_programado_id: mnt.id,
          estado: { [Op.in]: ['pendiente', 'aprobada'] }
        }
      });
      if (yaPendOAprob) {
        return res.status(409).json({
          success: false,
          message: 'Este mantenimiento ya tiene una pre-ejecución registrada. Contactá al coordinador.'
        });
      }

      const creada = await MantenimientoPreEjecucion.create({
        mantenimiento_programado_id: mnt.id,
        token_usado: token,
        fecha_ejecucion: new Date().toISOString().slice(0, 10),
        hora_inicio: hora_inicio || null,
        hora_fin: hora_fin || null,
        nombre_recibe: String(nombre_recibe).slice(0, 150),
        cedula_recibe: cedula_recibe ? String(cedula_recibe).slice(0, 30) : null,
        trabajo_realizado: String(trabajo_realizado).slice(0, 5000),
        observaciones: observaciones ? String(observaciones).slice(0, 2000) : null,
        firma_tecnico: firma_tecnico ? String(firma_tecnico).slice(0, 200) : null,
        estado: 'pendiente',
        ip_origen: (req.headers['x-forwarded-for'] || req.ip || '').toString().slice(0, 45),
        user_agent: (req.headers['user-agent'] || '').toString().slice(0, 500)
      });

      return res.json({
        success: true,
        message: 'Pre-ejecución registrada. El coordinador la revisará y aprobará.',
        data: { id: creada.id, estado: creada.estado }
      });
    } catch (error) {
      console.error('Error registrarPreEjecucion:', error);
      next(error);
    }
  },

  // ============================================
  // INTERNO: listar MNT programados y pre-ejecuciones para coordinador
  // ============================================
  async listarRutinas(req, res, next) {
    try {
      const { desde, hasta, estado } = req.query;
      const whereProg = {};
      if (desde || hasta) {
        whereProg.fecha_programada = {};
        if (desde) whereProg.fecha_programada[Op.gte] = desde;
        if (hasta) whereProg.fecha_programada[Op.lte] = hasta;
      }

      // Pre-ejecuciones (con el MNT asociado)
      const wherePreejec = {};
      if (estado) wherePreejec.estado = estado;

      const preEjecuciones = await MantenimientoPreEjecucion.findAll({
        where: wherePreejec,
        include: [
          {
            model: MantenimientoProgramado,
            as: 'mantenimiento_programado',
            where: Object.keys(whereProg).length ? whereProg : undefined,
            include: includeProgramado()[0].include ? [includeProgramado()[0]] : []
          },
          { model: Usuario, as: 'aprobador', attributes: ['id', 'nombre', 'apellido'], required: false }
        ],
        order: [['created_at', 'DESC']]
      });

      return res.json({
        success: true,
        data: preEjecuciones.map(p => ({
          id: p.id,
          estado: p.estado,
          fecha_ejecucion: p.fecha_ejecucion,
          hora_inicio: p.hora_inicio,
          hora_fin: p.hora_fin,
          nombre_recibe: p.nombre_recibe,
          cedula_recibe: p.cedula_recibe,
          trabajo_realizado: p.trabajo_realizado,
          observaciones: p.observaciones,
          firma_tecnico: p.firma_tecnico,
          motivo_rechazo: p.motivo_rechazo,
          created_at: p.created_at,
          aprobador: p.aprobador ? [p.aprobador.nombre, p.aprobador.apellido].filter(Boolean).join(' ') : null,
          aprobada_en: p.aprobada_en,
          mantenimiento_ejecutado_id: p.mantenimiento_ejecutado_id,
          mantenimiento: p.mantenimiento_programado ? resumenProgramado(p.mantenimiento_programado) : null
        }))
      });
    } catch (error) {
      console.error('Error listarRutinas:', error);
      next(error);
    }
  },

  // MNT programados sin pre-ejecución registrada (listos para imprimir QR)
  async listarPendientesDePreEjecucion(req, res, next) {
    try {
      const { desde, hasta } = req.query;
      const where = {};
      if (desde || hasta) {
        where.fecha_programada = {};
        if (desde) where.fecha_programada[Op.gte] = desde;
        if (hasta) where.fecha_programada[Op.lte] = hasta;
      }

      // IDs de programados que YA tienen pre-ejecución pendiente/aprobada
      const yaConPreejec = await MantenimientoPreEjecucion.findAll({
        where: { estado: { [Op.in]: ['pendiente', 'aprobada'] } },
        attributes: ['mantenimiento_programado_id']
      });
      const excluirIds = yaConPreejec.map(x => x.mantenimiento_programado_id);
      if (excluirIds.length) where.id = { [Op.notIn]: excluirIds };

      const list = await MantenimientoProgramado.findAll({
        where,
        include: includeProgramado(),
        order: [['fecha_programada', 'ASC']]
      });

      return res.json({
        success: true,
        data: list.map(m => ({
          ...resumenProgramado(m),
          token_qr: m.token_qr,
          url_publica: m.token_qr ? rutinas.urlPublicaRutina(null, m.token_qr) : null
        }))
      });
    } catch (error) {
      console.error('Error listarPendientesDePreEjecucion:', error);
      next(error);
    }
  },

  // Generar/obtener el token QR de un MNT programado (lazy)
  async generarTokenQR(req, res, next) {
    try {
      const { id } = req.params;
      const mnt = await MantenimientoProgramado.findByPk(id);
      if (!mnt) return res.status(404).json({ success: false, message: 'MNT no encontrado' });
      const token = await rutinas.obtenerOGenerarToken(mnt);
      return res.json({
        success: true,
        data: { token, url_publica: rutinas.urlPublicaRutina(null, token) }
      });
    } catch (error) {
      console.error('Error generarTokenQR:', error);
      next(error);
    }
  },

  // Generar tokens para varios MNT a la vez (para imprimir reporte)
  async generarTokensLote(req, res, next) {
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: 'ids vacío' });
      }
      if (ids.length > 200) {
        return res.status(400).json({ success: false, message: 'Máximo 200 ids por lote' });
      }
      const resultados = [];
      for (const id of ids) {
        const mnt = await MantenimientoProgramado.findByPk(id);
        if (!mnt) { resultados.push({ id, error: 'no encontrado' }); continue; }
        const token = await rutinas.obtenerOGenerarToken(mnt);
        resultados.push({ id, token, url_publica: rutinas.urlPublicaRutina(null, token) });
      }
      return res.json({ success: true, data: resultados });
    } catch (error) {
      console.error('Error generarTokensLote:', error);
      next(error);
    }
  },

  // Aprobar una pre-ejecución → crea MantenimientoEjecutado y dispara Drive
  async aprobarPreEjecucion(req, res, next) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const preejec = await MantenimientoPreEjecucion.findByPk(id, {
        include: [{ model: MantenimientoProgramado, as: 'mantenimiento_programado' }],
        transaction: t
      });
      if (!preejec) {
        await t.rollback();
        return res.status(404).json({ success: false, message: 'Pre-ejecución no encontrada' });
      }
      if (preejec.estado !== 'pendiente') {
        await t.rollback();
        return res.status(409).json({
          success: false,
          message: `La pre-ejecución está en estado "${preejec.estado}", no se puede aprobar`
        });
      }

      // Cambiar estado del MantenimientoProgramado a "ejecutado"
      const estadoEjecutado = await Estado.findOne({ where: { nombre: 'ejecutado' } });

      // Crear la ejecución oficial copiando los datos
      const ejecutado = await MantenimientoEjecutado.create({
        mantenimiento_programado_id: preejec.mantenimiento_programado_id,
        fecha_ejecucion: preejec.fecha_ejecucion,
        hora_inicio: preejec.hora_inicio,
        hora_fin: preejec.hora_fin,
        nombre_recibe: preejec.nombre_recibe,
        trabajo_realizado: preejec.trabajo_realizado,
        observaciones: preejec.observaciones,
        usuario_ejecutor_id: req.usuario?.id || null
      }, { transaction: t });

      if (estadoEjecutado) {
        await preejec.mantenimiento_programado.update(
          { estado_id: estadoEjecutado.id },
          { transaction: t }
        );
      }

      await preejec.update({
        estado: 'aprobada',
        aprobada_por_usuario_id: req.usuario?.id || null,
        aprobada_en: new Date(),
        mantenimiento_ejecutado_id: ejecutado.id
      }, { transaction: t });

      await t.commit();

      return res.json({
        success: true,
        message: 'Pre-ejecución aprobada y mantenimiento marcado como ejecutado',
        data: { id: preejec.id, mantenimiento_ejecutado_id: ejecutado.id }
      });
    } catch (error) {
      try { await t.rollback(); } catch (_) {}
      console.error('Error aprobarPreEjecucion:', error);
      next(error);
    }
  },

  async rechazarPreEjecucion(req, res, next) {
    try {
      const { id } = req.params;
      const { motivo_rechazo } = req.body || {};
      const preejec = await MantenimientoPreEjecucion.findByPk(id);
      if (!preejec) return res.status(404).json({ success: false, message: 'Pre-ejecución no encontrada' });
      if (preejec.estado !== 'pendiente') {
        return res.status(409).json({
          success: false,
          message: `La pre-ejecución está en estado "${preejec.estado}"`
        });
      }
      await preejec.update({
        estado: 'rechazada',
        motivo_rechazo: motivo_rechazo || null,
        aprobada_por_usuario_id: req.usuario?.id || null,
        aprobada_en: new Date()
      });
      return res.json({ success: true, message: 'Pre-ejecución rechazada' });
    } catch (error) {
      console.error('Error rechazarPreEjecucion:', error);
      next(error);
    }
  }
};

module.exports = rutinasController;
