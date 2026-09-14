// sv/models/JornadaAusencia.js — sv_org_jornadas_ausencias (migración 019)
// Ausencias declaradas por el popup obligatorio de jornada.
module.exports = (sequelize, DataTypes) => {
  const JornadaAusencia = sequelize.define('SvJornadaAusencia', {
    aus_id:      { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    aus_usr_id:  { type: DataTypes.INTEGER, allowNull: false },
    aus_fecha:   { type: DataTypes.DATEONLY, allowNull: false },
    aus_tipo:    { type: DataTypes.STRING(30), allowNull: false },
    aus_motivo:  { type: DataTypes.TEXT, allowNull: false }
  }, {
    tableName: 'sv_org_jornadas_ausencias',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'aus_created_at',
    updatedAt: false
  });

  JornadaAusencia.associate = (models) => {
    JornadaAusencia.belongsTo(models.SvUsuario, { as: 'usuario', foreignKey: 'aus_usr_id' });
  };
  return JornadaAusencia;
};
