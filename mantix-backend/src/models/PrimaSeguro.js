// ============================================
// src/models/PrimaSeguro.js - Modelo de Primas de Seguro
// ============================================

module.exports = (sequelize, DataTypes) => {
  const PrimaSeguro = sequelize.define('PrimaSeguro', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    nombreSeguro: {
      type: DataTypes.ENUM('SOLICANASTA', 'ACCIDENTES', 'SINERGIA', 'SOLIENVIDA'),
      allowNull: false
    },
    montoAsegurado: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    prima: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false
    },
    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 1
    }
  }, {
    tableName: 'primas_seguros',
    timestamps: true
  });

  PrimaSeguro.associate = function(models) {
    // Aquí podrías agregar asociaciones si es necesario
    // Por ejemplo, si quieres relacionar con Seguro
  };

  return PrimaSeguro;
};