module.exports = (sequelize, DataTypes) => {
  const R44RefBancaria = sequelize.define('R44RefBancaria', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:  { type: DataTypes.INTEGER, allowNull: false },
    entidad:       { type: DataTypes.STRING(150), allowNull: false },
    tipo_cuenta:   { type: DataTypes.ENUM('Corriente','Ahorros','CDT'), allowNull: false },
    numero_cuenta: DataTypes.STRING(30),
    ciudad:        DataTypes.STRING(100),
  }, {
    tableName: 'r44_referencias_bancarias',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  R44RefBancaria.associate = (models) => {
    R44RefBancaria.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44RefBancaria;
};
