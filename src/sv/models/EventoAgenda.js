// sv/models/EventoAgenda.js — sv_org_eventos_agenda (migración 018 + 020)
// Actividades de calendario del asesor: reuniones, visitas, llamadas, etc.
// Pueden vincularse opcionalmente a un prospecto o empresa.
// Migración 020 añade soporte multi-asesor + rango de fechas + pool público.
module.exports = (sequelize, DataTypes) => {
  const EventoAgenda = sequelize.define('SvEventoAgenda', {
    evento_id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    evento_asesor_id:     { type: DataTypes.INTEGER, allowNull: false },
    evento_creado_por:    { type: DataTypes.INTEGER, allowNull: false },
    evento_titulo:        { type: DataTypes.STRING(180), allowNull: false },
    evento_descripcion:   { type: DataTypes.TEXT },
    evento_tipo:          { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'OTRO' },
    evento_fecha_hora:    { type: DataTypes.DATE, allowNull: false },
    evento_fecha_fin:     { type: DataTypes.DATE },
    evento_modo_fechas:   { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'UNICO' },
    evento_prosp_id:      { type: DataTypes.INTEGER },
    evento_empresa_id:    { type: DataTypes.INTEGER },
    evento_apoyo_usr_id:  { type: DataTypes.INTEGER },
    evento_link_hash:     { type: DataTypes.CHAR(32) },
    evento_registros_publicos_habilitado: { type: DataTypes.TINYINT, defaultValue: 0 },
    evento_meta_leads:    { type: DataTypes.INTEGER },
    evento_grupo_id:      { type: DataTypes.INTEGER },
    evento_area_id:       { type: DataTypes.INTEGER },
    evento_completado:    { type: DataTypes.TINYINT, defaultValue: 0 },
    evento_completado_at: { type: DataTypes.DATE }
  }, {
    tableName: 'sv_org_eventos_agenda',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'evento_created_at',
    updatedAt: 'evento_updated_at'
  });

  EventoAgenda.associate = (models) => {
    EventoAgenda.belongsTo(models.SvUsuario, { as: 'asesor',    foreignKey: 'evento_asesor_id' });
    EventoAgenda.belongsTo(models.SvUsuario, { as: 'creadoPor', foreignKey: 'evento_creado_por' });
    EventoAgenda.belongsTo(models.SvUsuario, { as: 'apoyo',     foreignKey: 'evento_apoyo_usr_id' });
    if (models.SvProspecto) {
      EventoAgenda.belongsTo(models.SvProspecto, { as: 'prospecto', foreignKey: 'evento_prosp_id' });
    }
    if (models.SvEmpresa) {
      EventoAgenda.belongsTo(models.SvEmpresa, { as: 'empresa', foreignKey: 'evento_empresa_id' });
    }
    if (models.SvGrupo) {
      EventoAgenda.belongsTo(models.SvGrupo, { as: 'grupo', foreignKey: 'evento_grupo_id' });
    }
    if (models.SvArea) {
      EventoAgenda.belongsTo(models.SvArea, { as: 'area', foreignKey: 'evento_area_id' });
    }
    if (models.SvEventoAsistente) {
      EventoAgenda.hasMany(models.SvEventoAsistente, { as: 'asistentes', foreignKey: 'eva_evento_id' });
    }
    if (models.SvEventoSlot) {
      EventoAgenda.hasMany(models.SvEventoSlot, { as: 'slots', foreignKey: 'slot_evento_id' });
    }
    if (models.SvEventoPoolRegistro) {
      EventoAgenda.hasMany(models.SvEventoPoolRegistro, { as: 'poolRegistros', foreignKey: 'pool_evento_id' });
    }
  };

  return EventoAgenda;
};
