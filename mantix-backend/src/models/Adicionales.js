module.exports.TipoMantenimiento = (sequelize, DataTypes) => {
  return sequelize.define('TipoMantenimiento', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    descripcion: { type: DataTypes.TEXT }
  }, {
    tableName: 'tipos_mantenimiento',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
};

// Periodicidad
module.exports.Periodicidad = (sequelize, DataTypes) => {
  return sequelize.define('Periodicidad', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    dias: { type: DataTypes.INTEGER, allowNull: false },
    descripcion: { type: DataTypes.TEXT }
  }, {
    tableName: 'periodicidades',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
};

// Proveedor
module.exports.Proveedor = (sequelize, DataTypes) => {
  return sequelize.define('Proveedor', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(150), allowNull: false },
    razon_social: { type: DataTypes.STRING(200) },
    nit: { type: DataTypes.STRING(50) },
    contacto_nombre: { type: DataTypes.STRING(100) },
    contacto_telefono: { type: DataTypes.STRING(20) },
    contacto_email: { type: DataTypes.STRING(150) },
    especialidad: { type: DataTypes.TEXT },
    activo: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'proveedores',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
};

// PlanMantenimiento
module.exports.PlanMantenimiento = (sequelize, DataTypes) => {
  const PlanMantenimiento = sequelize.define('PlanMantenimiento', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    anio: { type: DataTypes.INTEGER, allowNull: false },
    nombre: { type: DataTypes.STRING(200), allowNull: false },
    descripcion: { type: DataTypes.TEXT },
    fecha_inicio: { type: DataTypes.DATEONLY, allowNull: false },
    fecha_fin: { type: DataTypes.DATEONLY, allowNull: false },
    activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    created_by: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'planes_mantenimiento',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  
  PlanMantenimiento.associate = (models) => {
    PlanMantenimiento.hasMany(models.PlanActividad, {
      foreignKey: 'plan_id',
      as: 'actividades'
    });
  };
  
  return PlanMantenimiento;
};

// PlanActividad
module.exports.PlanActividad = (sequelize, DataTypes) => {
  const PlanActividad = sequelize.define('PlanActividad', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    plan_id: { type: DataTypes.INTEGER, allowNull: false },
    categoria_id: { type: DataTypes.INTEGER, allowNull: false },
    tipo_mantenimiento_id: { type: DataTypes.INTEGER, allowNull: false },
    nombre: { type: DataTypes.STRING(200), allowNull: false },
    descripcion: { type: DataTypes.TEXT },
    sede_id: { type: DataTypes.INTEGER },
    equipo_id: { type: DataTypes.INTEGER },
    periodicidad_id: { type: DataTypes.INTEGER, allowNull: false },
    responsable_tipo: { type: DataTypes.ENUM('interno', 'proveedor'), allowNull: false },
    responsable_usuario_id: { type: DataTypes.INTEGER },
    responsable_proveedor_id: { type: DataTypes.INTEGER },
    duracion_estimada_horas: { type: DataTypes.DECIMAL(5, 2) },
    costo_estimado: { type: DataTypes.DECIMAL(12, 2) },
    activo: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'plan_actividades',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  
  PlanActividad.associate = (models) => {
    PlanActividad.belongsTo(models.PlanMantenimiento, {
      foreignKey: 'plan_id',
      as: 'plan'
    });
    PlanActividad.belongsTo(models.Sede, {
      foreignKey: 'sede_id',
      as: 'sede'
    });
    PlanActividad.belongsTo(models.Equipo, {
      foreignKey: 'equipo_id',
      as: 'equipo'
    });
  };
  
  return PlanActividad;
};

// AuditLog
module.exports.AuditLog = (sequelize, DataTypes) => {
  return sequelize.define('AuditLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    usuario_id: { type: DataTypes.INTEGER },
    accion: { type: DataTypes.STRING(100), allowNull: false },
    tabla: { type: DataTypes.STRING(100), allowNull: false },
    registro_id: { type: DataTypes.INTEGER },
    datos_anteriores: { type: DataTypes.JSON },
    datos_nuevos: { type: DataTypes.JSON },
    ip_address: { type: DataTypes.STRING(45) },
    user_agent: { type: DataTypes.TEXT }
  }, {
    tableName: 'audit_log',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });
};

// Modelos de soporte (simplificados para espacio)
module.exports.EquipoDocumento = (sequelize, DataTypes) => {
  return sequelize.define('EquipoDocumento', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    equipo_id: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.STRING(50), allowNull: false },
    nombre_archivo: { type: DataTypes.STRING(255), allowNull: false },
    ruta_archivo: { type: DataTypes.STRING(500), allowNull: false },
    uploaded_by: { type: DataTypes.INTEGER, allowNull: false }
  }, { tableName: 'equipos_documentos', timestamps: true, createdAt: 'created_at', updatedAt: false });
};

module.exports.EjecucionChecklist = (sequelize, DataTypes) => {
  return sequelize.define('EjecucionChecklist', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    mantenimiento_ejecutado_id: { type: DataTypes.INTEGER, allowNull: false },
    actividad: { type: DataTypes.STRING(200), allowNull: false },
    completada: { type: DataTypes.BOOLEAN, defaultValue: false },
    observacion: { type: DataTypes.TEXT }
  }, { tableName: 'ejecucion_checklist', timestamps: true, createdAt: 'created_at', updatedAt: false });
};

module.exports.EjecucionMaterial = (sequelize, DataTypes) => {
  return sequelize.define('EjecucionMaterial', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    mantenimiento_ejecutado_id: { type: DataTypes.INTEGER, allowNull: false },
    descripcion: { type: DataTypes.STRING(200), allowNull: false },
    cantidad: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    unidad: { type: DataTypes.STRING(20) },
    costo_total: { type: DataTypes.DECIMAL(12, 2) }
  }, { tableName: 'ejecucion_materiales', timestamps: true, createdAt: 'created_at', updatedAt: false });
};

module.exports.EjecucionEvidencia = (sequelize, DataTypes) => {
  return sequelize.define('EjecucionEvidencia', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    mantenimiento_ejecutado_id: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.ENUM('antes', 'durante', 'despues'), allowNull: false },
    nombre_archivo: { type: DataTypes.STRING(255), allowNull: false },
    ruta_archivo: { type: DataTypes.STRING(500), allowNull: false },
    uploaded_by: { type: DataTypes.INTEGER, allowNull: false }
  }, { tableName: 'ejecucion_evidencias', timestamps: true, createdAt: 'created_at', updatedAt: false });
};

module.exports.SolicitudArchivo = (sequelize, DataTypes) => {
  return sequelize.define('SolicitudArchivo', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    solicitud_id: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.ENUM('solicitud', 'respuesta', 'evidencia'), allowNull: false },
    nombre_archivo: { type: DataTypes.STRING(255), allowNull: false },
    ruta_archivo: { type: DataTypes.STRING(500), allowNull: false },
    uploaded_by: { type: DataTypes.INTEGER, allowNull: false }
  }, { tableName: 'solicitudes_archivos', timestamps: true, createdAt: 'created_at', updatedAt: false });
};