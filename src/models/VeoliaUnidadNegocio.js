module.exports = (sequelize, DataTypes) => {
  const VeoliaUnidadNegocio = sequelize.define('VeoliaUnidadNegocio', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    nombre: {
      type: DataTypes.STRING(300),
      allowNull: false
    },
    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 1
    }
  }, {
    tableName: 'veolia_unidades_negocio',
    timestamps: false
  });

  return VeoliaUnidadNegocio;
};
