module.exports = (sequelize, DataTypes) => {
  const R44ExtraccionLlm = sequelize.define('R44ExtraccionLlm', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:    { type: DataTypes.INTEGER, allowNull: false },
    tipo_documento:  DataTypes.STRING(20),
    estado:          { type: DataTypes.ENUM('pendiente','procesando','completado','error'), defaultValue: 'pendiente' },
    datos_extraidos: DataTypes.JSON,
    tokens_usados:   DataTypes.INTEGER,
    duracion_ms:     DataTypes.INTEGER,
    error_mensaje:   DataTypes.TEXT,
  }, {
    tableName: 'r44_extraccion_llm',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44ExtraccionLlm.associate = (models) => {
    R44ExtraccionLlm.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44ExtraccionLlm;
};
