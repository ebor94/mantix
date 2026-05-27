// sv/models/PropuestaItem.js — sv_sales_propuesta_items
module.exports = (sequelize, DataTypes) => {
  const Item = sequelize.define('SvPropuestaItem', {
    pi_id:              { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    pi_prop_id:         { type: DataTypes.INTEGER, allowNull: false },
    pi_prod_id:         { type: DataTypes.INTEGER },
    pi_descripcion:     { type: DataTypes.STRING(200), allowNull: false },
    pi_cantidad:        { type: DataTypes.INTEGER, defaultValue: 1 },
    pi_precio_unitario: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    pi_descuento_pct:   { type: DataTypes.DECIMAL(5, 2),  defaultValue: 0 },
    pi_subtotal:        { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    pi_orden:           { type: DataTypes.SMALLINT, defaultValue: 0 }
  }, {
    tableName: 'sv_sales_propuesta_items',
    freezeTableName: true,
    timestamps: false
  });

  Item.associate = (models) => {
    Item.belongsTo(models.SvPropuesta, { as: 'propuesta', foreignKey: 'pi_prop_id' });
    Item.belongsTo(models.SvProducto,  { as: 'producto',  foreignKey: 'pi_prod_id' });
  };
  return Item;
};
