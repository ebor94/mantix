// ============================================
// src/models/Estado.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const Estado = sequelize.define('Estado', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    tipo: {
      type: DataTypes.ENUM('mantenimiento', 'solicitud'),
      allowNull: false
    },
    color: {
      type: DataTypes.STRING(7),
      defaultValue: '#667eea'
    },
    orden: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'estados',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Estado;
};