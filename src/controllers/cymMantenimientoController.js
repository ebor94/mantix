const path = require('path');
const { Op } = require('sequelize');
const {
  CymMantenimiento, CymPredio, CymContrato, CymAsignacion,
  CymActividad, CymChecklist, CymEvidencia, Usuario, AuditLog
} = require('../models');
const AppError = require('../utils/AppError');

// Contratos vigentes: activo o vencido dentro de los 60 días de gracia
function whereContratoVigente() {
  const limite = new Date();
  limite.setDate(limite.getDate() - 60);
  return {
    [Op.or]: [
      { estado: 'activo' },
      { estado: 'vencido', fecha_vencimiento: { [Op.gte]: limite } }
    ]
  };
}

const cymMantenimientoController = {
  // Vista del supervisor: predios asignados con contrato vigente
  async getAsignados(req, res, next) {
    try {
      const supervisorId = req.usuario.id;

      const asignaciones = await CymAsignacion.findAll({
        where: { supervisor_id: supervisorId, activo: true },
        include: [
          { model: Usuario, as: 'operario',  attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'operario2', attributes: ['id','nombre','apellido'] },
          {
            model: CymPredio,
            as: 'predio',
            where: { activo_mant: true },
            include: [{
              model: CymContrato,
              as: 'contratos',
              where: whereContratoVigente(),
              required: true,
              order: [['fecha_contratacion', 'DESC']],
              limit: 1
            }]
          }
        ]
      });

      res.json({ success: true, data: asignaciones });
    } catch (err) {
      next(err);
    }
  },

  async crear(req, res, next) {
    try {
      const { predio_id, contrato_id, operario_id, operario2_id, fecha_mant, observaciones } = req.body;
      const supervisor_id = req.usuario.id;

      // Validar que el contrato esté vigente
      const contrato = await CymContrato.findOne({
        where: { id: contrato_id, predio_id, ...whereContratoVigente() }
      });
      if (!contrato) throw new AppError('El contrato no está vigente o no corresponde al predio', 400);

      const mantenimiento = await CymMantenimiento.create({
        predio_id, contrato_id, supervisor_id, operario_id, operario2_id,
        fecha_mant, observaciones, estado: 'borrador'
      });

      // Crear items de checklist automáticamente
      const actividades = await CymActividad.findAll({ where: { activo: true }, order: [['orden','ASC']] });
      const items = actividades.map(a => ({
        mantenimiento_id: mantenimiento.id,
        actividad_id: a.id,
        realizado: false
      }));
      await CymChecklist.bulkCreate(items);

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'CREATE',
        tabla: 'cym_mantenimientos',
        registro_id: mantenimiento.id,
        datos_nuevos: JSON.stringify({ predio_id, contrato_id, fecha_mant }),
        ip_address: req.ip
      });

      const resultado = await CymMantenimiento.findByPk(mantenimiento.id, {
        include: [
          { model: CymChecklist, as: 'checklist', include: [{ model: CymActividad, as: 'actividad' }] }
        ]
      });

      res.status(201).json({ success: true, data: resultado, message: 'Registro de mantenimiento creado' });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const mant = await CymMantenimiento.findByPk(req.params.id, {
        include: [
          { model: CymPredio,   as: 'predio' },
          { model: CymContrato, as: 'contrato' },
          { model: Usuario, as: 'supervisor', attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'operario',   attributes: ['id','nombre','apellido'] },
          {
            model: CymChecklist,
            as: 'checklist',
            include: [{ model: CymActividad, as: 'actividad', order: [['orden','ASC']] }]
          },
          { model: CymEvidencia, as: 'evidencias' }
        ]
      });
      if (!mant) throw new AppError('Mantenimiento no encontrado', 404);
      res.json({ success: true, data: mant });
    } catch (err) {
      next(err);
    }
  },

  async completarChecklist(req, res, next) {
    try {
      const { id } = req.params;
      const { items } = req.body; // [{ id, realizado, observacion }]

      const mant = await CymMantenimiento.findByPk(id);
      if (!mant) throw new AppError('Mantenimiento no encontrado', 404);
      if (mant.estado === 'completado') throw new AppError('El mantenimiento ya está completado', 400);

      for (const item of items) {
        await CymChecklist.update(
          { realizado: item.realizado, observacion: item.observacion },
          { where: { id: item.id, mantenimiento_id: id } }
        );
      }

      res.json({ success: true, message: 'Checklist actualizado' });
    } catch (err) {
      next(err);
    }
  },

  async completar(req, res, next) {
    try {
      const mant = await CymMantenimiento.findByPk(req.params.id);
      if (!mant) throw new AppError('Mantenimiento no encontrado', 404);
      if (mant.estado === 'completado') throw new AppError('El mantenimiento ya está completado', 400);

      const { observaciones, ejecutado_por } = req.body;

      const EJECUTADO_VALIDOS = ['pareja', 'operario1', 'operario2'];
      if (ejecutado_por && !EJECUTADO_VALIDOS.includes(ejecutado_por)) {
        throw new AppError('Valor de ejecutado_por inválido', 400);
      }

      await mant.update({
        estado: 'completado',
        observaciones: observaciones || mant.observaciones,
        ejecutado_por: ejecutado_por || null
      });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'UPDATE',
        tabla: 'cym_mantenimientos',
        registro_id: mant.id,
        datos_nuevos: JSON.stringify({ estado: 'completado' }),
        ip_address: req.ip
      });

      res.json({ success: true, message: 'Mantenimiento completado correctamente' });
    } catch (err) {
      next(err);
    }
  },

  async subirEvidencias(req, res, next) {
    try {
      const { id } = req.params;
      const mant = await CymMantenimiento.findByPk(id);
      if (!mant) throw new AppError('Mantenimiento no encontrado', 404);

      if (!req.files || req.files.length === 0) throw new AppError('No se enviaron archivos', 400);

      const evidencias = req.files.map(f => ({
        mantenimiento_id: id,
        archivo_url: `cym/${f.filename}`,
        descripcion: req.body.descripcion || null
      }));

      const creadas = await CymEvidencia.bulkCreate(evidencias);
      res.status(201).json({ success: true, data: creadas, message: 'Evidencias subidas correctamente' });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = cymMantenimientoController;
