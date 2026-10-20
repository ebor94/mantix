// trk_rubricas
module.exports = (sequelize, DataTypes) => {
  const TrkRubrica = sequelize.define('TrkRubrica', {
    id:     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING(20), allowNull: false },
    nombre: { type: DataTypes.STRING(100), allowNull: false }
  }, { tableName: 'trk_rubricas', freezeTableName: true, timestamps: false });

  TrkRubrica.associate = (models) => {
    TrkRubrica.hasMany(models.TrkCriterio, { foreignKey: 'rubrica_id', as: 'criterios' });
  };
  return TrkRubrica;
};
