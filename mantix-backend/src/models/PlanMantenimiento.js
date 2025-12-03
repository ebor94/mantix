// ============================================
// src/models/PlanMantenimiento.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const PlanMantenimiento = sequelize.define('PlanMantenimiento', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    anio: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isInt: true,
        min: 2020,
        max: 2100
      }
    },
    nombre: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT
    },
    fecha_inicio: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    fecha_fin: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    created_by: {
      type: DataTypes.INTEGER
    }
  }, {
    tableName: 'planes_mantenimiento',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  PlanMantenimiento.associate = (models) => {
    if (models.Usuario) {
      PlanMantenimiento.belongsTo(models.Usuario, {
        foreignKey: 'created_by',
        as: 'usuario_creador'
      });
    }

    if (models.PlanActividad) {
      PlanMantenimiento.hasMany(models.PlanActividad, {
        foreignKey: 'plan_id',
        as: 'actividades'
      });
    }
  };

  return PlanMantenimiento;
};