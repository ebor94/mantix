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

  return CategoriaMantenimiento;
};