const { CymPareja, CymParejaMiembro, Usuario, Rol, AuditLog } = require('../models');
const AppError = require('../utils/AppError');

const cymParejaController = {
  async getAll(req, res, next) {
    try {
      const parejas = await CymPareja.findAll({
        include: [{
          model: CymParejaMiembro,
          as: 'miembros',
          where: { activo: true },
          required: false,
          include: [{ model: Usuario, as: 'operario', attributes: ['id','nombre','apellido'] }],
          order: [['posicion', 'ASC']]
        }],
        order: [['nombre', 'ASC']]
      });
      res.json({ success: true, data: parejas });
    } catch (err) {
      next(err);
    }
  },

  async crear(req, res, next) {
    try {
      const { nombre, operario1_id, operario2_id } = req.body;
      if (!nombre?.trim()) throw new AppError('El nombre de la pareja es requerido', 400);

      await validarOperario(operario1_id, 'Operario 1');
      if (operario2_id) await validarOperario(operario2_id, 'Operario 2');

      const pareja = await CymPareja.create({ nombre: nombre.trim() });

      if (operario1_id) {
        await CymParejaMiembro.create({ pareja_id: pareja.id, posicion: 1, operario_id: operario1_id, activo: true });
      }
      if (operario2_id) {
        await CymParejaMiembro.create({ pareja_id: pareja.id, posicion: 2, operario_id: operario2_id, activo: true });
      }

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'CREATE',
        tabla: 'cym_parejas',
        registro_id: pareja.id,
        datos_nuevos: JSON.stringify({ nombre, operario1_id, operario2_id }),
        ip_address: req.ip
      });

      const resultado = await getPareja(pareja.id);
      res.status(201).json({ success: true, data: resultado, message: 'Pareja creada correctamente' });
    } catch (err) {
      next(err);
    }
  },

  async actualizar(req, res, next) {
    try {
      const pareja = await CymPareja.findByPk(req.params.id);
      if (!pareja) throw new AppError('Pareja no encontrada', 404);

      const { nombre, activo } = req.body;
      const antes = pareja.toJSON();
      await pareja.update({ nombre: nombre?.trim() || pareja.nombre, activo: activo ?? pareja.activo });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'UPDATE',
        tabla: 'cym_parejas',
        registro_id: pareja.id,
        datos_anteriores: JSON.stringify(antes),
        datos_nuevos: JSON.stringify(pareja),
        ip_address: req.ip
      });

      const resultado = await getPareja(pareja.id);
      res.json({ success: true, data: resultado, message: 'Pareja actualizada' });
    } catch (err) {
      next(err);
    }
  },

  // Reemplaza un miembro de la pareja (posicion 1 o 2)
  // El miembro anterior queda con activo=false (trazabilidad)
  async cambiarMiembro(req, res, next) {
    try {
      const pareja = await CymPareja.findByPk(req.params.id);
      if (!pareja) throw new AppError('Pareja no encontrada', 404);

      const { posicion, operario_id, motivo } = req.body;
      if (![1, 2].includes(Number(posicion))) throw new AppError('Posición debe ser 1 o 2', 400);
      await validarOperario(operario_id, `Operario posición ${posicion}`);

      // Desactivar miembro actual en esa posición
      await CymParejaMiembro.update(
        { activo: false },
        { where: { pareja_id: pareja.id, posicion, activo: true } }
      );

      // Insertar nuevo miembro
      await CymParejaMiembro.create({
        pareja_id: pareja.id,
        posicion,
        operario_id,
        activo: true
      });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'CAMBIAR_MIEMBRO',
        tabla: 'cym_parejas',
        registro_id: pareja.id,
        datos_nuevos: JSON.stringify({ posicion, operario_id, motivo }),
        ip_address: req.ip
      });

      const resultado = await getPareja(pareja.id);
      res.json({ success: true, data: resultado, message: 'Miembro actualizado correctamente' });
    } catch (err) {
      next(err);
    }
  },

  async getOperarios(req, res, next) {
    try {
      const { Rol: RolModel } = require('../models');
      const rol = await RolModel.findOne({ where: { nombre: 'operario_cym', activo: true } });
      const operarios = await Usuario.findAll({
        where: { rol_id: rol?.id, activo: true },
        attributes: ['id','nombre','apellido'],
        order: [['nombre','ASC']]
      });
      res.json({ success: true, data: operarios });
    } catch (err) {
      next(err);
    }
  },

  // Historial completo de miembros de una pareja
  async getHistorialMiembros(req, res, next) {
    try {
      const pareja = await CymPareja.findByPk(req.params.id);
      if (!pareja) throw new AppError('Pareja no encontrada', 404);

      const historial = await CymParejaMiembro.findAll({
        where: { pareja_id: req.params.id },
        include: [{ model: Usuario, as: 'operario', attributes: ['id','nombre','apellido'] }],
        order: [['posicion', 'ASC'], ['created_at', 'DESC']]
      });

      res.json({ success: true, data: historial });
    } catch (err) {
      next(err);
    }
  }
};

async function validarOperario(id, label) {
  if (!id) return;
  const u = await Usuario.findByPk(id, { include: [{ model: Rol, as: 'rol' }] });
  if (!u) throw new AppError(`${label}: usuario no encontrado`, 404);
  if (!u.es_super_admin && u.rol?.nombre !== 'operario_cym') {
    throw new AppError(`${label}: el usuario no tiene rol operario_cym`, 400);
  }
}

async function getPareja(id) {
  return CymPareja.findByPk(id, {
    include: [{
      model: CymParejaMiembro,
      as: 'miembros',
      where: { activo: true },
      required: false,
      include: [{ model: Usuario, as: 'operario', attributes: ['id','nombre','apellido'] }],
      order: [['posicion', 'ASC']]
    }]
  });
}

module.exports = cymParejaController;
