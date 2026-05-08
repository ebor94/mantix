module.exports = (sequelize, DataTypes) => {
  const R44RefComercial = sequelize.define('R44RefComercial', {
    id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:       { type: DataTypes.INTEGER, allowNull: false },
    orden:              { type: DataTypes.TINYINT, defaultValue: 1 },
    empresa:            DataTypes.STRING(200),
    direccion:          DataTypes.STRING(250),
    telefono:           DataTypes.STRING(30),
    contacto:           DataTypes.STRING(200),
    ciudad:             DataTypes.STRING(100),
    actividad_relacion: DataTypes.TEXT,
  }, {
    tableName: 'r44_referencias_comerciales',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44RefComercial.associate = (models) => {
    R44RefComercial.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44RefComercial;
};
