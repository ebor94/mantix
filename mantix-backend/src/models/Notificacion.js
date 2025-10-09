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
    referencia_tipo: {
      type: DataTypes.ENUM('mantenimiento', 'solicitud', 'equipo', 'otro')
    },
    referencia_id: {
      type: DataTypes.INTEGER
    },
    leida: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_lectura: {
      type: DataTypes.DATE
    },
    enviada_email: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_envio_email: {
      type: DataTypes.DATE
    }
  }, {
    tableName: 'notificaciones',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  Notificacion.associate = (models) => {
    Notificacion.belongsTo(models.Usuario, {
      foreignKey: 'usuario_id',
      as: 'usuario'
    });
  };

  return Notificacion;
};