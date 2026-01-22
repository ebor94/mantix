// ============================================
// src/models/PlanActividad.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const PlanActividad = sequelize.define('PlanActividad', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    plan_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    tipo_mantenimiento_id: {
      type: DataTypes.INTEGER
    },
    nombre: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT
    },
    sede_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    equipo_id: {
      type: DataTypes.INTEGER
    },
    periodicidad_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    responsable_tipo: {
      type: DataTypes.ENUM('interno', 'proveedor'),
      allowNull: false
    },
    responsable_usuario_id: {
      type: DataTypes.INTEGER
    },
    responsable_proveedor_id: {
      type: DataTypes.INTEGER
    },
    duracion_estimada_horas: {
      type: DataTypes.DECIMAL(5, 2)
    },
    costo_estimado: {
      type: DataTypes.DECIMAL(12, 2)
    },
    observaciones: {
      type: DataTypes.TEXT
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    grupo_masivo_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Identificador para actividades creadas en lote'
    }
  }, {
    tableName: 'plan_actividades',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  PlanActividad.associate = (models) => {
    // Relación con PlanMantenimiento
    if (models.PlanMantenimiento) {
      PlanActividad.belongsTo(models.PlanMantenimiento, {
        foreignKey: 'plan_id',
        as: 'plan'
      });
    }

    // Relación con CategoriaMantenimiento
    if (models.CategoriaMantenimiento) {
      PlanActividad.belongsTo(models.CategoriaMantenimiento, {
        foreignKey: 'categoria_id',
        as: 'categoria'
      });
    }

    // Relación con TipoMantenimiento (si existe el modelo)
    if (models.TipoMantenimiento) {
      PlanActividad.belongsTo(models.TipoMantenimiento, {
        foreignKey: 'tipo_mantenimiento_id',
        as: 'tipo_mantenimiento'
      });
    }

    // Relación con Sede
    if (models.Sede) {
      PlanActividad.belongsTo(models.Sede, {
        foreignKey: 'sede_id',
        as: 'sede'
      });
    }

    // Relación con Equipo
    if (models.Equipo) {
      PlanActividad.belongsTo(models.Equipo, {
        foreignKey: 'equipo_id',
        as: 'equipo'
      });
    }

    // ✅ SOLO UNA VEZ - Relación con Periodicidad
    if (models.Periodicidad) {
      PlanActividad.belongsTo(models.Periodicidad, {
        foreignKey: 'periodicidad_id',
        as: 'periodicidad'
      });
    }

    // Relación con Usuario (responsable interno)
    if (models.Usuario) {
      PlanActividad.belongsTo(models.Usuario, {
        foreignKey: 'responsable_usuario_id',
        as: 'responsable_usuario'
      });
    }

    // Relación con Proveedor (responsable externo)
    if (models.Proveedor) {
      PlanActividad.belongsTo(models.Proveedor, {
        foreignKey: 'responsable_proveedor_id',
        as: 'responsable_proveedor'
      });
    }

    // Relación con MantenimientosProgramados
    if (models.MantenimientoProgramado) {
      PlanActividad.hasMany(models.MantenimientoProgramado, {
        foreignKey: 'plan_actividad_id',
        as: 'mantenimientos'
      });
    }

    // ❌ ELIMINAR ESTA PARTE DUPLICADA (líneas 145-150 del error)
    // if (models.Periodicidad) {
    //   PlanActividad.belongsTo(models.Periodicidad, {
    //     foreignKey: 'periodicidad_id',
    //     as: 'periodicidad'
    //   });
    // }
  };

  return PlanActividad;
};