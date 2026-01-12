// models/MantenimientoNovedad.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MantenimientoNovedad = sequelize.define('MantenimientoNovedad', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    mantenimiento_programado_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'mantenimientos_programados',
        key: 'id'
      },
      onDelete: 'CASCADE'
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
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    motivo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    fecha_anterior: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    fecha_nueva: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    hora_anterior: {
      type: DataTypes.TIME,
      allowNull: true
    },
    hora_nueva: {
      type: DataTypes.TIME,
      allowNull: true
    },
    estado_anterior_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'estados',
        key: 'id'
      }
    },
    estado_nuevo_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'estados',
        key: 'id'
      }
    },
    prioridad_anterior: {
      type: DataTypes.ENUM('baja', 'media', 'alta', 'critica'),
      allowNull: true
    },
    prioridad_nueva: {
      type: DataTypes.ENUM('baja', 'media', 'alta', 'critica'),
      allowNull: true
    },
    usuario_registro_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'usuarios',
        key: 'id'
      }
    },
    adjuntos: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    es_visible_proveedor: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    notificacion_enviada: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_notificacion: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'mantenimiento_novedades',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  MantenimientoNovedad.associate = (models) => {
    MantenimientoNovedad.belongsTo(models.MantenimientoProgramado, {
      foreignKey: 'mantenimiento_programado_id',
      as: 'mantenimiento'
    });
    MantenimientoNovedad.belongsTo(models.Usuario, {
      foreignKey: 'usuario_registro_id',
      as: 'usuario_registro'
    });
    MantenimientoNovedad.belongsTo(models.Estado, {
      foreignKey: 'estado_anterior_id',
      as: 'estado_anterior'
    });
    MantenimientoNovedad.belongsTo(models.Estado, {
      foreignKey: 'estado_nuevo_id',
      as: 'estado_nuevo'
    });
  };

  return MantenimientoNovedad;
};