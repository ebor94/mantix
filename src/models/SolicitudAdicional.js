// ============================================
// src/models/SolicitudAdicional.js
// ============================================

/**
 * @swagger
 * components:
 *   schemas:
 *     SolicitudAdicional:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         codigo:
 *           type: string
 *           example: "SOL-202510-0001"
 *         solicitante_id:
 *           type: integer
 *           example: 3
 *         sede_id:
 *           type: integer
 *           example: 1
 *         area:
 *           type: string
 *           example: "Producción"
 *         categoria_id:
 *           type: integer
 *           example: 1
 *         equipo_id:
 *           type: integer
 *           example: 5
 *         tipo:
 *           type: string
 *           enum: [correctivo, mejora, urgente]
 *           example: "correctivo"
 *         prioridad:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *           example: "alta"
 *         titulo:
 *           type: string
 *           example: "Falla en compresor principal"
 *         descripcion:
 *           type: string
 *           example: "El compresor presenta ruidos anormales y pérdida de presión"
 *         estado_id:
 *           type: integer
 *           example: 1
 *         fecha_solicitud:
 *           type: string
 *           format: date-time
 *           example: "2025-10-08T14:30:00.000Z"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-08T14:30:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-09T10:00:00.000Z"
 */
module.exports = (sequelize, DataTypes) => {
  const SolicitudAdicional = sequelize.define('SolicitudAdicional', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    codigo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    solicitante_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sede_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    area: {
      type: DataTypes.STRING(100)
    },
    categoria_id: {
      type: DataTypes.INTEGER
    },
    equipo_id: {
      type: DataTypes.INTEGER
    },
    tipo: {
      type: DataTypes.ENUM('correctivo', 'mejora', 'urgente'),
      allowNull: false
    },
    prioridad: {
      type: DataTypes.ENUM('baja', 'media', 'alta', 'critica'),
      defaultValue: 'media'
    },
    titulo: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    estado_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    asignado_a_usuario_id: {
      type: DataTypes.INTEGER
    },
    asignado_a_proveedor_id: {
      type: DataTypes.INTEGER
    },
    fecha_solicitud: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    fecha_aprobacion: {
      type: DataTypes.DATE
    },
    aprobado_por: {
      type: DataTypes.INTEGER
    },
    fecha_asignacion: {
      type: DataTypes.DATE
    },
    fecha_atencion: {
      type: DataTypes.DATE
    },
    fecha_cierre: {
      type: DataTypes.DATE
    },
    tiempo_respuesta_horas: {
      type: DataTypes.DECIMAL(8, 2)
    },
    tiempo_solucion_horas: {
      type: DataTypes.DECIMAL(8, 2)
    },
    costo: {
      type: DataTypes.DECIMAL(12, 2)
    },
    solucion_aplicada: {
      type: DataTypes.TEXT
    },
    calificacion: {
      type: DataTypes.INTEGER,
      validate: {
        min: 1,
        max: 5
      }
    },
    comentario_cierre: {
      type: DataTypes.TEXT
    },
    requiere_seguimiento: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    observaciones: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'solicitudes_adicionales',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  SolicitudAdicional.associate = (models) => {
    // Asociación con Usuario (solicitante)
    SolicitudAdicional.belongsTo(models.Usuario, {
      foreignKey: 'solicitante_id',
      as: 'solicitante'
    });
    
    // Asociación con Sede
    SolicitudAdicional.belongsTo(models.Sede, {
      foreignKey: 'sede_id',
      as: 'sede'
    });
    
    // Asociación con CategoriaMantenimiento
    SolicitudAdicional.belongsTo(models.CategoriaMantenimiento, {
      foreignKey: 'categoria_id',
      as: 'categoria'
    });
    
    // Asociación con Equipo
    SolicitudAdicional.belongsTo(models.Equipo, {
      foreignKey: 'equipo_id',
      as: 'equipo'
    });
    
    // Asociación con Estado
    SolicitudAdicional.belongsTo(models.Estado, {
      foreignKey: 'estado_id',
      as: 'estado'
    });
    
    // Asociación con Usuario (asignado)
    SolicitudAdicional.belongsTo(models.Usuario, {
      foreignKey: 'asignado_a_usuario_id',
      as: 'asignado_usuario'
    });
    
    // Asociación con Proveedor (solo si existe el modelo)
    if (models.Proveedor) {
      SolicitudAdicional.belongsTo(models.Proveedor, {
        foreignKey: 'asignado_a_proveedor_id',
        as: 'asignado_proveedor'
      });
    }
    
    // Asociación con SolicitudArchivo (solo si existe el modelo)
    if (models.SolicitudArchivo) {
      SolicitudAdicional.hasMany(models.SolicitudArchivo, {
        foreignKey: 'solicitud_id',
        as: 'archivos'
      });
    }
    
    // Asociación con SolicitudHistorial (solo si existe el modelo)
    if (models.SolicitudHistorial) {
      SolicitudAdicional.hasMany(models.SolicitudHistorial, {
        foreignKey: 'solicitud_id',
        as: 'historial'
      });
    }
  };

  return SolicitudAdicional;
};