const { Op } = require('sequelize');
const { CymContrato, CymPredio, AuditLog } = require('../models');
const AppError = require('../utils/AppError');

const VIGENCIA_MESES = { trimestral: 3, semestral: 6, anual: 12, bianual: 24 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseFecha(str, campo) {
  if (!DATE_RE.test(str)) throw new AppError(`${campo}: formato inválido, use YYYY-MM-DD`, 400);
  return str;
}

function calcularVencimiento(fechaContratacion, vigencia) {
  // Parse as UTC to avoid timezone shifting the day
  const [y, m, d] = fechaContratacion.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCMonth(fecha.getUTCMonth() + VIGENCIA_MESES[vigencia]);
  return fecha.toISOString().split('T')[0];
}

const cymContratoController = {
  async getByPredio(req, res, next) {
    try {
      const contratos = await CymContrato.findAll({
        where: { predio_id: req.params.predioId },
        order: [['fecha_contratacion', 'DESC']]
      });
      res.json({ success: true, data: contratos });
    } catch (err) {
      next(err);
    }
  },

  async crear(req, res, next) {
    try {
      const { predio_id, contratante_cedula, contratante_nombre, contratante_telefono,
              contratante_correo, contratante_dir, vigencia, fecha_contratacion } = req.body;

      parseFecha(fecha_contratacion, 'fecha_contratacion');

      const predio = await CymPredio.findByPk(predio_id);
      if (!predio) throw new AppError('Predio no encontrado', 404);

      // Validar que no exista contrato activo o vencido
      const activo = await CymContrato.findOne({
        where: { predio_id, estado: { [Op.in]: ['activo', 'vencido'] } }
      });
      if (activo) throw new AppError('El predio ya tiene un contrato activo o en período de gracia. Debe cerrarse antes de crear uno nuevo.', 409);

      const fecha_vencimiento = calcularVencimiento(fecha_contratacion, vigencia);

      const contrato = await CymContrato.create({
        predio_id, contratante_cedula, contratante_nombre, contratante_telefono,
        contratante_correo, contratante_dir, vigencia, fecha_contratacion,
        fecha_vencimiento, estado: 'activo'
      });

      // Reactivar predio si estaba inactivo
      if (!predio.activo_mant) {
        await predio.update({ activo_mant: true });
      }

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'CREATE',
        tabla: 'cym_contratos',
        registro_id: contrato.id,
        datos_nuevos: JSON.stringify(contrato),
        ip_address: req.ip
      });

      res.status(201).json({ success: true, data: contrato, message: 'Contrato creado correctamente' });
    } catch (err) {
      next(err);
    }
  },

  async cancelar(req, res, next) {
    try {
      const contrato = await CymContrato.findByPk(req.params.id);
      if (!contrato) throw new AppError('Contrato no encontrado', 404);
      if (!['activo', 'vencido'].includes(contrato.estado)) {
        throw new AppError('Solo se pueden cancelar contratos activos o vencidos', 400);
      }

      const { motivo } = req.body;
      if (!motivo?.trim()) throw new AppError('El motivo de cancelación es requerido', 400);

      const antes = contrato.toJSON();
      await contrato.update({ estado: 'cancelado', motivo_cancelacion: motivo.trim() });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'CANCELAR',
        tabla: 'cym_contratos',
        registro_id: contrato.id,
        datos_anteriores: JSON.stringify(antes),
        datos_nuevos: JSON.stringify(contrato),
        ip_address: req.ip
      });

      res.json({ success: true, data: contrato, message: 'Contrato cancelado correctamente' });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const contrato = await CymContrato.findByPk(req.params.id);
      if (!contrato) throw new AppError('Contrato no encontrado', 404);
      if (contrato.estado === 'cerrado') throw new AppError('No se puede modificar un contrato cerrado', 400);

      const antes = contrato.toJSON();
      const { contratante_cedula, contratante_nombre, contratante_telefono,
              contratante_correo, contratante_dir, vigencia, fecha_contratacion } = req.body;

      const updates = { contratante_cedula, contratante_nombre, contratante_telefono,
                        contratante_correo, contratante_dir };

      if (vigencia && fecha_contratacion) {
        updates.vigencia = vigencia;
        updates.fecha_contratacion = fecha_contratacion;
        updates.fecha_vencimiento = calcularVencimiento(fecha_contratacion, vigencia);
      }

      await contrato.update(updates);

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'UPDATE',
        tabla: 'cym_contratos',
        registro_id: contrato.id,
        datos_anteriores: JSON.stringify(antes),
        datos_nuevos: JSON.stringify(contrato),
        ip_address: req.ip
      });

      res.json({ success: true, data: contrato, message: 'Contrato actualizado' });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = cymContratoController;
