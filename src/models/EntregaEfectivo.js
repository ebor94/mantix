// ============================================
// src/models/EntregaEfectivo.js
// Acta de recibido de efectivo: la cajera registra el efectivo entregado por
// un asesor y el asesor lo confirma con un OTP enviado a su WhatsApp.
// Independiente del cuadre (monto global del día, no ligado a recibos).
// ============================================

module.exports = (sequelize, DataTypes) => {
  const EntregaEfectivo = sequelize.define('EntregaEfectivo', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    asesorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Usuario ASESOR que entregó el efectivo'
    },
    cajeroId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Usuario CAJERO que recibió/registró la entrega'
    },
    monto: {
      type: DataTypes.DECIMAL(12, 0),
      allowNull: false
    },
    celular: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Snapshot del telefono del asesor al que se envió el OTP'
    },
    estado: {
      type: DataTypes.ENUM('PENDIENTE', 'CONFIRMADA'),
      allowNull: false,
      defaultValue: 'PENDIENTE'
    },
    fechaConfirmacion: {
      type: DataTypes.DATE,
      allowNull: true
    },
    observacion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    recibosIds: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Ids de recibos_caja (EFECTIVO) que cubre esta entrega'
    },
  }, {
    tableName: 'entregas_efectivo',
    timestamps: true
  });

  EntregaEfectivo.associate = (models) => {
    EntregaEfectivo.belongsTo(models.Usuario, { as: 'asesor', foreignKey: 'asesorId' });
    EntregaEfectivo.belongsTo(models.Usuario, { as: 'cajero', foreignKey: 'cajeroId' });
  };

  return EntregaEfectivo;
};
