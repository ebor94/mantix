// sv/models/EmpresaDocumento.js — sv_crm_empresa_documentos
module.exports = (sequelize, DataTypes) => {
  const EmpresaDocumento = sequelize.define('SvEmpresaDocumento', {
    doc_id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    doc_empresa_id:    { type: DataTypes.INTEGER, allowNull: false },
    doc_tipo_id:       { type: DataTypes.INTEGER, allowNull: false },
    doc_nombre:        { type: DataTypes.STRING(200), allowNull: false },
    doc_archivo_url:   { type: DataTypes.STRING(255), allowNull: false },
    doc_archivo_size:  { type: DataTypes.INTEGER },
    doc_archivo_mime:  { type: DataTypes.STRING(80) },
    doc_observaciones: { type: DataTypes.TEXT },
    doc_subido_por:    { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'sv_crm_empresa_documentos',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'doc_subido_at',
    updatedAt: false
  });

  EmpresaDocumento.associate = (models) => {
    EmpresaDocumento.belongsTo(models.SvEmpresa,        { as: 'empresa', foreignKey: 'doc_empresa_id' });
    EmpresaDocumento.belongsTo(models.SvTipoDocumento,  { as: 'tipo',    foreignKey: 'doc_tipo_id' });
    EmpresaDocumento.belongsTo(models.SvUsuario,        { as: 'subidoPor', foreignKey: 'doc_subido_por' });
  };

  return EmpresaDocumento;
};
