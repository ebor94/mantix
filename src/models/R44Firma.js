module.exports = (sequelize, DataTypes) => {
  const R44Firma = sequelize.define('R44Firma', {
    id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:        { type: DataTypes.INTEGER, allowNull: false, unique: true },
    firma_electronica:   DataTypes.TEXT('long'),
    aceptacion_terminos: { type: DataTypes.BOOLEAN, defaultValue: false },
    ip_firma:            DataTypes.STRING(50),
    fecha_firma:         { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'r44_firma_declaracion',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  R44Firma.associate = (models) => {
    R44Firma.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44Firma;
};
