module.exports = (sequelize, DataTypes) => {
  const R44Accionista = sequelize.define('R44Accionista', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER, allowNull: false },
    orden:        { type: DataTypes.TINYINT, defaultValue: 1 },
    tipo_documento:          DataTypes.ENUM('CC', 'PAS', 'NIT'),
    numero_documento:        DataTypes.STRING(30),
    razon_social_nombre:     DataTypes.STRING(250),
    administra_rec_publicos: { type: DataTypes.BOOLEAN, defaultValue: false },
    es_pep:                  { type: DataTypes.BOOLEAN, defaultValue: false },
    porcentaje_participacion: DataTypes.DECIMAL(5, 2),
  }, {
    tableName: 'r44_accionistas',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44Accionista.associate = (models) => {
    R44Accionista.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44Accionista;
};
