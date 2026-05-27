// ============================================
// src/models/Periodicidad.js
// ============================================
/**
 * @swagger
 * components:
 *   schemas:
 *     Periodicidad:
 *       type: object
 *       required:
 *         - nombre
 *         - dias
 *       properties:
 *         id:
 *           type: integer
 *           description: ID auto-generado de la periodicidad
 *           example: 1
 *         nombre:
 *           type: string
 *           maxLength: 50
 *           description: Nombre de la periodicidad
 *           example: "Mensual"
 *         dias:
 *           type: integer
 *           description: Cantidad de días entre mantenimientos
 *           example: 30
 *         descripcion:
 *           type: string
 *           description: Descripción de la periodicidad
 *           example: "Cada mes"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 */

module.exports = (sequelize, DataTypes) => {
  const Periodicidad = sequelize.define('Periodicidad', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    dias: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isInt: true,
        min: 1
      }
    },
    descripcion: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'periodicidades',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Periodicidad.associate = (models) => {
    // Relación con PlanActividad
    if (models.PlanActividad) {
      Periodicidad.hasMany(models.PlanActividad, {
        foreignKey: 'periodicidad_id',
        as: 'actividades'
      });
    }
  };

  return Periodicidad;
};