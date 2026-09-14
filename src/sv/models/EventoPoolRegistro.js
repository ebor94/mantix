// sv/models/EventoPoolRegistro.js — sv_org_eventos_pool_registros (migración 020)
module.exports = (sequelize, DataTypes) => {
  const EventoPoolRegistro = sequelize.define('SvEventoPoolRegistro', {
    pool_id:           { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    pool_evento_id:    { type: DataTypes.INTEGER, allowNull: false },
    pool_nombre:       { type: DataTypes.STRING(180), allowNull: false },
    pool_telefono:     { type: DataTypes.STRING(30),  allowNull: false },
    pool_correo:       { type: DataTypes.STRING(180) },
    pool_ip:           { type: DataTypes.STRING(45) },
    pool_user_agent:   { type: DataTypes.STRING(255) },
    pool_prosp_id:     { type: DataTypes.INTEGER },
    pool_asignado_a:   { type: DataTypes.INTEGER },
    pool_asignado_at:  { type: DataTypes.DATE },
    pool_asignado_por: { type: DataTypes.INTEGER }
  }, {
    tableName: 'sv_org_eventos_pool_registros',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'pool_created_at',
    updatedAt: false
  });

  EventoPoolRegistro.associate = (models) => {
    EventoPoolRegistro.belongsTo(models.SvEventoAgenda, { as: 'evento',    foreignKey: 'pool_evento_id' });
    EventoPoolRegistro.belongsTo(models.SvProspecto,    { as: 'prospecto', foreignKey: 'pool_prosp_id' });
    EventoPoolRegistro.belongsTo(models.SvUsuario,      { as: 'asignadoA', foreignKey: 'pool_asignado_a' });
    EventoPoolRegistro.belongsTo(models.SvUsuario,      { as: 'asignadoPor', foreignKey: 'pool_asignado_por' });
  };
  return EventoPoolRegistro;
};
