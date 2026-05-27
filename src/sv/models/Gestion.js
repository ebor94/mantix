// sv/models/Gestion.js — sv_crm_gestiones (INMUTABLE)
module.exports = (sequelize, DataTypes) => {
  const Gestion = sequelize.define('SvGestion', {
    gest_id:               { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    gest_prosp_id:         { type: DataTypes.INTEGER, allowNull: false },
    gest_asesor_id:        { type: DataTypes.INTEGER, allowNull: false },
    gest_resultado_id:     { type: DataTypes.INTEGER },
    gest_estado_nuevo_id:  { type: DataTypes.INTEGER },
    gest_canal:            { type: DataTypes.STRING(20), defaultValue: 'llamada' },
    gest_comentario:       { type: DataTypes.TEXT },
    gest_fecha_hora:       { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    gest_duracion_seg:     { type: DataTypes.INTEGER },
    gest_prox_fecha:       { type: DataTypes.DATEONLY },
    gest_prox_hora:        { type: DataTypes.TIME },
    gest_recordatorio_env: { type: DataTypes.TINYINT, defaultValue: 0 },
    gest_ubicacion_lat:    { type: DataTypes.DECIMAL(10, 8) },
    gest_ubicacion_lng:    { type: DataTypes.DECIMAL(11, 8) }
  }, {
    tableName: 'sv_crm_gestiones',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'gest_created_at',
    updatedAt: false
  });

  // Inmutabilidad: bloquear UPDATE/DELETE en el ORM
  Gestion.beforeUpdate(() => {
    throw new Error('Las gestiones son INMUTABLES: registrar una nueva en su lugar.');
  });
  Gestion.beforeDestroy(() => {
    throw new Error('Las gestiones son INMUTABLES: no pueden eliminarse.');
  });

  Gestion.associate = (models) => {
    Gestion.belongsTo(models.SvProspecto, { as: 'prospecto', foreignKey: 'gest_prosp_id' });
    Gestion.belongsTo(models.SvUsuario,   { as: 'asesor',    foreignKey: 'gest_asesor_id' });
    Gestion.belongsTo(models.SvResultado, { as: 'resultado', foreignKey: 'gest_resultado_id' });
    Gestion.belongsTo(models.SvEstado,    { as: 'estadoNuevo', foreignKey: 'gest_estado_nuevo_id' });
  };
  return Gestion;
};
