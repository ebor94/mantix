// sv/models/VentaItem.js — sv_crm_ventas_items (migración 027)
module.exports = (sequelize, DataTypes) => {
  const VentaItem = sequelize.define('SvVentaItem', {
    vi_id:              { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    vi_venta_id:        { type: DataTypes.INTEGER, allowNull: false },
    vi_prod_id:         { type: DataTypes.INTEGER, allowNull: false },
    vi_cantidad:        { type: DataTypes.SMALLINT, allowNull: false },
    vi_precio_ofrecido: { type: DataTypes.DECIMAL(12, 2) },                    // lo pone el servidor
    vi_precio_unitario: { type: DataTypes.DECIMAL(12, 2), allowNull: false }   // por el que se vendió
  }, {
    tableName: 'sv_crm_ventas_items',
    freezeTableName: true,
    timestamps: false
  });

  VentaItem.associate = (models) => {
    VentaItem.belongsTo(models.SvVenta,    { as: 'venta',    foreignKey: 'vi_venta_id' });
    VentaItem.belongsTo(models.SvProducto, { as: 'producto', foreignKey: 'vi_prod_id' });
  };
  return VentaItem;
};
