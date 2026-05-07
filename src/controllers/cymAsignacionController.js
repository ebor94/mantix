const { CymAsignacion, CymPredio, Usuario, Rol, AuditLog } = require('../models');
const AppError = require('../utils/AppError');

const ROLES_VALIDOS = {
  supervisor_id:  ['supervisor_cym'],
  operario_id:    ['operario_cym'],
  operario2_id:   ['operario_cym'],
  aux_cartera_id: ['auxiliar_cartera_cym'],
  coordinador_id: ['coordinador_cym', 'superAdmin']
};

async function validarRolUsuario(campo, usuarioId) {
  if (!usuarioId) return;
  const usuario = await Usuario.findByPk(usuarioId, { include: [{ model: Rol, as: 'rol' }] });
  if (!usuario) throw new AppError(`Usuario ${usuarioId} no encontrado`, 404);
  const rolesPermitidos = ROLES_VALIDOS[campo];
  if (!usuario.es_super_admin && !rolesPermitidos.includes(usuario.rol?.nombre)) {
    throw new AppError(`El usuario ${usuario.nombre} no tiene el rol requerido para el campo ${campo}`, 400);
  }
}

const cymAsignacionController = {
  async getByPredio(req, res, next) {
    try {
      const asignacion = await CymAsignacion.findOne({
        where: { predio_id: req.params.predioId, activo: true },
        include: [
          { model: Usuario, as: 'coordinador', attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'supervisor',  attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'operario',    attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'operario2',   attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'aux_cartera', attributes: ['id','nombre','apellido'] }
        ]
      });
      res.json({ success: true, data: asignacion });
    } catch (err) {
      next(err);
    }
  },

  async asignar(req, res, next) {
    try {
      const { predio_id, supervisor_id, operario_id, operario2_id, aux_cartera_id, coordinador_id } = req.body;

      const predio = await CymPredio.findByPk(predio_id);
      if (!predio) throw new AppError('Predio no encontrado', 404);

      // Validar roles de cada usuario asignado
      await Promise.all([
        validarRolUsuario('supervisor_id',  supervisor_id),
        validarRolUsuario('operario_id',    operario_id),
        validarRolUsuario('operario2_id',   operario2_id),
        validarRolUsuario('aux_cartera_id', aux_cartera_id),
        validarRolUsuario('coordinador_id', coordinador_id)
      ]);

      // Desactivar asignación previa si existe
      await CymAsignacion.update({ activo: false }, { where: { predio_id, activo: true } });

      const asignacion = await CymAsignacion.create({
        predio_id, supervisor_id, operario_id, operario2_id, aux_cartera_id, coordinador_id, activo: true
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
        where: { nombre: ['supervisor_cym','operario_cym','auxiliar_cartera_cym','coordinador_cym'], activo: true }
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

module.exports = cymAsignacionController;
