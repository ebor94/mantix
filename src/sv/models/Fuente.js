// sv/models/Fuente.js — sv_cfg_fuentes_prospecto
module.exports = (sequelize, DataTypes) => {
  const Fuente = sequelize.define('SvFuente', {
    fuente_id:        { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    fuente_area_id:   { type: DataTypes.INTEGER, allowNull: false },
    fuente_codigo:    { type: DataTypes.STRING(30), allowNull: false },
    fuente_nombre:    { type: DataTypes.STRING(80), allowNull: false },
    fuente_es_masiva: { type: DataTypes.TINYINT, defaultValue: 0 },
    fuente_activa:    { type: DataTypes.TINYINT, defaultValue: 1 },
    fuente_orden:     { type: DataTypes.SMALLINT, defaultValue: 0 }
  }, {
    tableName: 'sv_cfg_fuentes_prospecto',
    freezeTableName: true,
    timestamps: false
  });

  Fuente.associate = (models) => {
    Fuente.belongsTo(models.SvArea, { as: 'area', foreignKey: 'fuente_area_id' });
  };
  return Fuente;
};
