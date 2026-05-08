module.exports = (sequelize, DataTypes) => {
  const R44Documento = sequelize.define('R44Documento', {
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:   { type: DataTypes.INTEGER, allowNull: false },
    tipo_documento: { type: DataTypes.ENUM('rut','camara','renta','cedula'), allowNull: false },
    nombre_archivo: { type: DataTypes.STRING(255), allowNull: false },
    ruta_archivo:   { type: DataTypes.STRING(500), allowNull: false },
    mime_type:      DataTypes.STRING(100),
    tamano_bytes:   DataTypes.BIGINT,
  }, {
    tableName: 'r44_documentos_adjuntos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  R44Documento.associate = (models) => {
    R44Documento.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44Documento;
};
