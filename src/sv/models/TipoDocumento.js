// sv/models/TipoDocumento.js — sv_cfg_tipos_documento
module.exports = (sequelize, DataTypes) => {
  const TipoDocumento = sequelize.define('SvTipoDocumento', {
    tipo_id:          { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tipo_codigo:      { type: DataTypes.STRING(40), allowNull: false, unique: true },
    tipo_nombre:      { type: DataTypes.STRING(120), allowNull: false },
    tipo_descripcion: { type: DataTypes.STRING(250) },
    tipo_obligatorio: { type: DataTypes.TINYINT, defaultValue: 0 },
    tipo_activo:      { type: DataTypes.TINYINT, defaultValue: 1 },
    tipo_orden:       { type: DataTypes.INTEGER, defaultValue: 0 }
  }, {
    tableName: 'sv_cfg_tipos_documento',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'tipo_created_at',
    updatedAt: false
  });

  TipoDocumento.associate = (models) => {
    if (models.SvEmpresaDocumento) {
      TipoDocumento.hasMany(models.SvEmpresaDocumento, { as: 'documentos', foreignKey: 'doc_tipo_id' });
    }
  };

  return TipoDocumento;
};
