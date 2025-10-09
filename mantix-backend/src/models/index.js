// ============================================
// src/models/index.js - Conexión Sequelize
// ============================================
const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  dbConfig
);

const db = {
  sequelize,
  Sequelize,
  
  // Modelos
  Rol: require('./Rol')(sequelize, Sequelize.DataTypes),
  Usuario: require('./Usuario')(sequelize, Sequelize.DataTypes),
  Sede: require('./Sede')(sequelize, Sequelize.DataTypes),
  CategoriaMantenimiento: require('./CategoriaMantenimiento')(sequelize, Sequelize.DataTypes),
  // TipoMantenimiento: require('./TipoMantenimiento')(sequelize, Sequelize.DataTypes),
  // Periodicidad: require('./Periodicidad')(sequelize, Sequelize.DataTypes),
  Estado: require('./Estado')(sequelize, Sequelize.DataTypes),
  // Proveedor: require('./Proveedor')(sequelize, Sequelize.DataTypes),
  Equipo: require('./Equipo')(sequelize, Sequelize.DataTypes),
  // EquipoDocumento: require('./EquipoDocumento')(sequelize, Sequelize.DataTypes),
  // PlanMantenimiento: require('./PlanMantenimiento')(sequelize, Sequelize.DataTypes),
  // PlanActividad: require('./PlanActividad')(sequelize, Sequelize.DataTypes),
  MantenimientoProgramado: require('./MantenimientoProgramado')(sequelize, Sequelize.DataTypes),
  MantenimientoEjecutado: require('./MantenimientoEjecutado')(sequelize, Sequelize.DataTypes),
  // EjecucionChecklist: require('./EjecucionChecklist')(sequelize, Sequelize.DataTypes),
  // EjecucionMaterial: require('./EjecucionMaterial')(sequelize, Sequelize.DataTypes),
  // EjecucionEvidencia: require('./EjecucionEvidencia')(sequelize, Sequelize.DataTypes),
  SolicitudAdicional: require('./SolicitudAdicional')(sequelize, Sequelize.DataTypes),
  // SolicitudArchivo: require('./SolicitudArchivo')(sequelize, Sequelize.DataTypes),
  // SolicitudHistorial: require('./SolicitudHistorial')(sequelize, Sequelize.DataTypes),
  Notificacion: require('./Notificacion')(sequelize, Sequelize.DataTypes),
  // AuditLog: require('./AuditLog')(sequelize, Sequelize.DataTypes)
};

// Definir asociaciones solo para modelos que existen
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;