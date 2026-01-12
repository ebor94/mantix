// ============================================
// src/models/index.js - Conexión Sequelize (CORREGIDO)
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
  UsuarioCategoria: require('./UsuarioCategoria')(sequelize, Sequelize.DataTypes), 
  TipoMantenimiento: require('./TipoMantenimiento')(sequelize, Sequelize.DataTypes),
  Periodicidad: require('./Periodicidad')(sequelize, Sequelize.DataTypes),
  Estado: require('./Estado')(sequelize, Sequelize.DataTypes),
  
  // Modelos de Proveedores
  Proveedor: require('./Proveedor')(sequelize, Sequelize.DataTypes),
  ContactoProveedor: require('./ContactoProveedor')(sequelize, Sequelize.DataTypes),
  
  Equipo: require('./Equipo')(sequelize, Sequelize.DataTypes),
  PlanMantenimiento: require('./PlanMantenimiento')(sequelize, Sequelize.DataTypes),
  PlanActividad: require('./PlanActividad')(sequelize, Sequelize.DataTypes),
  MantenimientoProgramado: require('./MantenimientoProgramado')(sequelize, Sequelize.DataTypes),
  MantenimientoNovedad: require('./MantenimientoNovedad')(sequelize, Sequelize.DataTypes),
  NovedadPlantilla: require('./NovedadPlantilla')(sequelize, Sequelize.DataTypes),
  MantenimientoEjecutado: require('./MantenimientoEjecutado')(sequelize, Sequelize.DataTypes),
  EjecucionChecklist: require('./EjecucionChecklist')(sequelize, Sequelize.DataTypes),
  EjecucionMaterial: require('./EjecucionMaterial')(sequelize, Sequelize.DataTypes),
  EjecucionEvidencia: require('./EjecucionEvidencia')(sequelize, Sequelize.DataTypes),
  SolicitudAdicional: require('./SolicitudAdicional')(sequelize, Sequelize.DataTypes),
Dependencia: require('./Dependencia')(sequelize, Sequelize.DataTypes),

  Requisito: require('./Requisito')(sequelize, Sequelize.DataTypes),  
  RequisitoCategoria: require('./RequisitoCategoria')(sequelize, Sequelize.DataTypes),
  
  Notificacion: require('./Notificacion')(sequelize, Sequelize.DataTypes),
};

// Definir asociaciones
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;