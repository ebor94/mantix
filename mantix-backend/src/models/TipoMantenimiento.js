// ============================================
// src/models/TipoMantenimiento.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const TipoMantenimiento = sequelize.define('TipoMantenimiento', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: {
          msg: 'El nombre no puede estar vacío'
        },
        len: {
          args: [3, 50],
          msg: 'El nombre debe tener entre 3 y 50 caracteres'
        }
      }
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'tipos_mantenimiento',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  TipoMantenimiento.associate = (models) => {
    // Si tienes relaciones con otras tablas, agrégalas aquí
    // Por ejemplo, con PlanActividad
    if (models.PlanActividad) {
      TipoMantenimiento.hasMany(models.PlanActividad, {
        foreignKey: 'tipo_mantenimiento_id',
        as: 'actividades'
      });
    }
  };

  return TipoMantenimiento;
};