// ============================================
// src/models/Seguro.js - Modelo de Seguros
// ============================================

module.exports = (sequelize, DataTypes) => {
  const Seguro = sequelize.define('Seguro', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    afiliadoId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'afiliados',
        key: 'id'
      }
    },
    nombre: {
      type: DataTypes.ENUM('SOLICANASTA', 'ACCIDENTES', 'SINERGIA', 'SOLIENVIDA'),
      allowNull: false
    },
    monto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      comment: 'Monto asegurado'
    },
    prima: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Prima mensual calculada desde primas_seguros'
    }
  }, {
    tableName: 'seguros',
    timestamps: true
  });

  Seguro.associate = function(models) {
    // Un seguro pertenece a un afiliado
    Seguro.belongsTo(models.Afiliado, {
      as: 'afiliado',
      foreignKey: 'afiliadoId'
    });
  };

  return Seguro;
};