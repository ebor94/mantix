// trk_ranking_snapshots — copia congelada al publicar
module.exports = (sequelize, DataTypes) => {
  const TrkRankingSnapshot = sequelize.define('TrkRankingSnapshot', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    categoria_id:  { type: DataTypes.INTEGER, allowNull: false },
    publicado_por: { type: DataTypes.INTEGER, allowNull: true },
    publicado_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    datos:         { type: DataTypes.JSON, allowNull: false }
  }, { tableName: 'trk_ranking_snapshots', freezeTableName: true, timestamps: false });

  TrkRankingSnapshot.associate = (models) => {
    TrkRankingSnapshot.belongsTo(models.TrkCategoria, { foreignKey: 'categoria_id', as: 'categoria' });
  };
  return TrkRankingSnapshot;
};
