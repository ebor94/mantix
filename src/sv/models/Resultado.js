// sv/models/Resultado.js — sv_cfg_resultados_gestion
module.exports = (sequelize, DataTypes) => {
  const Resultado = sequelize.define('SvResultado', {
    resultado_id:             { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    resultado_grupo_id:       { type: DataTypes.INTEGER, allowNull: false },
    resultado_codigo:         { type: DataTypes.STRING(30), allowNull: false },
    resultado_nombre:         { type: DataTypes.STRING(80), allowNull: false },
    resultado_icono:          { type: DataTypes.STRING(10) },
    resultado_es_positivo:    { type: DataTypes.TINYINT, defaultValue: 1 },
    resultado_requiere_fecha: { type: DataTypes.TINYINT, defaultValue: 0 },
    resultado_orden:          { type: DataTypes.SMALLINT, defaultValue: 0 },
    resultado_activo:         { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'sv_cfg_resultados_gestion',
    freezeTableName: true,
    timestamps: false
  });

  Resultado.associate = (models) => {
    Resultado.belongsTo(models.SvGrupo, { as: 'grupo', foreignKey: 'resultado_grupo_id' });
  };
  return Resultado;
};
