// trk_calificacion_detalle — 0 <= puntaje <= trk_criterios.puntaje_max (validado en el servicio)
module.exports = (sequelize, DataTypes) => {
  const TrkCalificacionDetalle = sequelize.define('TrkCalificacionDetalle', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    calificacion_id: { type: DataTypes.INTEGER, allowNull: false },
    criterio_id:     { type: DataTypes.INTEGER, allowNull: false },
    puntaje:         { type: DataTypes.TINYINT.UNSIGNED, allowNull: false }
  }, { tableName: 'trk_calificacion_detalle', freezeTableName: true, timestamps: false });

  TrkCalificacionDetalle.associate = (models) => {
    TrkCalificacionDetalle.belongsTo(models.TrkCalificacion, { foreignKey: 'calificacion_id', as: 'calificacion' });
    TrkCalificacionDetalle.belongsTo(models.TrkCriterio, { foreignKey: 'criterio_id', as: 'criterio' });
  };
  return TrkCalificacionDetalle;
};
