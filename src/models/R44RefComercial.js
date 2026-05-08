module.exports = (sequelize, DataTypes) => {
  const R44RefComercial = sequelize.define('R44RefComercial', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER, allowNull: false },
    empresa:      { type: DataTypes.STRING(150), allowNull: false },
    contacto:     DataTypes.STRING(150),
    telefono:     DataTypes.STRING(50),
    actividad:    DataTypes.STRING(200),
  }, {
    tableName: 'r44_referencias_comerciales',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  R44RefComercial.associate = (models) => {
    R44RefComercial.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44RefComercial;
};
