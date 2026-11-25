// sv/models/Venta.js — sv_crm_ventas (migración 027)
module.exports = (sequelize, DataTypes) => {
  const Venta = sequelize.define('SvVenta', {
    venta_id:         { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    venta_prosp_id:   { type: DataTypes.INTEGER, allowNull: false },
    venta_gest_id:    { type: DataTypes.BIGINT, allowNull: false, unique: 'uq_venta_gestion' },
    venta_asesor_id:  { type: DataTypes.INTEGER, allowNull: false },   // dueño del cliente: a él le suma
    venta_area_id:    { type: DataTypes.INTEGER, allowNull: false },
    venta_fecha:      { type: DataTypes.DATEONLY, allowNull: false },  // día en Colombia
    venta_total:      { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    venta_anulada:    { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    venta_created_by: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'sv_crm_ventas',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'venta_created_at',
    updatedAt: 'venta_updated_at'
  });

  Venta.associate = (models) => {
    Venta.belongsTo(models.SvProspecto, { as: 'prospecto', foreignKey: 'venta_prosp_id' });
    Venta.belongsTo(models.SvUsuario,   { as: 'asesor',    foreignKey: 'venta_asesor_id' });
    Venta.hasMany(models.SvVentaItem,   { as: 'items',     foreignKey: 'vi_venta_id' });
    Venta.hasMany(models.SvVentaCambio, { as: 'cambios',   foreignKey: 'vc_venta_id' });
  };
  return Venta;
};
