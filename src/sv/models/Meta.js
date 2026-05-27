// sv/models/Meta.js — sv_org_metas
module.exports = (sequelize, DataTypes) => {
  const Meta = sequelize.define('SvMeta', {
    meta_id:         { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    meta_usuario_id: { type: DataTypes.INTEGER },
    meta_grupo_id:   { type: DataTypes.INTEGER },
    meta_anio:       { type: DataTypes.SMALLINT, allowNull: false },
    meta_mes:        { type: DataTypes.SMALLINT, allowNull: false },
    meta_contratos:  { type: DataTypes.INTEGER, defaultValue: 0 },
    meta_gestiones:  { type: DataTypes.INTEGER, defaultValue: 0 },
    meta_valor_cop:  { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    meta_created_by: { type: DataTypes.INTEGER }
  }, {
    tableName: 'sv_org_metas',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'meta_created_at',
    updatedAt: false
  });

  Meta.associate = (models) => {
    Meta.belongsTo(models.SvUsuario, { as: 'usuario', foreignKey: 'meta_usuario_id' });
    Meta.belongsTo(models.SvGrupo,   { as: 'grupo',   foreignKey: 'meta_grupo_id' });
    Meta.belongsTo(models.SvUsuario, { as: 'creador', foreignKey: 'meta_created_by' });
  };
  return Meta;
};
