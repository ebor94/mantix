// sv/models/Prospecto.js — sv_crm_prospectos
module.exports = (sequelize, DataTypes) => {
  const Prospecto = sequelize.define('SvProspecto', {
    prosp_id:                  { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    prosp_area_id:             { type: DataTypes.INTEGER, allowNull: false },
    prosp_grupo_id:            { type: DataTypes.INTEGER, allowNull: false },
    prosp_persona_id:          { type: DataTypes.INTEGER },
    prosp_empresa_id:          { type: DataTypes.INTEGER },
    prosp_contacto_empresa_id: { type: DataTypes.INTEGER },
    prosp_asesor_id:           { type: DataTypes.INTEGER, allowNull: true },  // null = sin asignar (cola supervisor SVC)
    prosp_estado_id:           { type: DataTypes.INTEGER, allowNull: false },
    prosp_fuente_id:           { type: DataTypes.INTEGER },
    prosp_punto_id:            { type: DataTypes.INTEGER },
    prosp_lista_id:            { type: DataTypes.INTEGER },
    prosp_prox_gestion_fecha:  { type: DataTypes.DATEONLY },
    prosp_prox_gestion_hora:   { type: DataTypes.TIME },
    // Fase 8: vigencia de convenios B2B
    prosp_fecha_inicio_convenio:      { type: DataTypes.DATEONLY },
    prosp_fecha_vencimiento_convenio: { type: DataTypes.DATEONLY },
    prosp_origen_prosp_id:            { type: DataTypes.INTEGER },  // FK al convenio original cuando es renovación
    prosp_prioridad:           { type: DataTypes.SMALLINT, defaultValue: 3 },
    prosp_zona_pap:            { type: DataTypes.STRING(100) },
    prosp_subproceso:          { type: DataTypes.STRING(20) },   // SVC: 'nuevo' | 'recuperacion'
    prosp_nota_inicial:        { type: DataTypes.TEXT },
    prosp_activo:              { type: DataTypes.TINYINT, defaultValue: 1 },
    prosp_sap_contrato_id:     { type: DataTypes.STRING(50) }
  }, {
    tableName: 'sv_crm_prospectos',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'prosp_created_at',
    updatedAt: 'prosp_updated_at'
  });

  Prospecto.associate = (models) => {
    Prospecto.belongsTo(models.SvArea,    { as: 'area',     foreignKey: 'prosp_area_id' });
    Prospecto.belongsTo(models.SvGrupo,   { as: 'grupo',    foreignKey: 'prosp_grupo_id' });
    Prospecto.belongsTo(models.SvPersona, { as: 'persona',  foreignKey: 'prosp_persona_id' });
    Prospecto.belongsTo(models.SvPersona, { as: 'contacto', foreignKey: 'prosp_contacto_empresa_id' });
    Prospecto.belongsTo(models.SvUsuario, { as: 'asesor',   foreignKey: 'prosp_asesor_id' });
    Prospecto.belongsTo(models.SvEstado,  { as: 'estado',   foreignKey: 'prosp_estado_id' });
    Prospecto.belongsTo(models.SvFuente,  { as: 'fuente',   foreignKey: 'prosp_fuente_id' });
    Prospecto.belongsTo(models.SvPunto,   { as: 'punto',    foreignKey: 'prosp_punto_id' });
    Prospecto.belongsTo(models.SvLista,   { as: 'lista',    foreignKey: 'prosp_lista_id' });
    // Fase 2: asociación a empresa (la tabla sv_crm_empresas se creó en migración 004)
    if (models.SvEmpresa) {
      Prospecto.belongsTo(models.SvEmpresa, { as: 'empresa', foreignKey: 'prosp_empresa_id' });
    }
    Prospecto.hasMany(models.SvProspectoProducto, { as: 'productos', foreignKey: 'pp_prosp_id' });
    Prospecto.hasMany(models.SvGestion,           { as: 'gestiones', foreignKey: 'gest_prosp_id' });
  };
  return Prospecto;
};
