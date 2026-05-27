module.exports = (sequelize, DataTypes) => {
  const R44Revision = sequelize.define('R44Revision', {
    id:           { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
    fecha_entrevista:          DataTypes.DATEONLY,
    funcionario_entrevista:    DataTypes.STRING(200),
    resultado_entrevista:      DataTypes.ENUM('aceptado','rechazado','pendiente'),
    fecha_verificacion:        DataTypes.DATEONLY,
    funcionario_verificacion:  DataTypes.STRING(200),
    resultado_verificacion:    DataTypes.ENUM('aceptado','rechazado','pendiente'),
    observaciones:             DataTypes.TEXT,
    verificado_listas:         { type: DataTypes.BOOLEAN, defaultValue: false },
    listas_verificadas:        DataTypes.STRING(500),
    fecha_verificacion_listas: DataTypes.DATE,
  }, {
    tableName: 'r44_revision_serfunorte',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44Revision.associate = (models) => {
    R44Revision.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44Revision;
};
