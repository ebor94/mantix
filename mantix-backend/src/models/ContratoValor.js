// ============================================
// src/models/ContratoValor.js - Modelo de Contratos y Valores
// ============================================

module.exports = (sequelize, DataTypes) => {
  const ContratoValor = sequelize.define('ContratoValor', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    afiliadoId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      unique: true,
      references: {
        model: 'afiliados',
        key: 'id'
      }
    },
    tarifaId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'tarifas',
        key: 'id'
      }
    },
    valorPlanExequial: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    valorAdicionales: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    valorSeguros: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    valorTotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    periodicidad: {
      type: DataTypes.ENUM('MENSUAL', 'ANUAL', 'TRIMESTRAL', 'SEMESTRAL', 'SEMANAL'),
      allowNull: false,
      defaultValue: 'MENSUAL'
    },
    nCuotas: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1
    },
    valorCuota: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    }
  }, {
    tableName: 'contratos_valor',
    timestamps: true
  });

  ContratoValor.associate = function(models) {
    // Un contrato pertenece a un afiliado (relación 1:1)
    ContratoValor.belongsTo(models.Afiliado, {
      as: 'afiliado',
      foreignKey: 'afiliadoId'
    });

    // Un contrato puede estar basado en una tarifa
    ContratoValor.belongsTo(models.Tarifa, {
      as: 'tarifa',
      foreignKey: 'tarifaId'
    });
  };

  return ContratoValor;
};