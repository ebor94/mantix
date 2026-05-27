// sv/models/Lista.js — sv_crm_listas
module.exports = (sequelize, DataTypes) => {
  const Lista = sequelize.define('SvLista', {
    lista_id:              { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lista_area_id:         { type: DataTypes.INTEGER, allowNull: false },
    lista_grupo_id:        { type: DataTypes.INTEGER },
    lista_fuente_id:       { type: DataTypes.INTEGER },
    lista_cargada_por:     { type: DataTypes.INTEGER, allowNull: false },
    lista_nombre:          { type: DataTypes.STRING(150), allowNull: false },
    lista_total_registros: { type: DataTypes.INTEGER, defaultValue: 0 },
    lista_importadas:      { type: DataTypes.INTEGER, defaultValue: 0 },
    lista_duplicados_omit: { type: DataTypes.INTEGER, defaultValue: 0 },
    lista_errores:         { type: DataTypes.INTEGER, defaultValue: 0 },
    lista_estado:          { type: DataTypes.STRING(20), defaultValue: 'pendiente' },
    lista_archivo_url:     { type: DataTypes.STRING(255) },
    lista_log:             { type: DataTypes.JSON },
    lista_fecha_carga:     { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
    lista_activa:          { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'sv_crm_listas',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'lista_created_at',
    updatedAt: false
  });

  Lista.associate = (models) => {
    Lista.belongsTo(models.SvArea,    { as: 'area',    foreignKey: 'lista_area_id' });
    Lista.belongsTo(models.SvGrupo,   { as: 'grupo',   foreignKey: 'lista_grupo_id' });
    Lista.belongsTo(models.SvFuente,  { as: 'fuente',  foreignKey: 'lista_fuente_id' });
    Lista.belongsTo(models.SvUsuario, { as: 'cargadaPor', foreignKey: 'lista_cargada_por' });
    Lista.hasMany(models.SvProspecto, { as: 'prospectos', foreignKey: 'prosp_lista_id' });
  };
  return Lista;
};
