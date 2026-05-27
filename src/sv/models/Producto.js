// sv/models/Producto.js — sv_cfg_productos
module.exports = (sequelize, DataTypes) => {
  const Producto = sequelize.define('SvProducto', {
    prod_id:               { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    prod_area_id:          { type: DataTypes.INTEGER, allowNull: false },
    prod_codigo:           { type: DataTypes.STRING(30),  allowNull: false, unique: true },
    prod_nombre:           { type: DataTypes.STRING(120), allowNull: false },
    prod_descripcion:      { type: DataTypes.TEXT },
    prod_categoria:        { type: DataTypes.STRING(50) },
    prod_precio_base:      { type: DataTypes.DECIMAL(12, 2) },
    prod_requiere_empresa: { type: DataTypes.TINYINT, defaultValue: 0 },
    prod_activo:           { type: DataTypes.TINYINT, defaultValue: 1 },
    prod_orden_display:    { type: DataTypes.SMALLINT, defaultValue: 0 }
  }, {
    tableName: 'sv_cfg_productos',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'prod_created_at',
    updatedAt: false
  });

  Producto.associate = (models) => {
    Producto.belongsTo(models.SvArea, { as: 'area', foreignKey: 'prod_area_id' });
  };
  return Producto;
};
