// sv/models/Estado.js — sv_cfg_estados_gestion
module.exports = (sequelize, DataTypes) => {
  const Estado = sequelize.define('SvEstado', {
    estado_id:             { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    estado_grupo_id:       { type: DataTypes.INTEGER, allowNull: false },
    estado_codigo:         { type: DataTypes.STRING(30), allowNull: false },
    estado_nombre:         { type: DataTypes.STRING(80), allowNull: false },
    estado_color_hex:      { type: DataTypes.CHAR(7) },
    estado_es_final:       { type: DataTypes.TINYINT, defaultValue: 0 },
    estado_es_ganado:      { type: DataTypes.TINYINT, defaultValue: 0 },
    estado_requiere_fecha: { type: DataTypes.TINYINT, defaultValue: 0 },
    estado_orden:          { type: DataTypes.SMALLINT, defaultValue: 0 },
    estado_activo:         { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'sv_cfg_estados_gestion',
    freezeTableName: true,
    timestamps: false,
    indexes: [{ unique: true, fields: ['estado_grupo_id', 'estado_codigo'] }]
  });

  Estado.associate = (models) => {
    Estado.belongsTo(models.SvGrupo, { as: 'grupo', foreignKey: 'estado_grupo_id' });
  };
  return Estado;
};
