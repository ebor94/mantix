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
  VeoliaUnidadNegocio: require('./VeoliaUnidadNegocio')(sequelize, Sequelize.DataTypes),
  Tarifa: require('./Tarifa')(sequelize, Sequelize.DataTypes),
  PrimaSeguro: require('./PrimaSeguro')(sequelize, Sequelize.DataTypes),
  
  // Ahora sí los modelos que dependen de Empresa
  Afiliado: require('./Afiliado')(sequelize, Sequelize.DataTypes),
  Beneficiario: require('./Beneficiario')(sequelize, Sequelize.DataTypes),
  Seguro: require('./Seguro')(sequelize, Sequelize.DataTypes),
  ContratoValor: require('./ContratoValor')(sequelize, Sequelize.DataTypes),
  Trazabilidad: require('./Trazabilidad')(sequelize, Sequelize.DataTypes),
  Borrador: require('./Borrador')(sequelize, Sequelize.DataTypes),

  // ============================================
  // MÓDULO DE VOTACIONES
  // ============================================
  VotacionEvento: require('./VotacionEvento')(sequelize, Sequelize.DataTypes),
  VotacionVotante: require('./VotacionVotante')(sequelize, Sequelize.DataTypes),
  VotacionCandidato: require('./VotacionCandidato')(sequelize, Sequelize.DataTypes),
  VotacionVoto: require('./VotacionVoto')(sequelize, Sequelize.DataTypes),

  // ============================================
  // MÓDULO CYM — MANTENIMIENTO DE PREDIOS
  // ============================================
  CymPredio:       require('./CymPredio')(sequelize, Sequelize.DataTypes),
  CymContrato:     require('./CymContrato')(sequelize, Sequelize.DataTypes),
  CymAsignacion:   require('./CymAsignacion')(sequelize, Sequelize.DataTypes),
  CymActividad:    require('./CymActividad')(sequelize, Sequelize.DataTypes),
  CymMantenimiento:require('./CymMantenimiento')(sequelize, Sequelize.DataTypes),
  CymChecklist:    require('./CymChecklist')(sequelize, Sequelize.DataTypes),
  CymEvidencia:    require('./CymEvidencia')(sequelize, Sequelize.DataTypes),
  CymCartera:      require('./CymCartera')(sequelize, Sequelize.DataTypes),
  CymHistoricoSq:  require('./CymHistoricoSq')(sequelize, Sequelize.DataTypes),
  CymPareja:       require('./CymPareja')(sequelize, Sequelize.DataTypes),
  CymParejaMiembro:require('./CymParejaMiembro')(sequelize, Sequelize.DataTypes),

  // ============================================
  // MÓDULO R-44 PROVEEDORES — Serfunorte
  // Rutas bajo /api/r44/* (prefijo para evitar conflictos)
  // ============================================
  R44Usuario:            require('./R44Usuario')(sequelize, Sequelize.DataTypes),
  R44Proveedor:          require('./R44Proveedor')(sequelize, Sequelize.DataTypes),
  R44RepresentanteLegal: require('./R44RepresentanteLegal')(sequelize, Sequelize.DataTypes),
  R44Accionista:         require('./R44Accionista')(sequelize, Sequelize.DataTypes),
  R44InfoFinanciera:     require('./R44InfoFinanciera')(sequelize, Sequelize.DataTypes),
  R44RefBancaria:        require('./R44RefBancaria')(sequelize, Sequelize.DataTypes),
  R44RefComercial:       require('./R44RefComercial')(sequelize, Sequelize.DataTypes),
  R44SarlaftDatos:       require('./R44SarlaftDatos')(sequelize, Sequelize.DataTypes),
  R44Documento:          require('./R44Documento')(sequelize, Sequelize.DataTypes),
  R44ExtraccionLlm:      require('./R44ExtraccionLlm')(sequelize, Sequelize.DataTypes),
  R44Firma:              require('./R44Firma')(sequelize, Sequelize.DataTypes),
  R44Revision:           require('./R44Revision')(sequelize, Sequelize.DataTypes),
};

// Definir asociaciones
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;