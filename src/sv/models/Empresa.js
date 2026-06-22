// sv/models/Empresa.js — sv_crm_empresas
module.exports = (sequelize, DataTypes) => {
  const Empresa = sequelize.define('SvEmpresa', {
    empresa_id:                { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    empresa_nit:               { type: DataTypes.STRING(20), allowNull: false },
    empresa_nit_norm:          { type: DataTypes.STRING(20), allowNull: false, unique: true },
    empresa_dv:                { type: DataTypes.STRING(2) },
    empresa_razon_social:      { type: DataTypes.STRING(200), allowNull: false },
    empresa_nombre_comercial:  { type: DataTypes.STRING(200) },
    empresa_sector:            { type: DataTypes.STRING(80) },
    empresa_num_empleados:     { type: DataTypes.INTEGER },
    empresa_telefono:          { type: DataTypes.STRING(20) },
    empresa_email_corporativo: { type: DataTypes.STRING(150) },
    empresa_sitio_web:         { type: DataTypes.STRING(200) },
    empresa_direccion:         { type: DataTypes.STRING(250) },
    empresa_ciudad:            { type: DataTypes.STRING(80), defaultValue: 'Cucuta' },
    empresa_nota:              { type: DataTypes.TEXT },
    empresa_activa:            { type: DataTypes.TINYINT, defaultValue: 1 },
    // Categoría de fidelización (manual por empresa) — migración 015
    empresa_categoria:             { type: DataTypes.STRING(20) }, // BRONCE|PLATA|ORO|PLATINO|DIAMANTE
    empresa_presupuesto_fideliz:   { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    empresa_presupuesto_gastado:   { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    // Migración 017: categorización + grupo económico
    empresa_tipo_id:               { type: DataTypes.INTEGER },
    empresa_grupo_empresarial_id:  { type: DataTypes.INTEGER },
    // Migración 019: periodicidad de seguimiento post-firma
    empresa_periodicidad_seguimiento: { type: DataTypes.STRING(20) }   // BIMENSUAL|TRIMESTRAL|ANUAL|null
  }, {
    tableName: 'sv_crm_empresas',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'empresa_created_at',
    updatedAt: 'empresa_updated_at'
  });

  Empresa.associate = (models) => {
    Empresa.hasMany(models.SvProspecto, { as: 'prospectos', foreignKey: 'prosp_empresa_id' });
    Empresa.hasMany(models.SvPropuesta, { as: 'propuestas', foreignKey: 'prop_empresa_id' });
    // Migración 017
    if (models.SvTipoEmpresa) {
      Empresa.belongsTo(models.SvTipoEmpresa, { as: 'tipo', foreignKey: 'empresa_tipo_id' });
    }
    if (models.SvGrupoEmpresarial) {
      Empresa.belongsTo(models.SvGrupoEmpresarial, { as: 'grupoEmpresarial', foreignKey: 'empresa_grupo_empresarial_id' });
    }
    // Fase 6: Fidelización
    if (models.SvContactoFideliz) {
      Empresa.hasMany(models.SvContactoFideliz, { as: 'contactosFideliz', foreignKey: 'cf_empresa_id' });
    }
    if (models.SvEnvio) {
      Empresa.hasMany(models.SvEnvio, { as: 'envios', foreignKey: 'env_empresa_id' });
    }
    // Migración 015: documentos, propuestas archivo, movimientos presupuesto
    if (models.SvEmpresaDocumento) {
      Empresa.hasMany(models.SvEmpresaDocumento, { as: 'documentos', foreignKey: 'doc_empresa_id' });
    }
    if (models.SvEmpresaPropuestaArchivo) {
      Empresa.hasMany(models.SvEmpresaPropuestaArchivo, { as: 'propuestasArchivo', foreignKey: 'prop_empresa_id' });
    }
    if (models.SvFidelizMovimiento) {
      Empresa.hasMany(models.SvFidelizMovimiento, { as: 'movimientosFideliz', foreignKey: 'mov_empresa_id' });
    }
  };
  return Empresa;
};
