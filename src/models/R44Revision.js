module.exports = (sequelize, DataTypes) => {
  const R44Revision = sequelize.define('R44Revision', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:    { type: DataTypes.INTEGER, allowNull: false },
    revisor_id:      DataTypes.INTEGER,
    tipo_revision:   { type: DataTypes.ENUM('compras','excelencia'), defaultValue: 'compras' },
    estado_anterior: DataTypes.STRING(50),
    estado_nuevo:    DataTypes.STRING(50),
    observaciones:   DataTypes.TEXT,
  }, {
    tableName: 'r44_revision_serfunorte',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  R44Revision.associate = (models) => {
    R44Revision.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
    R44Revision.belongsTo(models.R44Usuario,   { foreignKey: 'revisor_id',   as: 'revisor' });
  };

  return R44Revision;
};
