// sv/models/ProspectoProducto.js — sv_crm_prospectos_productos
module.exports = (sequelize, DataTypes) => {
  const ProspectoProducto = sequelize.define('SvProspectoProducto', {
    pp_id:           { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    pp_prosp_id:     { type: DataTypes.INTEGER, allowNull: false },
    pp_prod_id:      { type: DataTypes.INTEGER, allowNull: false },
    pp_es_principal: { type: DataTypes.TINYINT, defaultValue: 0 },
    pp_nota:         { type: DataTypes.STRING(200) }
  }, {
    tableName: 'sv_crm_prospectos_productos',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'pp_created_at',
    updatedAt: false
  });

  ProspectoProducto.associate = (models) => {
    ProspectoProducto.belongsTo(models.SvProspecto, { as: 'prospecto', foreignKey: 'pp_prosp_id' });
    ProspectoProducto.belongsTo(models.SvProducto,  { as: 'producto',  foreignKey: 'pp_prod_id' });
  };
  return ProspectoProducto;
};
