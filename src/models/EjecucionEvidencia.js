// ============================================
// src/models/EjecucionEvidencia.js
// ============================================
/**
 * @swagger
 * components:
 *   schemas:
 *     EjecucionEvidencia:
 *       type: object
 *       required:
 *         - mantenimiento_ejecutado_id
 *         - tipo
 *         - nombre_archivo
 *         - ruta_archivo
 *       properties:
 *         id:
 *           type: integer
 *           description: ID auto-generado
 *           example: 1
 *         mantenimiento_ejecutado_id:
 *           type: integer
 *           description: ID del mantenimiento ejecutado
 *           example: 1
 *         tipo:
 *           type: string
 *           enum: [antes, durante, despues]
 *           description: Momento en que se tomó la evidencia
 *           example: "antes"
 *         descripcion:
 *           type: string
 *           description: Descripción de la evidencia
 *           example: "Estado inicial del equipo"
 *         nombre_archivo:
 *           type: string
 *           maxLength: 255
 *           description: Nombre original del archivo
 *           example: "foto_compresor_inicial.jpg"
 *         ruta_archivo:
 *           type: string
 *           maxLength: 500
 *           description: Ruta donde se guardó el archivo
 *           example: "/uploads/evidencias/2025/10/abc123.jpg"
 *         tamanio_kb:
 *           type: integer
 *           description: Tamaño del archivo en KB
 *           example: 1024
 *         uploaded_by:
 *           type: integer
 *           description: ID del usuario que subió el archivo
 *           example: 1
 *         created_at:
 *           type: string
 *           format: date-time
 */

module.exports = (sequelize, DataTypes) => {
  const EjecucionEvidencia = sequelize.define('EjecucionEvidencia', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    mantenimiento_ejecutado_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    tipo: {
      type: DataTypes.ENUM('antes', 'durante', 'despues'),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT
    },
    nombre_archivo: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    ruta_archivo: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    tamanio_kb: {
      type: DataTypes.INTEGER
    },
    uploaded_by: {
      type: DataTypes.INTEGER
    }
  }, {
    tableName: 'ejecucion_evidencias',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  EjecucionEvidencia.associate = (models) => {
    if (models.MantenimientoEjecutado) {
      EjecucionEvidencia.belongsTo(models.MantenimientoEjecutado, {
        foreignKey: 'mantenimiento_ejecutado_id',
        as: 'mantenimiento_ejecutado'
      });
    }

    if (models.Usuario) {
      EjecucionEvidencia.belongsTo(models.Usuario, {
        foreignKey: 'uploaded_by',
        as: 'usuario_subio'
      });
    }
  };

  return EjecucionEvidencia;
};