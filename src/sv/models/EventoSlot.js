// sv/models/EventoSlot.js — sv_org_eventos_slots (migración 020)
module.exports = (sequelize, DataTypes) => {
  const EventoSlot = sequelize.define('SvEventoSlot', {
    slot_id:          { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    slot_evento_id:   { type: DataTypes.INTEGER, allowNull: false },
    slot_fecha:       { type: DataTypes.DATEONLY, allowNull: false },
    slot_hora_inicio: { type: DataTypes.TIME, allowNull: false },
    slot_hora_fin:    { type: DataTypes.TIME, allowNull: false }
  }, {
    tableName: 'sv_org_eventos_slots',
    freezeTableName: true,
    timestamps: false
  });

  EventoSlot.associate = (models) => {
    EventoSlot.belongsTo(models.SvEventoAgenda, { as: 'evento', foreignKey: 'slot_evento_id' });
  };
  return EventoSlot;
};
