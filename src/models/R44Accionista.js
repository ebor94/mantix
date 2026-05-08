module.exports = (sequelize, DataTypes) => {
  const R44Accionista = sequelize.define('R44Accionista', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:{ type: DataTypes.INTEGER, allowNull: false },
    nombre:      { type: DataTypes.STRING(200), allowNull: false },
    cedula_nit:  DataTypes.STRING(20),
    porcentaje:  DataTypes.DECIMAL(5, 2),
  }, {
    tableName: 'r44_accionistas',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  R44Accionista.associate = (models) => {
    R44Accionista.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44Accionista;
};
