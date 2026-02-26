// ============================================
// src/models/Tarifa.js - Modelo de Tarifas
// ============================================

module.exports = (sequelize, DataTypes) => {
  const Tarifa = sequelize.define('Tarifa', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    canal: {
      type: DataTypes.ENUM('EMPRESARIAL', 'INDIVIDUAL', 'CENS'),
      allowNull: false
    },
    producto: {
      type: DataTypes.ENUM('VERDE', 'INTEGRAL', 'CENS'),
      allowNull: false
    },
    grupo: {
      type: DataTypes.ENUM('UNIPERSONAL', 'UNIFAMILIAR', 'BASICO', 'CENS_II', 'INDIVIDUAL', 'TRADICIONAL'),
      allowNull: false
    },
    asistenciaFueraDeCasa: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 0
    },
    valorBase: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Valor plan exequial mensual'
    },
    valorAdicional: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Valor por beneficiario adicional mensual'
    },
    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 1
    }
  }, {
    tableName: 'tarifas',
    timestamps: true
  });

  Tarifa.associate = function(models) {
    // Una tarifa puede estar asociada a muchos contratos
    Tarifa.hasMany(models.ContratoValor, {
      as: 'contratos',
      foreignKey: 'tarifaId',
      onDelete: 'SET NULL'
    });
  };

  return Tarifa;
};