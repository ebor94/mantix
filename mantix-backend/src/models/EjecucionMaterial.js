// ============================================
// src/models/EjecucionMaterial.js
// ============================================
/**
 * @swagger
 * components:
 *   schemas:
 *     EjecucionMaterial:
 *       type: object
 *       required:
 *         - mantenimiento_ejecutado_id
 *         - descripcion
 *         - cantidad
 *       properties:
 *         id:
 *           type: integer
 *           description: ID auto-generado
 *           example: 1
 *         mantenimiento_ejecutado_id:
 *           type: integer
 *           description: ID del mantenimiento ejecutado
 *           example: 1
 *         descripcion:
 *           type: string
 *           maxLength: 200
 *           description: Descripción del material
 *           example: "Aceite lubricante SAE 40"
 *         cantidad:
 *           type: number
 *           format: decimal
 *           description: Cantidad utilizada
 *           example: 5.0
 *         unidad:
 *           type: string
 *           maxLength: 20
 *           description: Unidad de medida
 *           example: "litros"
 *         costo_unitario:
 *           type: number
 *           format: decimal
 *           description: Costo por unidad
 *           example: 15000.00
 *         costo_total:
 *           type: number
 *           format: decimal
 *           description: Costo total (cantidad * costo_unitario)
 *           example: 75000.00
 *         observacion:
 *           type: string
 *           description: Observaciones sobre el material
 *           example: "Material de stock"
 *         created_at:
 *           type: string
 *           format: date-time
 */

module.exports = (sequelize, DataTypes) => {
  const EjecucionMaterial = sequelize.define('EjecucionMaterial', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    mantenimiento_ejecutado_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    descripcion: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    cantidad: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    unidad: {
      type: DataTypes.STRING(20)
    },
    costo_unitario: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0
    },
    costo_total: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0
    },
    observacion: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'ejecucion_materiales',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  EjecucionMaterial.associate = (models) => {
    if (models.MantenimientoEjecutado) {
      EjecucionMaterial.belongsTo(models.MantenimientoEjecutado, {
        foreignKey: 'mantenimiento_ejecutado_id',
        as: 'mantenimiento_ejecutado'
      });
    }
  };

  // Hook para calcular costo_total automáticamente
  EjecucionMaterial.beforeSave((material) => {
    if (material.cantidad && material.costo_unitario) {
      material.costo_total = material.cantidad * material.costo_unitario;
    }
  });

  return EjecucionMaterial;
};