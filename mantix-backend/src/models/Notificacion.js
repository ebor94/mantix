// ============================================
// src/models/Notificacion.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const Notificacion = sequelize.define('Notificacion', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    tipo: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    titulo: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    mensaje: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    prioridad: {
      type: DataTypes.ENUM('baja', 'media', 'alta', 'critica'),
      defaultValue: 'media'
    },
    referencia_tipo: {
      type: DataTypes.ENUM('mantenimiento', 'solicitud', 'equipo', 'actividad', 'plan', 'otro'),
      allowNull: true
    },
    referencia_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    url_accion: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    leida: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_lectura: {
      type: DataTypes.DATE,
      allowNull: true
    },
    enviada_email: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_envio_email: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'notificaciones',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Notificacion.associate = (models) => {
    Notificacion.belongsTo(models.Usuario, {
      foreignKey: 'usuario_id',
      as: 'usuario'
    });
  };

  /**
   * Marcar notificación como leída
   */
  Notificacion.prototype.marcarComoLeida = async function() {
    if (!this.leida) {
      await this.update({
        leida: true,
        fecha_lectura: new Date()
      });
    }
    return this;
  };

  /**
   * Obtener notificaciones no leídas de un usuario
   */
  Notificacion.obtenerNoLeidas = async function(usuarioId, limit = 50) {
    return await Notificacion.findAll({
      where: {
        usuario_id: usuarioId,
        leida: false,
        activo: true
      },
      order: [['created_at', 'DESC']],
      limit: limit
    });
  };

  /**
   * Contar notificaciones no leídas
   */
  Notificacion.contarNoLeidas = async function(usuarioId) {
    return await Notificacion.count({
      where: {
        usuario_id: usuarioId,
        leida: false,
        activo: true
      }
    });
  };

  /**
   * Crear notificación para múltiples usuarios
   */
  Notificacion.crearParaMultiplesUsuarios = async function(usuariosIds, datos) {
    const notificaciones = usuariosIds.map(usuarioId => ({
      usuario_id: usuarioId,
      ...datos
    }));

    return await Notificacion.bulkCreate(notificaciones);
  };

  /**
   * Marcar todas las notificaciones de un usuario como leídas
   */
  Notificacion.marcarTodasLeidasUsuario = async function(usuarioId) {
    return await Notificacion.update(
      {
        leida: true,
        fecha_lectura: new Date()
      },
      {
        where: {
          usuario_id: usuarioId,
          leida: false,
          activo: true
        }
      }
    );
  };

  return Notificacion;
};