// sv/models/VentaCambio.js — sv_crm_ventas_cambios (migración 027)
module.exports = (sequelize, DataTypes) => {
  const VentaCambio = sequelize.define('SvVentaCambio', {
    vc_id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    vc_venta_id:      { type: DataTypes.INTEGER, allowNull: false },
    vc_usr_id:        { type: DataTypes.INTEGER, allowNull: false },
    vc_accion:        { type: DataTypes.STRING(10), allowNull: false },   // corregir, anular
    vc_motivo:        { type: DataTypes.STRING(250), allowNull: false },
    vc_total_antes:   { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    vc_total_despues: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    vc_detalle:       { type: DataTypes.JSON }
  }, {
    tableName: 'sv_crm_ventas_cambios',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'vc_created_at',
    updatedAt: false
  });

  VentaCambio.associate = (models) => {
    VentaCambio.belongsTo(models.SvVenta,   { as: 'venta',   foreignKey: 'vc_venta_id' });
    VentaCambio.belongsTo(models.SvUsuario, { as: 'usuario', foreignKey: 'vc_usr_id' });
  };
  return VentaCambio;
};
