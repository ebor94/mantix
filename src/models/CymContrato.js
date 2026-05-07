module.exports = (sequelize, DataTypes) => {
  const CymContrato = sequelize.define('CymContrato', {
    id:                   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    predio_id:            { type: DataTypes.INTEGER, allowNull: false },
    contratante_cedula:   { type: DataTypes.STRING(20),  allowNull: false },
    contratante_nombre:   { type: DataTypes.STRING(200), allowNull: false },
    contratante_telefono: { type: DataTypes.STRING(20) },
    contratante_correo:   { type: DataTypes.STRING(150) },
    contratante_dir:      { type: DataTypes.STRING(300) },
    vigencia:             { type: DataTypes.ENUM('trimestral','semestral','anual','bianual'), allowNull: false },
    fecha_contratacion:   { type: DataTypes.DATEONLY, allowNull: false },
    fecha_vencimiento:    { type: DataTypes.DATEONLY, allowNull: false },
    estado:               { type: DataTypes.ENUM('activo','vencido','cerrado','cancelado'), defaultValue: 'activo' },
    motivo_cancelacion:   { type: DataTypes.STRING(500) }
  }, {
    tableName: 'cym_contratos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  CymContrato.associate = (models) => {
    CymContrato.belongsTo(models.CymPredio, { foreignKey: 'predio_id', as: 'predio' });
    CymContrato.hasMany(models.CymMantenimiento, { foreignKey: 'contrato_id', as: 'mantenimientos' });
    CymContrato.hasMany(models.CymCartera, { foreignKey: 'contrato_id', as: 'gestiones_cartera' });
  };

  return CymContrato;
};
