module.exports = (sequelize, DataTypes) => {
  const CymCartera = sequelize.define('CymCartera', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    contrato_id:   { type: DataTypes.INTEGER, allowNull: false },
    usuario_id:    { type: DataTypes.INTEGER, allowNull: false },
    tipo_gestion:  { type: DataTypes.ENUM('llamada','visita','email','whatsapp'), allowNull: false },
    resultado:     { type: DataTypes.ENUM('contactado','no_contesto','promesa_pago','pago_realizado'), allowNull: false },
    observacion:   { type: DataTypes.TEXT },
    fecha_gestion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'cym_cartera',
    timestamps: false
  });

  CymCartera.associate = (models) => {
    CymCartera.belongsTo(models.CymContrato, { foreignKey: 'contrato_id', as: 'contrato' });
    CymCartera.belongsTo(models.Usuario,     { foreignKey: 'usuario_id',  as: 'usuario' });
  };

  return CymCartera;
};
