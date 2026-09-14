// sv/models/EventoAsistente.js — sv_org_eventos_asistentes (migración 020)
module.exports = (sequelize, DataTypes) => {
  const EventoAsistente = sequelize.define('SvEventoAsistente', {
    eva_id:                 { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    eva_evento_id:          { type: DataTypes.INTEGER, allowNull: false },
    eva_usr_id:             { type: DataTypes.INTEGER, allowNull: false },
    eva_estado:             { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CONFIRMADO' },
    eva_leads_captados:     { type: DataTypes.INTEGER },
    eva_prospectos_creados: { type: DataTypes.INTEGER },
    eva_ventas_cerradas:    { type: DataTypes.INTEGER },
    eva_activo:             { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'sv_org_eventos_asistentes',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'eva_created_at',
    updatedAt: false
  });

  EventoAsistente.associate = (models) => {
    EventoAsistente.belongsTo(models.SvEventoAgenda, { as: 'evento',  foreignKey: 'eva_evento_id' });
    EventoAsistente.belongsTo(models.SvUsuario,      { as: 'usuario', foreignKey: 'eva_usr_id' });
  };
  return EventoAsistente;
};
