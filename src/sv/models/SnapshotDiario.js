// sv/models/SnapshotDiario.js — sv_rpt_snapshot_diario
module.exports = (sequelize, DataTypes) => {
  const Snapshot = sequelize.define('SvSnapshotDiario', {
    snap_id:                   { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    snap_usuario_id:           { type: DataTypes.INTEGER, allowNull: false },
    snap_area_id:              { type: DataTypes.INTEGER, allowNull: false },
    snap_grupo_id:             { type: DataTypes.INTEGER, allowNull: false },
    snap_fecha:                { type: DataTypes.DATEONLY, allowNull: false },
    snap_gestiones_realizadas: { type: DataTypes.INTEGER, defaultValue: 0 },
    snap_interesados_nuevos:   { type: DataTypes.INTEGER, defaultValue: 0 },
    snap_contratos_cerrados:   { type: DataTypes.INTEGER, defaultValue: 0 },
    snap_vencidas_acumuladas:  { type: DataTypes.INTEGER, defaultValue: 0 },
    snap_valor_vendido_cop:    { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 }
  }, {
    tableName: 'sv_rpt_snapshot_diario',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'snap_created_at',
    updatedAt: 'snap_updated_at',
    indexes: [{ unique: true, fields: ['snap_usuario_id', 'snap_fecha'] }]
  });

  Snapshot.associate = (models) => {
    Snapshot.belongsTo(models.SvUsuario, { as: 'usuario', foreignKey: 'snap_usuario_id' });
    Snapshot.belongsTo(models.SvArea,    { as: 'area',    foreignKey: 'snap_area_id' });
    Snapshot.belongsTo(models.SvGrupo,   { as: 'grupo',   foreignKey: 'snap_grupo_id' });
  };
  return Snapshot;
};
