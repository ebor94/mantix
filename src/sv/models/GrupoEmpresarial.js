// sv/models/GrupoEmpresarial.js — sv_crm_grupos_empresariales (migración 017)
// Grupo económico al que una empresa puede pertenecer (ej. Grupo Éxito, Grupo Bolívar).
// Una empresa puede estar en N grupos? No: el modelo actual es N:1 (una empresa
// pertenece a 0 o 1 grupo). Si más adelante se requiere N:N, se evoluciona a tabla pivote.
module.exports = (sequelize, DataTypes) => {
  const GrupoEmpresarial = sequelize.define('SvGrupoEmpresarial', {
    grupemp_id:          { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    grupemp_nombre:      { type: DataTypes.STRING(180), allowNull: false, unique: true },
    grupemp_descripcion: { type: DataTypes.STRING(500) },
    grupemp_activo:      { type: DataTypes.TINYINT, defaultValue: 1 },
    grupemp_creado_por:  { type: DataTypes.INTEGER }
  }, {
    tableName: 'sv_crm_grupos_empresariales',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'grupemp_created_at',
    updatedAt: 'grupemp_updated_at'
  });

  GrupoEmpresarial.associate = (models) => {
    GrupoEmpresarial.hasMany(models.SvEmpresa, { as: 'empresas', foreignKey: 'empresa_grupo_empresarial_id' });
    if (models.SvUsuario) {
      GrupoEmpresarial.belongsTo(models.SvUsuario, { as: 'creadoPor', foreignKey: 'grupemp_creado_por' });
    }
  };

  return GrupoEmpresarial;
};
