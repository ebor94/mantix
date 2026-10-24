// trk_categorias
module.exports = (sequelize, DataTypes) => {
  const TrkCategoria = sequelize.define('TrkCategoria', {
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codigo:            { type: DataTypes.STRING(20), allowNull: false },
    nombre:            { type: DataTypes.STRING(100), allowNull: false },
    color:             { type: DataTypes.CHAR(7), allowNull: true },
    rubrica_id:        { type: DataTypes.INTEGER, allowNull: false },
    abierta:           { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ranking_publicado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    orden:             { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    puestos_premiados: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 3 }
  }, { tableName: 'trk_categorias', freezeTableName: true, timestamps: false });

  TrkCategoria.associate = (models) => {
    TrkCategoria.belongsTo(models.TrkRubrica, { foreignKey: 'rubrica_id', as: 'rubrica' });
  };
  return TrkCategoria;
};
