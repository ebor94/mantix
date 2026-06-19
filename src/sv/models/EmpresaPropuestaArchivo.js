// sv/models/EmpresaPropuestaArchivo.js — sv_crm_empresa_propuestas
// Reemplaza la generación PDF (SvPropuesta) por upload de archivos.
module.exports = (sequelize, DataTypes) => {
  const EmpresaPropuestaArchivo = sequelize.define('SvEmpresaPropuestaArchivo', {
    prop_id:             { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    prop_empresa_id:     { type: DataTypes.INTEGER, allowNull: false },
    prop_titulo:         { type: DataTypes.STRING(200), allowNull: false },
    prop_descripcion:    { type: DataTypes.TEXT },
    prop_tipo:           { type: DataTypes.STRING(30), defaultValue: 'vinculacion' }, // vinculacion|renovacion|adendum|otro
    prop_archivo_url:    { type: DataTypes.STRING(255), allowNull: false },
    prop_archivo_size:   { type: DataTypes.INTEGER },
    prop_archivo_mime:   { type: DataTypes.STRING(80) },
    prop_valor:          { type: DataTypes.DECIMAL(15, 2) },
    prop_vigencia_desde: { type: DataTypes.DATEONLY },
    prop_vigencia_hasta: { type: DataTypes.DATEONLY },
    prop_subido_por:     { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'sv_crm_empresa_propuestas',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'prop_subido_at',
    updatedAt: false
  });

  EmpresaPropuestaArchivo.associate = (models) => {
    EmpresaPropuestaArchivo.belongsTo(models.SvEmpresa, { as: 'empresa',   foreignKey: 'prop_empresa_id' });
    EmpresaPropuestaArchivo.belongsTo(models.SvUsuario, { as: 'subidoPor', foreignKey: 'prop_subido_por' });
  };

  return EmpresaPropuestaArchivo;
};
