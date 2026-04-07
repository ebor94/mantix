// ============================================
// src/models/Empresa.js - Modelo de Empresas
// ============================================

module.exports = (sequelize, DataTypes) => {
  const Empresa = sequelize.define('Empresa', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    nit: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    nombre: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 1
    }
  }, {
    tableName: 'empresas',
    timestamps: true
  });

  Empresa.associate = function(models) {
    // Una empresa puede tener muchos afiliados
    Empresa.hasMany(models.Afiliado, {
      as: 'afiliados',
      foreignKey: 'empresaId',
      onDelete: 'SET NULL'
    });
  };

  return Empresa;
};