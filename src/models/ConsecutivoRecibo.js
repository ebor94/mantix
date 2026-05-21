// ============================================
// src/models/ConsecutivoRecibo.js
// Contador atómico por prefijo de asesor.
// Se actualiza con SELECT ... FOR UPDATE dentro de transacción
// para evitar race conditions al emitir recibos en paralelo.
// ============================================

module.exports = (sequelize, DataTypes) => {
  const ConsecutivoRecibo = sequelize.define('ConsecutivoRecibo', {
    prefijo: {
      type: DataTypes.STRING(10),
      primaryKey: true,
      allowNull: false
    },
    ultimoNumero: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'ultimo_numero',
      defaultValue: 0
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at'
    }
  }, {
    tableName: 'consecutivos_recibo',
    timestamps: true,
    createdAt: false,
    updatedAt: 'updated_at'
  });

  return ConsecutivoRecibo;
};
