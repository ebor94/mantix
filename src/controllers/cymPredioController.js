const { Op } = require('sequelize');
const {
  CymPredio, CymContrato, CymAsignacion, CymMantenimiento,
  CymChecklist, CymEvidencia, CymActividad, Usuario, AuditLog
} = require('../models');
const AppError = require('../utils/AppError');

// Devuelve contratos cuyo estado es activo o vencido dentro del período de gracia (60 días)
function whereContratoVigente() {
  const limite = new Date();
  limite.setDate(limite.getDate() - 60);
  return {
    estado: { [Op.in]: ['activo', 'vencido'] },
    [Op.or]: [
      { estado: 'activo' },
      { estado: 'vencido', fecha_vencimiento: { [Op.gte]: limite } }
    ]
  };
}

const cymPredioController = {
  async getAll(req, res, next) {
    try {
      const usuario = req.usuario;
      const rolNombre = usuario.rol?.nombre;
      const esSuperAdmin = usuario.es_super_admin;

      let whereAsignacion = {};
      let includeAsignacion = {
        model: CymAsignacion,
        as: 'asignacion',
        required: false,
        include: [
          { model: Usuario, as: 'coordinador', attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'supervisor',  attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'operario',    attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'aux_cartera', attributes: ['id','nombre','apellido'] }
        ]
      };

      if (!esSuperAdmin && rolNombre === 'supervisor_cym') {
        whereAsignacion = { supervisor_id: usuario.id };
        includeAsignacion.required = true;
        includeAsignacion.where = whereAsignacion;
      } else if (!esSuperAdmin && rolNombre === 'auxiliar_cartera_cym') {
        whereAsignacion = { aux_cartera_id: usuario.id };
        includeAsignacion.required = true;
        includeAsignacion.where = whereAsignacion;
      }

      const whereContratoFilter =
        (!esSuperAdmin && (rolNombre === 'supervisor_cym' || rolNombre === 'auxiliar_cartera_cym'))
          ? { where: whereContratoVigente(), required: true }
          : { required: false };

      const predios = await CymPredio.findAll({
        include: [
          {
            model: CymContrato,
            as: 'contratos',
            ...whereContratoFilter,
            order: [['fecha_contratacion', 'DESC']],
            limit: 1
          },
          includeAsignacion
        ],
        order: [['sector', 'ASC'], ['numero_lote', 'ASC']]
      });

      res.json({ success: true, data: predios });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.id, {
        include: [
          {
            model: CymContrato,
            as: 'contratos',
            order: [['fecha_contratacion', 'DESC']]
          },
          {
            model: CymAsignacion,
            as: 'asignacion',
            include: [
              { model: Usuario, as: 'coordinador', attributes: ['id','nombre','apellido','email'] },
              { model: Usuario, as: 'supervisor',  attributes: ['id','nombre','apellido','email'] },
              { model: Usuario, as: 'operario',    attributes: ['id','nombre','apellido','email'] },
              { model: Usuario, as: 'aux_cartera', attributes: ['id','nombre','apellido','email'] }
            ]
          }
        ]
      });
      if (!predio) throw new AppError('Predio no encontrado', 404);
      res.json({ success: true, data: predio });
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const { sector, numero_lote, acomodacion,
              sq_cedula, sq_nombre, sq_fecha_nac, sq_fecha_fall, sq_fecha_inhum,
              sq2_cedula, sq2_nombre, sq2_fecha_nac, sq2_fecha_fall, sq2_fecha_inhum,
              sq3_cedula, sq3_nombre, sq3_fecha_nac, sq3_fecha_fall, sq3_fecha_inhum } = req.body;

      const predio = await CymPredio.create({
        sector, numero_lote, acomodacion,
        sq_cedula, sq_nombre, sq_fecha_nac, sq_fecha_fall, sq_fecha_inhum,
        sq2_cedula, sq2_nombre, sq2_fecha_nac, sq2_fecha_fall, sq2_fecha_inhum,
        sq3_cedula, sq3_nombre, sq3_fecha_nac, sq3_fecha_fall, sq3_fecha_inhum,
        activo_mant: true
      });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'CREATE',
        tabla: 'cym_predios',
        registro_id: predio.id,
        datos_nuevos: JSON.stringify(predio),
        ip_address: req.ip
      });

      res.status(201).json({ success: true, data: predio, message: 'Predio creado correctamente' });
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        return next(new AppError('Ya existe un predio con ese sector y número de lote', 409));
      }
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.id);
      if (!predio) throw new AppError('Predio no encontrado', 404);

      const antes = predio.toJSON();
      const { sector, numero_lote, acomodacion,
              sq_cedula, sq_nombre, sq_fecha_nac, sq_fecha_fall, sq_fecha_inhum,
              sq2_cedula, sq2_nombre, sq2_fecha_nac, sq2_fecha_fall, sq2_fecha_inhum,
              sq3_cedula, sq3_nombre, sq3_fecha_nac, sq3_fecha_fall, sq3_fecha_inhum,
              activo_mant } = req.body;

      await predio.update({
        sector, numero_lote, acomodacion,
        sq_cedula, sq_nombre, sq_fecha_nac, sq_fecha_fall, sq_fecha_inhum,
        sq2_cedula, sq2_nombre, sq2_fecha_nac, sq2_fecha_fall, sq2_fecha_inhum,
        sq3_cedula, sq3_nombre, sq3_fecha_nac, sq3_fecha_fall, sq3_fecha_inhum,
        activo_mant
      });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'UPDATE',
        tabla: 'cym_predios',
        registro_id: predio.id,
        datos_anteriores: JSON.stringify(antes),
        datos_nuevos: JSON.stringify(predio),
        ip_address: req.ip
      });

      res.json({ success: true, data: predio, message: 'Predio actualizado' });
    } catch (err) {
      next(err);
    }
  },

  async inactivar(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.id, {
        include: [{
          model: CymContrato,
          as: 'contratos',
          where: { estado: { [Op.in]: ['activo', 'vencido'] } },
          required: false
        }]
      });
      if (!predio) throw new AppError('Predio no encontrado', 404);

      const contratoVigente = predio.contratos?.find(c => ['activo', 'vencido'].includes(c.estado));
      if (contratoVigente) throw new AppError('No se puede inactivar un predio con contrato activo o vencido', 400);

      if (!predio.activo_mant) throw new AppError('El predio ya está inactivo', 400);

      const { motivo } = req.body;
      if (!motivo?.trim()) throw new AppError('El motivo de inactivación es requerido', 400);

      const antes = predio.toJSON();
      await predio.update({ activo_mant: false, motivo_inactivacion: motivo.trim() });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'INACTIVAR',
        tabla: 'cym_predios',
        registro_id: predio.id,
        datos_anteriores: JSON.stringify(antes),
        datos_nuevos: JSON.stringify(predio),
        ip_address: req.ip
      });

      res.json({ success: true, data: predio, message: 'Predio inactivado correctamente' });
    } catch (err) {
      next(err);
    }
  },

  async getTimeline(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.id);
      if (!predio) throw new AppError('Predio no encontrado', 404);

      const mantenimientos = await CymMantenimiento.findAll({
        where: { predio_id: req.params.id, estado: 'completado' },
        include: [
          {
            model: CymChecklist,
            as: 'checklist',
            include: [{ model: CymActividad, as: 'actividad', attributes: ['nombre','orden'] }]
          },
          { model: CymEvidencia, as: 'evidencias' },
          { model: Usuario, as: 'supervisor', attributes: ['nombre','apellido'] },
          { model: Usuario, as: 'operario',   attributes: ['nombre','apellido'] },
          { model: Usuario, as: 'operario2',  attributes: ['nombre','apellido'] }
        ],
        order: [['fecha_mant', 'DESC']]
      });

      res.json({ success: true, data: { predio, mantenimientos } });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = cymPredioController;
