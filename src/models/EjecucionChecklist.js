// ============================================
// src/models/EjecucionChecklist.js
// ============================================
/**
 * @swagger
 * components:
 *   schemas:
 *     EjecucionChecklist:
 *       type: object
 *       required:
 *         - mantenimiento_ejecutado_id
 *         - actividad
 *       properties:
 *         id:
 *           type: integer
 *           description: ID auto-generado
 *           example: 1
 *         mantenimiento_ejecutado_id:
 *           type: integer
 *           description: ID del mantenimiento ejecutado
 *           example: 1
 *         actividad:
 *           type: string
 *           maxLength: 200
 *           description: Descripción de la actividad del checklist
 *           example: "Revisar nivel de aceite"
 *         completada:
 *           type: boolean
 *           description: Si la actividad fue completada
 *           example: true
 *         observacion:
 *           type: string
 *           description: Observaciones sobre la actividad
 *           example: "Nivel bajo, se agregó 1 litro"
 *         orden:
 *           type: integer
 *           description: Orden de ejecución
 *           example: 1
 *         created_at:
 *           type: string
 *           format: date-time
 */

module.exports = (sequelize, DataTypes) => {
  const EjecucionChecklist = sequelize.define('EjecucionChecklist', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    mantenimiento_ejecutado_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    actividad: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    completada: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    observacion: {
      type: DataTypes.TEXT
    },
    orden: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'ejecucion_checklist',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false // Esta tabla solo tiene created_at
  });

  EjecucionChecklist.associate = (models) => {
    if (models.MantenimientoEjecutado) {
      EjecucionChecklist.belongsTo(models.MantenimientoEjecutado, {
        foreignKey: 'mantenimiento_ejecutado_id',
        as: 'mantenimiento_ejecutado'
      });
    }
  };

  return EjecucionChecklist;
};