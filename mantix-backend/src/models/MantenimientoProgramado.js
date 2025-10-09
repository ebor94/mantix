// ============================================
// src/models/MantenimientoProgramado.js
// ============================================
/**
 * @swagger
 * components:
 *   schemas:
 *     MantenimientoProgramado:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         plan_actividad_id:
 *           type: integer
 *           example: 5
 *         codigo:
 *           type: string
 *           example: "MNT-2025-001"
 *         fecha_programada:
 *           type: string
 *           format: date
 *           example: "2025-10-15"
 *         hora_programada:
 *           type: string
 *           format: time
 *           example: "09:00:00"
 *         estado_id:
 *           type: integer
 *           example: 1
 *         prioridad:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *           example: "alta"
 *         reprogramaciones:
 *           type: integer
 *           example: 0
 *         ultimo_motivo_reprogramacion:
 *           type: string
 *           example: null
 *         notificacion_enviada:
 *           type: boolean
 *           example: true
 *         fecha_notificacion:
 *           type: string
 *           format: date-time
 *           example: "2025-10-08T08:00:00.000Z"
 *         observaciones:
 *           type: string
 *           example: "Mantenimiento preventivo trimestral"
 *         estado:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             nombre:
 *               type: string
 *               example: "Programado"
 *         actividad:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 5
 *             nombre:
 *               type: string
 *               example: "Inspección de compresor"
 *             sede:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 nombre:
 *                   type: string
 *                   example: "Sede Principal"
 *             equipo:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 codigo:
 *                   type: string
 *                   example: "EQ-001"
 *                 nombre:
 *                   type: string
 *                   example: "Compresor Industrial"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-08T12:00:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-08T12:00:00.000Z"
 *     
 *     MantenimientoEjecutado:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         mantenimiento_programado_id:
 *           type: integer
 *           example: 1
 *         fecha_ejecucion:
 *           type: string
 *           format: date
 *           example: "2025-10-15"
 *         hora_inicio:
 *           type: string
 *           format: time
 *           example: "09:00:00"
 *         hora_fin:
 *           type: string
 *           format: time
 *           example: "11:30:00"
 *         duracion_horas:
 *           type: number
 *           format: decimal
 *           example: 2.5
 *         ejecutado_por_usuario_id:
 *           type: integer
 *           example: 2
 *         ejecutado_por_proveedor_id:
 *           type: integer
 *           example: null
 *         trabajadores_cantidad:
 *           type: integer
 *           example: 2
 *         trabajo_realizado:
 *           type: string
 *           example: "Se realizó inspección completa del compresor, cambio de filtros y lubricación de componentes"
 *         observaciones:
 *           type: string
 *           example: "Se encontró desgaste en correa principal, se recomienda cambio en próximo mantenimiento"
 *         costo_real:
 *           type: number
 *           format: decimal
 *           example: 350000.00
 *         calificacion_servicio:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           example: 5
 *         requiere_seguimiento:
 *           type: boolean
 *           example: true
 *         fecha_seguimiento:
 *           type: string
 *           format: date
 *           example: "2025-11-15"
 *         firma_responsable:
 *           type: string
 *           example: "data:image/png;base64,iVBORw0KGgoAAAANS..."
 *         firma_recibe:
 *           type: string
 *           example: "data:image/png;base64,iVBORw0KGgoAAAANS..."
 *         nombre_recibe:
 *           type: string
 *           example: "Carlos Ramírez"
 *         usuario:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 2
 *             nombre:
 *               type: string
 *               example: "Juan"
 *             apellido:
 *               type: string
 *               example: "Pérez"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-15T11:35:00.000Z"
 */

module.exports = (sequelize, DataTypes) => {
  const MantenimientoProgramado = sequelize.define('MantenimientoProgramado', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    plan_actividad_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    codigo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    fecha_programada: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    hora_programada: {
      type: DataTypes.TIME
    },
    estado_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    prioridad: {
      type: DataTypes.ENUM('baja', 'media', 'alta', 'critica'),
      defaultValue: 'media'
    },
    reprogramaciones: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    ultimo_motivo_reprogramacion: {
      type: DataTypes.TEXT
    },
    notificacion_enviada: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_notificacion: {
      type: DataTypes.DATE
    },
    observaciones: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'mantenimientos_programados',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  MantenimientoProgramado.associate = (models) => {
    // Only associate with PlanActividad if it exists
    // MantenimientoProgramado.belongsTo(models.PlanActividad, {
    //   foreignKey: 'plan_actividad_id',
    //   as: 'actividad'
    // });
    
    MantenimientoProgramado.belongsTo(models.Estado, {
      foreignKey: 'estado_id',
      as: 'estado'
    });
    
    MantenimientoProgramado.hasOne(models.MantenimientoEjecutado, {
      foreignKey: 'mantenimiento_programado_id',
      as: 'ejecucion'
    });
  };

  return MantenimientoProgramado;
};