// sv/models/ContactoFideliz.js — sv_crm_contactos_fideliz
// Pivote N:M empresa↔persona con datos contextuales (cargo, departamento).
module.exports = (sequelize, DataTypes) => {
  const ContactoFideliz = sequelize.define('SvContactoFideliz', {
    cf_id:             { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    cf_empresa_id:     { type: DataTypes.INTEGER, allowNull: false },
    cf_persona_id:     { type: DataTypes.INTEGER, allowNull: false },
    cf_cargo:          { type: DataTypes.STRING(120) },
    cf_departamento:   { type: DataTypes.STRING(120) },
    cf_fecha_ingreso:  { type: DataTypes.DATEONLY },
    cf_es_titular:     { type: DataTypes.TINYINT, defaultValue: 0 },
    cf_observaciones:  { type: DataTypes.TEXT },
    cf_activo:         { type: DataTypes.TINYINT, defaultValue: 1 },
    cf_capturado_por:  { type: DataTypes.INTEGER }
  }, {
    tableName: 'sv_crm_contactos_fideliz',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'cf_created_at',
    updatedAt: 'cf_updated_at'
  });

  ContactoFideliz.associate = (models) => {
    ContactoFideliz.belongsTo(models.SvEmpresa, { as: 'empresa',  foreignKey: 'cf_empresa_id' });
    ContactoFideliz.belongsTo(models.SvPersona, { as: 'persona',  foreignKey: 'cf_persona_id' });
    ContactoFideliz.belongsTo(models.SvUsuario, { as: 'capturadoPor', foreignKey: 'cf_capturado_por' });
  };
  return ContactoFideliz;
};
