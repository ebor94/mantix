module.exports = (sequelize, DataTypes) => {
  const R44ExtraccionLlm = sequelize.define('R44ExtraccionLlm', {
    id:           { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    documento_id: DataTypes.INTEGER.UNSIGNED,
    tipo_documento: DataTypes.ENUM('rut','camara_comercio','declaracion_renta','consolidado'),
    prompt_version: { type: DataTypes.STRING(20), defaultValue: 'v1' },
    modelo_usado:   { type: DataTypes.STRING(60), defaultValue: 'claude-opus-4-5' },
    tokens_entrada: DataTypes.INTEGER.UNSIGNED,
    tokens_salida:  DataTypes.INTEGER.UNSIGNED,
    tokens_total:   DataTypes.INTEGER.UNSIGNED,
    respuesta_json: DataTypes.JSON,
    estado: {
      type: DataTypes.ENUM('ok','error_parseo','error_api','timeout'),
      defaultValue: 'ok',
    },
    error_detalle:    DataTypes.TEXT,
    revisado:         { type: DataTypes.BOOLEAN, defaultValue: false },
    revisado_por:     DataTypes.INTEGER.UNSIGNED,
    revisado_at:      DataTypes.DATE,
    notas_revision:   DataTypes.TEXT,
  }, {
    tableName: 'r44_extraccion_llm',
    timestamps: true,
    createdAt:  'procesado_at',
    updatedAt:  false,
  });

  R44ExtraccionLlm.associate = (models) => {
    R44ExtraccionLlm.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44ExtraccionLlm;
};
