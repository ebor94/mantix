// trk_criterios — puntaje_max y peso_desempate son datos (seed), nunca constantes.
module.exports = (sequelize, DataTypes) => {
  const TrkCriterio = sequelize.define('TrkCriterio', {
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    rubrica_id:     { type: DataTypes.INTEGER, allowNull: false },
    codigo:         { type: DataTypes.STRING(30), allowNull: false },
    nombre:         { type: DataTypes.STRING(100), allowNull: false },
    descripcion:    { type: DataTypes.STRING(255), allowNull: false },
    puntaje_max:    { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    orden:          { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    peso_desempate: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true }
  }, { tableName: 'trk_criterios', freezeTableName: true, timestamps: false });

  TrkCriterio.associate = (models) => {
    TrkCriterio.belongsTo(models.TrkRubrica, { foreignKey: 'rubrica_id', as: 'rubrica' });
  };
  return TrkCriterio;
};
