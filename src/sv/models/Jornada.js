// sv/models/Jornada.js — sv_org_jornadas
// Representa el inicio/fin de una jornada de tracking GPS del asesor.
// jor_id es UUID generado en el service.
module.exports = (sequelize, DataTypes) => {
  const Jornada = sequelize.define('SvJornada', {
    jor_id:                { type: DataTypes.CHAR(36), primaryKey: true },
    jor_usr_id:            { type: DataTypes.INTEGER, allowNull: false },
    jor_fecha:             { type: DataTypes.DATEONLY, allowNull: false },
    jor_inicio_at:         { type: DataTypes.DATE, allowNull: false },
    jor_fin_at:            { type: DataTypes.DATE },
    jor_inicio_lat:        { type: DataTypes.DECIMAL(10, 8) },
    jor_inicio_lng:        { type: DataTypes.DECIMAL(11, 8) },
    jor_fin_lat:           { type: DataTypes.DECIMAL(10, 8) },
    jor_fin_lng:           { type: DataTypes.DECIMAL(11, 8) },
    jor_puntos_total:      { type: DataTypes.INTEGER, defaultValue: 0 },
    jor_km_recorridos:     { type: DataTypes.DECIMAL(8, 2) },
    jor_duracion_min:      { type: DataTypes.INTEGER },
    jor_estado:            { type: DataTypes.STRING(20), defaultValue: 'activa' }, // activa|finalizada|auto_cerrada
    jor_dispositivo:       { type: DataTypes.STRING(255) },
    jor_ip_inicio:         { type: DataTypes.STRING(45) },
    jor_consentimiento_at: { type: DataTypes.DATE }
  }, {
    tableName: 'sv_org_jornadas',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'jor_created_at',
    updatedAt: 'jor_updated_at'
  });

  Jornada.associate = (models) => {
    Jornada.belongsTo(models.SvUsuario, { as: 'usuario', foreignKey: 'jor_usr_id' });
    if (models.SvTrackingPunto) {
      Jornada.hasMany(models.SvTrackingPunto, { as: 'puntos', foreignKey: 'tp_jor_id' });
    }
  };
  return Jornada;
};
