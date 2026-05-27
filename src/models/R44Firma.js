module.exports = (sequelize, DataTypes) => {
  const R44Firma = sequelize.define('R44Firma', {
    id:           { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
    nombre_firmante:    DataTypes.STRING(250),
    documento_firmante: DataTypes.STRING(30),
    ciudad_firma:       DataTypes.STRING(100),
    fecha_firma:        DataTypes.DATE,
    ip_firma:           DataTypes.STRING(45),
    acepta_tratamiento: { type: DataTypes.BOOLEAN, defaultValue: false },
    acepta_declaracion: { type: DataTypes.BOOLEAN, defaultValue: false },
    token_firma:        DataTypes.STRING(100),
    firma_electronica:  DataTypes.TEXT,
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
