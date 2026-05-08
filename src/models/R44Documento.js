module.exports = (sequelize, DataTypes) => {
  const R44Documento = sequelize.define('R44Documento', {
    id:           { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    tipo_documento: {
      type: DataTypes.ENUM('rut','camara_comercio','declaracion_renta','cedula_rl','sarlaft_certificacion','otro'),
      allowNull: false,
    },
    nombre_archivo_original:  DataTypes.STRING(255),
    nombre_archivo_storage:   DataTypes.STRING(255),
    ruta_almacenamiento:      DataTypes.STRING(500),
    tamano_bytes:             DataTypes.INTEGER.UNSIGNED,
    mime_type:                DataTypes.STRING(100),
    hash_sha256:              DataTypes.CHAR(64),
    estado_extraccion: {
      type: DataTypes.ENUM('pendiente','procesando','completado','error'),
      defaultValue: 'pendiente',
    },
    intentos_extraccion: { type: DataTypes.TINYINT, defaultValue: 0 },
    error_mensaje:  DataTypes.TEXT,
    procesado_at:   DataTypes.DATE,
  }, {
    tableName: 'r44_documentos_adjuntos',
    timestamps: true,
    createdAt:  'subido_at',
    updatedAt:  false,
  });

  R44Documento.associate = (models) => {
    R44Documento.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44Documento;
};
