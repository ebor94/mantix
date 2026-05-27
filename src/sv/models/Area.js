// sv/models/Area.js — sv_cfg_areas_negocio
module.exports = (sequelize, DataTypes) => {
  const Area = sequelize.define('SvArea', {
    area_id:           { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    area_codigo:       { type: DataTypes.STRING(20),  allowNull: false, unique: true },
    area_nombre:       { type: DataTypes.STRING(100), allowNull: false },
    area_descripcion:  { type: DataTypes.TEXT },
    area_color_hex:    { type: DataTypes.CHAR(7) },
    area_icono:        { type: DataTypes.STRING(50) },
    area_tipo_cliente: { type: DataTypes.STRING(20), defaultValue: 'individual' },
    area_activa:       { type: DataTypes.TINYINT,    defaultValue: 1 }
  }, {
    tableName: 'sv_cfg_areas_negocio',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'area_created_at',
    updatedAt: 'area_updated_at'
  });

  Area.associate = (models) => {
    Area.hasMany(models.SvGrupo,    { as: 'grupos',    foreignKey: 'grupo_area_id' });
    Area.hasMany(models.SvProducto, { as: 'productos', foreignKey: 'prod_area_id' });
    Area.hasMany(models.SvFuente,   { as: 'fuentes',   foreignKey: 'fuente_area_id' });
  };
  return Area;
};
