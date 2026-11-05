// =============================================================
// src/models/MantenimientoPreEjecucion.js
// Lo que carga el técnico en el formulario público al escanear el QR.
// Al ser aprobada por el coordinador, se materializa en
// MantenimientoEjecutado (mantenimiento_ejecutado_id apunta al registro).
// =============================================================
module.exports = (sequelize, DataTypes) => {
  const MantenimientoPreEjecucion = sequelize.define('MantenimientoPreEjecucion', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    mantenimiento_programado_id: { type: DataTypes.INTEGER, allowNull: false },
    token_usado: { type: DataTypes.STRING(64), allowNull: false },
    fecha_ejecucion: { type: DataTypes.DATEONLY, allowNull: false },
    hora_inicio: { type: DataTypes.TIME, allowNull: true },
    hora_fin: { type: DataTypes.TIME, allowNull: true },
    nombre_recibe: { type: DataTypes.STRING(150), allowNull: false },
    cedula_recibe: { type: DataTypes.STRING(30), allowNull: true },
    trabajo_realizado: { type: DataTypes.TEXT, allowNull: false },
    observaciones: { type: DataTypes.TEXT, allowNull: true },
    firma_tecnico: { type: DataTypes.TEXT('medium'), allowNull: true },
    fotos_urls: { type: DataTypes.JSON, allowNull: true },
    estado: {
      type: DataTypes.ENUM('pendiente', 'aprobada', 'rechazada'),
      allowNull: false,
      defaultValue: 'pendiente'
    },
    motivo_rechazo: { type: DataTypes.TEXT, allowNull: true },
    ip_origen: { type: DataTypes.STRING(45), allowNull: true },
    user_agent: { type: DataTypes.STRING(500), allowNull: true },
    aprobada_por_usuario_id: { type: DataTypes.INTEGER, allowNull: true },
    aprobada_en: { type: DataTypes.DATE, allowNull: true },
    mantenimiento_ejecutado_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    tableName: 'mantenimiento_pre_ejecucion',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  MantenimientoPreEjecucion.associate = (models) => {
    MantenimientoPreEjecucion.belongsTo(models.MantenimientoProgramado, {
      foreignKey: 'mantenimiento_programado_id',
      as: 'mantenimiento_programado'
    });
    MantenimientoPreEjecucion.belongsTo(models.Usuario, {
      foreignKey: 'aprobada_por_usuario_id',
      as: 'aprobador'
    });
    MantenimientoPreEjecucion.belongsTo(models.MantenimientoEjecutado, {
      foreignKey: 'mantenimiento_ejecutado_id',
      as: 'mantenimiento_ejecutado'
    });
  };

  return MantenimientoPreEjecucion;
};
