// ============================================
// src/models/MantenimientoProgramado.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const MantenimientoProgramado = sequelize.define('MantenimientoProgramado', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    plan_actividad_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    codigo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    fecha_programada: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    hora_programada: {
      type: DataTypes.TIME
    },
    estado_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    prioridad: {
      type: DataTypes.ENUM('baja', 'media', 'alta', 'critica'),
      defaultValue: 'media'
    },
    reprogramaciones: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    ultimo_motivo_reprogramacion: {
      type: DataTypes.TEXT
    },
    notificacion_enviada: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_notificacion: {
      type: DataTypes.DATE
    },
    observaciones: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'mantenimientos_programados',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  MantenimientoProgramado.associate = (models) => {
    // ✅ ASOCIACIÓN ACTIVADA
    MantenimientoProgramado.belongsTo(models.PlanActividad, {
      foreignKey: 'plan_actividad_id',
      as: 'actividad'
    });
    
    MantenimientoProgramado.belongsTo(models.Estado, {
      foreignKey: 'estado_id',
      as: 'estado'
    });
    
    MantenimientoProgramado.hasOne(models.MantenimientoEjecutado, {
      foreignKey: 'mantenimiento_programado_id',
      as: 'ejecucion'
    });
  };

  return MantenimientoProgramado;
};