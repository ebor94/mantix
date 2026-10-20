// trk_calificaciones — una por (participante, jurado); total lo calcula siempre el servidor.
module.exports = (sequelize, DataTypes) => {
  const TrkCalificacion = sequelize.define('TrkCalificacion', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    participante_id: { type: DataTypes.UUID, allowNull: false },
    jurado_id:       { type: DataTypes.INTEGER, allowNull: false },
    total:           { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    enviada_at:      { type: DataTypes.DATE, allowNull: false },
    bloqueada:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    desbloqueada_at: { type: DataTypes.DATE, allowNull: true },
    created_at:      { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:      { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'trk_calificaciones',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  TrkCalificacion.associate = (models) => {
    TrkCalificacion.belongsTo(models.TrkParticipante, { foreignKey: 'participante_id', as: 'participante' });
    TrkCalificacion.belongsTo(models.Usuario, { foreignKey: 'jurado_id', as: 'jurado' });
    TrkCalificacion.hasMany(models.TrkCalificacionDetalle, { foreignKey: 'calificacion_id', as: 'detalles' });
  };
  return TrkCalificacion;
};
