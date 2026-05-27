// sv/models/TrackingPunto.js — sv_org_tracking_puntos (INMUTABLE)
// Append-only. Solo se borran masivamente por el job de purga (>90 días).
module.exports = (sequelize, DataTypes) => {
  const TrackingPunto = sequelize.define('SvTrackingPunto', {
    tp_id:         { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    tp_jor_id:     { type: DataTypes.CHAR(36), allowNull: false },
    tp_usr_id:     { type: DataTypes.INTEGER,  allowNull: false },
    tp_fecha_hora: { type: DataTypes.DATE,     allowNull: false },  // DATETIME(3) en BD
    tp_lat:        { type: DataTypes.DECIMAL(10, 8), allowNull: false },
    tp_lng:        { type: DataTypes.DECIMAL(11, 8), allowNull: false },
    tp_precision_m: { type: DataTypes.FLOAT },
    tp_altitud:    { type: DataTypes.FLOAT },
    tp_velocidad:  { type: DataTypes.FLOAT },
    tp_bateria:    { type: DataTypes.TINYINT },
    tp_fuente:     { type: DataTypes.STRING(20), defaultValue: 'foreground' }
  }, {
    tableName: 'sv_org_tracking_puntos',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'tp_created_at',
    updatedAt: false
  });

  // Inmutabilidad: no UPDATE ni DELETE individual
  TrackingPunto.beforeUpdate(() => {
    throw new Error('Puntos de tracking son INMUTABLES.');
  });
  TrackingPunto.beforeDestroy(() => {
    throw new Error('Puntos de tracking solo pueden eliminarse en bulk por el job de purga.');
  });

  TrackingPunto.associate = (models) => {
    TrackingPunto.belongsTo(models.SvJornada, { as: 'jornada', foreignKey: 'tp_jor_id' });
    TrackingPunto.belongsTo(models.SvUsuario, { as: 'usuario', foreignKey: 'tp_usr_id' });
  };
  return TrackingPunto;
};
