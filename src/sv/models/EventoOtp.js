// sv/models/EventoOtp.js — sv_org_evento_otps (migración 021, SP-3)
module.exports = (sequelize, DataTypes) => {
  const EventoOtp = sequelize.define('SvEventoOtp', {
    otp_id:           { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    otp_evento_id:    { type: DataTypes.INTEGER, allowNull: false },
    otp_usr_id:       { type: DataTypes.INTEGER, allowNull: false },
    otp_hash:         { type: DataTypes.CHAR(64), allowNull: false },
    otp_expires_at:   { type: DataTypes.DATE, allowNull: false },
    otp_consumed_at:  { type: DataTypes.DATE },
    otp_intentos:     { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    otp_payload_json: { type: DataTypes.JSON }
  }, {
    tableName: 'sv_org_evento_otps',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'otp_created_at',
    updatedAt: false
  });

  EventoOtp.associate = (models) => {
    EventoOtp.belongsTo(models.SvEventoAgenda, { as: 'evento',  foreignKey: 'otp_evento_id' });
    EventoOtp.belongsTo(models.SvUsuario,      { as: 'usuario', foreignKey: 'otp_usr_id' });
  };
  return EventoOtp;
};
