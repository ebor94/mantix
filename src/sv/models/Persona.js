// sv/models/Persona.js — sv_crm_personas
module.exports = (sequelize, DataTypes) => {
  const Persona = sequelize.define('SvPersona', {
    persona_id:                 { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    persona_nombre:             { type: DataTypes.STRING(100), allowNull: false },
    persona_apellido:           { type: DataTypes.STRING(100) },
    persona_telefono_principal: { type: DataTypes.STRING(20), allowNull: false },
    persona_telefono_norm:      { type: DataTypes.STRING(20), allowNull: false, unique: true },
    persona_telefono_alterno:   { type: DataTypes.STRING(20) },
    persona_email:              { type: DataTypes.STRING(150) },
    persona_documento_tipo:     { type: DataTypes.STRING(10) },
    persona_documento_num:      { type: DataTypes.STRING(20) },
    persona_direccion:          { type: DataTypes.STRING(250) },
    persona_barrio:             { type: DataTypes.STRING(100) },
    persona_ciudad:             { type: DataTypes.STRING(80), defaultValue: 'Cucuta' },
    // Fase 6: Fidelización Empresas
    persona_fecha_nacimiento:   { type: DataTypes.DATEONLY },
    persona_genero:             { type: DataTypes.CHAR(1) }   // 'M' | 'F' | 'N'
  }, {
    tableName: 'sv_crm_personas',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'persona_created_at',
    updatedAt: 'persona_updated_at'
  });

  Persona.associate = (models) => {
    Persona.hasMany(models.SvProspecto, { as: 'prospectos', foreignKey: 'prosp_persona_id' });
    // Fase 6: Fidelización
    if (models.SvContactoFideliz) {
      Persona.hasMany(models.SvContactoFideliz, { as: 'contactosFideliz', foreignKey: 'cf_persona_id' });
    }
    if (models.SvFechaEspecial) {
      Persona.hasMany(models.SvFechaEspecial, { as: 'fechasEspeciales', foreignKey: 'fe_persona_id' });
    }
    if (models.SvEnvio) {
      Persona.hasMany(models.SvEnvio, { as: 'envios', foreignKey: 'env_persona_id' });
    }
  };
  return Persona;
};
