// ============================================
// src/models/CategoriaMantenimiento.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const CategoriaMantenimiento = sequelize.define('CategoriaMantenimiento', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT
    },
    color: {
      type: DataTypes.STRING(7),
      defaultValue: '#667eea'
    },
    icono: {
      type: DataTypes.STRING(50)
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'categorias_mantenimiento',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  CategoriaMantenimiento.associate = (models) => {
    // Relación con equipos
    CategoriaMantenimiento.hasMany(models.Equipo, {
      foreignKey: 'categoria_id',
      as: 'equipos'
    });

    // Relación con plan de actividades
    CategoriaMantenimiento.hasMany(models.PlanActividad, {
      foreignKey: 'categoria_id',
      as: 'planes_actividades'
    });

    // Relación muchos a muchos con usuarios (a través de usuario_categorias)
    CategoriaMantenimiento.belongsToMany(models.Usuario, {
      through: 'UsuarioCategoria', // ← IMPORTANTE: usar string
      foreignKey: 'categoria_id',
      otherKey: 'usuario_id',
      as: 'usuarios_con_acceso'
    });

    // Relación directa con la tabla intermedia
    CategoriaMantenimiento.hasMany(models.UsuarioCategoria, {
      foreignKey: 'categoria_id',
      as: 'usuario_categorias'
    });
  };

  /**
   * Método estático para obtener categorías según permisos del usuario
   * @param {number} usuarioId - ID del usuario
   * @param {object} models - Modelos de Sequelize
   * @returns {Promise<Array>} - Lista de categorías permitidas
   */
  CategoriaMantenimiento.obtenerPorPermisos = async function(usuarioId, models) {
    const usuario = await models.Usuario.findByPk(usuarioId);
    
    if (!usuario) {
      throw new Error('Usuario no encontrado');
    }

    // Si es super admin, retornar todas las categorías activas
    if (usuario.es_super_admin) {
      return await CategoriaMantenimiento.findAll({
        where: { activo: true },
        order: [['nombre', 'ASC']]
      });
    }

    // Para usuarios normales, obtener solo sus categorías permitidas
    const categoriasPermitidas = await CategoriaMantenimiento.findAll({
      where: { activo: true },
      include: [{
        model: models.UsuarioCategoria,
        as: 'usuario_categorias',
        where: { usuario_id: usuarioId },
        required: true,
        attributes: []
      }],
      order: [['nombre', 'ASC']]
    });

    return categoriasPermitidas;
  };

  /**
   * Método estático para verificar si un usuario tiene acceso a una categoría
   * @param {number} categoriaId - ID de la categoría
   * @param {number} usuarioId - ID del usuario
   * @param {object} models - Modelos de Sequelize
   * @returns {Promise<boolean>}
   */
  CategoriaMantenimiento.usuarioTieneAcceso = async function(categoriaId, usuarioId, models) {
    const usuario = await models.Usuario.findByPk(usuarioId);
    
    if (!usuario) {
      return false;
    }

    // Super admin tiene acceso a todo
    if (usuario.es_super_admin) {
      return true;
    }

    // Verificar si existe el permiso
    const permiso = await models.UsuarioCategoria.findOne({
      where: {
        usuario_id: usuarioId,
        categoria_id: categoriaId
      }
    });

    return permiso !== null;
  };

  /**
   * Método para obtener estadísticas de una categoría
   * @param {number} categoriaId - ID de la categoría
   * @param {object} models - Modelos de Sequelize
   * @returns {Promise<object>} - Estadísticas de la categoría
   */
  CategoriaMantenimiento.obtenerEstadisticas = async function(categoriaId, models) {
    const categoria = await CategoriaMantenimiento.findByPk(categoriaId);
    
    if (!categoria) {
      throw new Error('Categoría no encontrada');
    }

    // Contar equipos
    const totalEquipos = await models.Equipo.count({
      where: { categoria_id: categoriaId, activo: true }
    });

    // Contar equipos por estado
    const equiposPorEstado = await models.Equipo.findAll({
      where: { categoria_id: categoriaId, activo: true },
      attributes: [
        'estado',
        [sequelize.fn('COUNT', sequelize.col('id')), 'cantidad']
      ],
      group: ['estado'],
      raw: true
    });

    // Contar actividades planificadas
    const totalActividades = await models.PlanActividad.count({
      where: { categoria_id: categoriaId, activo: true }
    });

    // Contar mantenimientos programados pendientes
    const mantenimientosPendientes = await models.MantenimientoProgramado.count({
      include: [{
        model: models.PlanActividad,
        as: 'planActividad',
        where: { categoria_id: categoriaId },
        required: true
      }],
      where: {
        estado_id: 1 // Asumiendo que 1 es "Pendiente"
      }
    });

    // Contar usuarios con acceso
    const usuariosConAcceso = await models.UsuarioCategoria.count({
      where: { categoria_id: categoriaId }
    });

    return {
      categoria: {
        id: categoria.id,
        nombre: categoria.nombre,
        color: categoria.color,
        icono: categoria.icono
      },
      estadisticas: {
        total_equipos: totalEquipos,
        equipos_por_estado: equiposPorEstado,
        total_actividades: totalActividades,
        mantenimientos_pendientes: mantenimientosPendientes,
        usuarios_con_acceso: usuariosConAcceso
      }
    };
  };

  return CategoriaMantenimiento;
};