// sv/models/Grupo.js — sv_cfg_grupos_trabajo
module.exports = (sequelize, DataTypes) => {
  const Grupo = sequelize.define('SvGrupo', {
    grupo_id:           { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    grupo_area_id:      { type: DataTypes.INTEGER, allowNull: false },
    grupo_codigo:       { type: DataTypes.STRING(30),  allowNull: false, unique: true },
    grupo_nombre:       { type: DataTypes.STRING(100), allowNull: false },
    grupo_tipo_venta:   { type: DataTypes.STRING(20), defaultValue: 'individual' },
    grupo_meta_default: { type: DataTypes.INTEGER, defaultValue: 0 },
    grupo_activo:       { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'sv_cfg_grupos_trabajo',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'grupo_created_at',
    updatedAt: false
  });

  Grupo.associate = (models) => {
    Grupo.belongsTo(models.SvArea, { as: 'area', foreignKey: 'grupo_area_id' });
    Grupo.hasMany(models.SvEstado,    { as: 'estados',    foreignKey: 'estado_grupo_id' });
    Grupo.hasMany(models.SvResultado, { as: 'resultados', foreignKey: 'resultado_grupo_id' });
  };
  return Grupo;
};
