// sv/models/EventoAgenda.js — sv_org_eventos_agenda (migración 018)
// Actividades de calendario del asesor: reuniones, visitas, llamadas, etc.
// Pueden vincularse opcionalmente a un prospecto o empresa.
module.exports = (sequelize, DataTypes) => {
  const EventoAgenda = sequelize.define('SvEventoAgenda', {
    evento_id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    evento_asesor_id:     { type: DataTypes.INTEGER, allowNull: false },
    evento_creado_por:    { type: DataTypes.INTEGER, allowNull: false },
    evento_titulo:        { type: DataTypes.STRING(180), allowNull: false },
    evento_descripcion:   { type: DataTypes.TEXT },
    evento_tipo:          { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'OTRO' },
    evento_fecha_hora:    { type: DataTypes.DATE, allowNull: false },
    evento_prosp_id:      { type: DataTypes.INTEGER },
    evento_empresa_id:    { type: DataTypes.INTEGER },
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
    EventoAgenda.belongsTo(models.SvUsuario,    { as: 'asesor',    foreignKey: 'evento_asesor_id' });
    EventoAgenda.belongsTo(models.SvUsuario,    { as: 'creadoPor', foreignKey: 'evento_creado_por' });
    if (models.SvProspecto) {
      EventoAgenda.belongsTo(models.SvProspecto, { as: 'prospecto', foreignKey: 'evento_prosp_id' });
    }
    if (models.SvEmpresa) {
      EventoAgenda.belongsTo(models.SvEmpresa,   { as: 'empresa',   foreignKey: 'evento_empresa_id' });
    }
  };

  return EventoAgenda;
};
