module.exports = (sequelize, DataTypes) => {
  const R44InfoFinanciera = sequelize.define('R44InfoFinanciera', {
    id:                     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:           { type: DataTypes.INTEGER, allowNull: false },
    activos_totales:        DataTypes.DECIMAL(20, 2),
    pasivos_totales:        DataTypes.DECIMAL(20, 2),
    patrimonio:             DataTypes.DECIMAL(20, 2),
    ingresos_operacionales: DataTypes.DECIMAL(20, 2),
    utilidad_neta:          DataTypes.DECIMAL(20, 2),
    anio_declaracion:       DataTypes.INTEGER,
  }, {
    tableName: 'r44_info_financiera',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44InfoFinanciera.associate = (models) => {
    R44InfoFinanciera.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44InfoFinanciera;
};
