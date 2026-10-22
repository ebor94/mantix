// trk_borradores — puntajes tentativos privados de cada jurado (HU-8b). No cuentan en el ranking (CA9).
module.exports = (sequelize, DataTypes) => {
  const TrkBorrador = sequelize.define('TrkBorrador', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    participante_id: { type: DataTypes.UUID, allowNull: false },
    jurado_id:       { type: DataTypes.INTEGER, allowNull: false },
    criterio_id:     { type: DataTypes.INTEGER, allowNull: false },
    puntaje:         { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
    updated_at:      { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'trk_borradores',
    freezeTableName: true,
    timestamps: true,
    createdAt: false,
    updatedAt: 'updated_at'
  });

  TrkBorrador.associate = (models) => {
    TrkBorrador.belongsTo(models.TrkParticipante, { foreignKey: 'participante_id', as: 'participante' });
    TrkBorrador.belongsTo(models.Usuario, { foreignKey: 'jurado_id', as: 'jurado' });
    TrkBorrador.belongsTo(models.TrkCriterio, { foreignKey: 'criterio_id', as: 'criterio' });
  };
  return TrkBorrador;
};
