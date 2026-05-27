const { CymAsignacion, CymPareja, CymParejaMiembro, CymPredio, Usuario, Rol, AuditLog } = require('../models');
const AppError = require('../utils/AppError');

const cymAsignacionController = {
  async getByPredio(req, res, next) {
    try {
      const asignacion = await CymAsignacion.findOne({
        where: { predio_id: req.params.predioId, activo: true },
        include: [
          { model: Usuario,   as: 'coordinador', attributes: ['id','nombre','apellido'] },
          { model: Usuario,   as: 'supervisor',  attributes: ['id','nombre','apellido'] },
          { model: Usuario,   as: 'aux_cartera', attributes: ['id','nombre','apellido'] },
          {
            model: CymPareja,
            as: 'pareja',
            include: [{
              model: CymParejaMiembro,
              as: 'miembros',
              where: { activo: true },
              required: false,
              include: [{ model: Usuario, as: 'operario', attributes: ['id','nombre','apellido'] }],
              order: [['posicion', 'ASC']]
            }]
          }
        ]
      });
      res.json({ success: true, data: asignacion });
    } catch (err) {
      next(err);
    }
  },

  async asignar(req, res, next) {
    try {
      const { predio_id, supervisor_id, pareja_id, aux_cartera_id, coordinador_id } = req.body;

      const predio = await CymPredio.findByPk(predio_id);
      if (!predio) throw new AppError('Predio no encontrado', 404);

      if (supervisor_id)   await validarRol(supervisor_id,   ['supervisor_cym'],         'Supervisor');
      if (aux_cartera_id)  await validarRol(aux_cartera_id,  ['auxiliar_cartera_cym'],   'Aux. Cartera');
      if (coordinador_id)  await validarRol(coordinador_id,  ['coordinador_cym'],        'Coordinador');

      if (pareja_id) {
        const pareja = await CymPareja.findByPk(pareja_id);
        if (!pareja || !pareja.activo) throw new AppError('Pareja no encontrada o inactiva', 400);
      }

      // Desactivar asignación previa
      await CymAsignacion.update({ activo: false }, { where: { predio_id, activo: true } });

      const asignacion = await CymAsignacion.create({
        predio_id, supervisor_id, pareja_id, aux_cartera_id, coordinador_id, activo: true
      });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'CREATE',
        tabla: 'cym_asignaciones',
        registro_id: asignacion.id,
        datos_nuevos: JSON.stringify(asignacion),
        ip_address: req.ip
      });

      res.status(201).json({ success: true, data: asignacion, message: 'Personal asignado correctamente' });
    } catch (err) {
      next(err);
    }
  },

  async getPersonalDisponible(req, res, next) {
    try {
      const { Rol: RolModel } = require('../models');
      const roles = await RolModel.findAll({
        where: { nombre: ['supervisor_cym','auxiliar_cartera_cym','coordinador_cym'], activo: true }
      });
      const rolIds = roles.map(r => r.id);
      const personal = await Usuario.findAll({
        where: { rol_id: rolIds, activo: true },
        include: [{ model: RolModel, as: 'rol', attributes: ['nombre'] }],
        attributes: ['id','nombre','apellido','email'],
        order: [['nombre','ASC']]
      });
      res.json({ success: true, data: personal });
    } catch (err) {
      next(err);
    }
  }
};

async function validarRol(usuarioId, rolesPermitidos, label) {
  const u = await Usuario.findByPk(usuarioId, { include: [{ model: Rol, as: 'rol' }] });
  if (!u) throw new AppError(`${label}: usuario no encontrado`, 404);
  if (!u.es_super_admin && !rolesPermitidos.includes(u.rol?.nombre)) {
    throw new AppError(`${label}: el usuario no tiene el rol requerido`, 400);
  }
}

module.exports = cymAsignacionController;
