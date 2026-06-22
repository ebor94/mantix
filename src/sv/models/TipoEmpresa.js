// sv/models/TipoEmpresa.js — sv_cfg_tipos_empresa (migración 017)
// Catálogo parametrizable: Grupo / Grupo Recaudo / Mixta (extensible).
// En UI se etiqueta como "Categoría"; en BD es "tipo" para no chocar con
// `empresa_categoria` (tier de fidelización: BRONCE/PLATA/ORO/PLATINO/DIAMANTE).
module.exports = (sequelize, DataTypes) => {
  const TipoEmpresa = sequelize.define('SvTipoEmpresa', {
    tipoemp_id:          { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    tipoemp_codigo:      { type: DataTypes.STRING(40),  allowNull: false, unique: true },
    tipoemp_nombre:      { type: DataTypes.STRING(120), allowNull: false },
    tipoemp_descripcion: { type: DataTypes.STRING(250) },
    tipoemp_orden:       { type: DataTypes.INTEGER, defaultValue: 0 },
    tipoemp_activo:      { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'sv_cfg_tipos_empresa',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'tipoemp_created_at',
    updatedAt: 'tipoemp_updated_at'
  });

  TipoEmpresa.associate = (models) => {
    TipoEmpresa.hasMany(models.SvEmpresa, { as: 'empresas', foreignKey: 'empresa_tipo_id' });
  };

  return TipoEmpresa;
};
