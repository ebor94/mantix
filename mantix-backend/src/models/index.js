// ============================================
// src/models/index.js - Conexión Sequelize mantix 
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
  
  // ============================================
  // MODELOS DE MANTENIMIENTO (EXISTENTES)
  // ============================================
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

  AuditLog: require('./AuditLog')(sequelize, Sequelize.DataTypes),

  // ============================================
  // MÓDULO DE AFILIADOS Y SERVICIOS EXEQUIALES
  // ============================================
  
  // ⚠️ IMPORTANTE: Empresa y Tarifa DEBEN ir ANTES de Afiliado
  Empresa: require('./Empresa')(sequelize, Sequelize.DataTypes),
  Tarifa: require('./Tarifa')(sequelize, Sequelize.DataTypes),
  PrimaSeguro: require('./PrimaSeguro')(sequelize, Sequelize.DataTypes),
  
  // Ahora sí los modelos que dependen de Empresa
  Afiliado: require('./Afiliado')(sequelize, Sequelize.DataTypes),
  Beneficiario: require('./Beneficiario')(sequelize, Sequelize.DataTypes),
  Seguro: require('./Seguro')(sequelize, Sequelize.DataTypes),
  ContratoValor: require('./ContratoValor')(sequelize, Sequelize.DataTypes),

  // ============================================
  // MÓDULO DE VOTACIONES
  // ============================================
  VotacionEvento: require('./VotacionEvento')(sequelize, Sequelize.DataTypes),
  VotacionVotante: require('./VotacionVotante')(sequelize, Sequelize.DataTypes),
  VotacionCandidato: require('./VotacionCandidato')(sequelize, Sequelize.DataTypes),
  VotacionVoto: require('./VotacionVoto')(sequelize, Sequelize.DataTypes),
};

// Definir asociaciones
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;