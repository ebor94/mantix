// sv/models/FechaEspecial.js — sv_crm_fechas_especiales
// Tipos válidos: nacimiento, aniversario_laboral, dia_madre, dia_padre, aniversario_boda, otro.
// Día madre/padre se derivan de persona_genero (no se insertan acá).
module.exports = (sequelize, DataTypes) => {
  const FechaEspecial = sequelize.define('SvFechaEspecial', {
    fe_id:           { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    fe_persona_id:   { type: DataTypes.INTEGER, allowNull: false },
    fe_tipo:         { type: DataTypes.STRING(30), allowNull: false },
    fe_fecha:        { type: DataTypes.DATEONLY,   allowNull: false },
    fe_descripcion:  { type: DataTypes.STRING(200) },
    fe_activa:       { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'sv_crm_fechas_especiales',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'fe_created_at',
    updatedAt: false
  });

  FechaEspecial.associate = (models) => {
    FechaEspecial.belongsTo(models.SvPersona, { as: 'persona', foreignKey: 'fe_persona_id' });
  };
  return FechaEspecial;
};
