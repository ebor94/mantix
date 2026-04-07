// models/NovedadPlantilla.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const NovedadPlantilla = sequelize.define('NovedadPlantilla', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tipo_novedad: {
      type: DataTypes.ENUM(
        'reprogramacion',
        'comunicacion_proveedor',
        'cambio_estado',
        'suspension',
        'observacion_general',
        'cambio_prioridad',
        'asignacion_personal',
        'solicitud_requisitos',
        'aprobacion_requisitos',
        'rechazo_requisitos',
        'inicio_trabajo',
        'finalizacion_trabajo',
        'otro'
      ),
      allowNull: false
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    descripcion_plantilla: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    requiere_fecha: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    requiere_motivo: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    requiere_adjunto: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    es_activa: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'novedad_plantillas',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return NovedadPlantilla;
};