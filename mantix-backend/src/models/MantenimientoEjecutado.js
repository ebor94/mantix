// ============================================
// src/models/MantenimientoEjecutado.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const MantenimientoEjecutado = sequelize.define('MantenimientoEjecutado', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    mantenimiento_programado_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    fecha_ejecucion: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    hora_inicio: {
      type: DataTypes.TIME,
      allowNull: false
    },
    hora_fin: {
      type: DataTypes.TIME
    },
    duracion_horas: {
      type: DataTypes.DECIMAL(5, 2)
    },
    ejecutado_por_usuario_id: {
      type: DataTypes.INTEGER
    },
    ejecutado_por_proveedor_id: {
      type: DataTypes.INTEGER
    },
    trabajadores_cantidad: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    trabajo_realizado: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    observaciones: {
      type: DataTypes.TEXT
    },
    costo_real: {
      type: DataTypes.DECIMAL(12, 2)
    },
    calificacion_servicio: {
      type: DataTypes.INTEGER,
      validate: {
        min: 1,
        max: 5
      }
    },
    requiere_seguimiento: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fecha_seguimiento: {
      type: DataTypes.DATEONLY
    },
    firma_responsable: {
      type: DataTypes.TEXT
    },
    firma_recibe: {
      type: DataTypes.TEXT
    },
    nombre_recibe: {
      type: DataTypes.STRING(100)
    }
  }, {
    tableName: 'mantenimientos_ejecutados',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  MantenimientoEjecutado.associate = (models) => {
    MantenimientoEjecutado.belongsTo(models.MantenimientoProgramado, {
      foreignKey: 'mantenimiento_programado_id',
      as: 'programado'
    });
    
    MantenimientoEjecutado.belongsTo(models.Usuario, {
      foreignKey: 'ejecutado_por_usuario_id',
      as: 'usuario'
    });
    
    // Only associate with Proveedor if it exists
    // MantenimientoEjecutado.belongsTo(models.Proveedor, {
    //   foreignKey: 'ejecutado_por_proveedor_id',
    //   as: 'proveedor'
    // });
    
    // Only associate with EjecucionChecklist if it exists
    // MantenimientoEjecutado.hasMany(models.EjecucionChecklist, {
    //   foreignKey: 'mantenimiento_ejecutado_id',
    //   as: 'checklist'
    // });
    
    // Only associate with EjecucionMaterial if it exists
    // MantenimientoEjecutado.hasMany(models.EjecucionMaterial, {
    //   foreignKey: 'mantenimiento_ejecutado_id',
    //   as: 'materiales'
    // });
    
    // Only associate with EjecucionEvidencia if it exists
    // MantenimientoEjecutado.hasMany(models.EjecucionEvidencia, {
    //   foreignKey: 'mantenimiento_ejecutado_id',
    //   as: 'evidencias'
    // });
  };

  return MantenimientoEjecutado;
};