// sv/models/Propuesta.js — sv_sales_propuestas
module.exports = (sequelize, DataTypes) => {
  const Propuesta = sequelize.define('SvPropuesta', {
    prop_id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    prop_numero:        { type: DataTypes.STRING(30), allowNull: false, unique: true },
    prop_prospecto_id:  { type: DataTypes.INTEGER, allowNull: false },
    prop_empresa_id:    { type: DataTypes.INTEGER },
    prop_contacto_id:   { type: DataTypes.INTEGER },
    prop_creado_por:    { type: DataTypes.INTEGER, allowNull: false },
    prop_valor_total:   { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    prop_descuento_pct: { type: DataTypes.DECIMAL(5, 2),  defaultValue: 0 },
    prop_vigencia_dias: { type: DataTypes.SMALLINT, defaultValue: 30 },
    prop_fecha_envio:   { type: DataTypes.DATE },
    prop_canal_envio:   { type: DataTypes.STRING(20) },
    prop_destinatario:  { type: DataTypes.STRING(200) },
    prop_estado:        { type: DataTypes.STRING(20), defaultValue: 'borrador' },
    prop_archivo_url:   { type: DataTypes.STRING(255) },
    prop_notas:         { type: DataTypes.TEXT }
  }, {
    tableName: 'sv_sales_propuestas',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'prop_created_at',
    updatedAt: 'prop_updated_at'
  });

  Propuesta.associate = (models) => {
    Propuesta.belongsTo(models.SvProspecto, { as: 'prospecto', foreignKey: 'prop_prospecto_id' });
    Propuesta.belongsTo(models.SvEmpresa,   { as: 'empresa',   foreignKey: 'prop_empresa_id' });
    Propuesta.belongsTo(models.SvPersona,   { as: 'contacto',  foreignKey: 'prop_contacto_id' });
    Propuesta.belongsTo(models.SvUsuario,   { as: 'creador',   foreignKey: 'prop_creado_por' });
    Propuesta.hasMany(models.SvPropuestaItem, { as: 'items', foreignKey: 'pi_prop_id' });
  };
  return Propuesta;
};
