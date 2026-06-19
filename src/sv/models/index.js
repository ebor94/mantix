/**
 * sv/models/index.js
 * Registro de modelos Sequelize del módulo SerVentas.
 * Comparte la instancia `sequelize` central del backend para reusar pool/conexión.
 */
const { sequelize, Sequelize } = require('../../models');

const db = {
  sequelize,
  Sequelize,
  SvArea:      require('./Area')(sequelize, Sequelize.DataTypes),
  SvPunto:     require('./Punto')(sequelize, Sequelize.DataTypes),
  SvGrupo:     require('./Grupo')(sequelize, Sequelize.DataTypes),
  SvProducto:  require('./Producto')(sequelize, Sequelize.DataTypes),
  SvEstado:    require('./Estado')(sequelize, Sequelize.DataTypes),
  SvResultado: require('./Resultado')(sequelize, Sequelize.DataTypes),
  SvFuente:    require('./Fuente')(sequelize, Sequelize.DataTypes),
  SvRol:       require('./Rol')(sequelize, Sequelize.DataTypes),
  SvUsuario:   require('./Usuario')(sequelize, Sequelize.DataTypes),
  SvMeta:      require('./Meta')(sequelize, Sequelize.DataTypes),
  SvSesion:    require('./Sesion')(sequelize, Sequelize.DataTypes),
  // ─── CRM (Fase 1) ───
  SvPersona:           require('./Persona')(sequelize, Sequelize.DataTypes),
  SvLista:             require('./Lista')(sequelize, Sequelize.DataTypes),
  SvProspecto:         require('./Prospecto')(sequelize, Sequelize.DataTypes),
  SvProspectoProducto: require('./ProspectoProducto')(sequelize, Sequelize.DataTypes),
  SvGestion:           require('./Gestion')(sequelize, Sequelize.DataTypes),
  SvSnapshotDiario:    require('./SnapshotDiario')(sequelize, Sequelize.DataTypes),
  // ─── Empresariales / Propuestas (Fase 2) ───
  SvEmpresa:           require('./Empresa')(sequelize, Sequelize.DataTypes),
  SvPropuesta:         require('./Propuesta')(sequelize, Sequelize.DataTypes),
  SvPropuestaItem:     require('./PropuestaItem')(sequelize, Sequelize.DataTypes),
  // ─── Fidelización Empresas (Fase 6) ───
  SvContactoFideliz:   require('./ContactoFideliz')(sequelize, Sequelize.DataTypes),
  SvFechaEspecial:     require('./FechaEspecial')(sequelize, Sequelize.DataTypes),
  SvEnvio:             require('./Envio')(sequelize, Sequelize.DataTypes),
  // ─── Tracking GPS de jornadas (Fase 7) ───
  SvJornada:           require('./Jornada')(sequelize, Sequelize.DataTypes),
  SvTrackingPunto:     require('./TrackingPunto')(sequelize, Sequelize.DataTypes),
  // ─── Empresariales: categoría + documentos + propuestas archivo + presupuesto fideliz (migración 015) ───
  SvTipoDocumento:           require('./TipoDocumento')(sequelize, Sequelize.DataTypes),
  SvEmpresaDocumento:        require('./EmpresaDocumento')(sequelize, Sequelize.DataTypes),
  SvEmpresaPropuestaArchivo: require('./EmpresaPropuestaArchivo')(sequelize, Sequelize.DataTypes),
  SvFidelizMovimiento:       require('./FidelizMovimiento')(sequelize, Sequelize.DataTypes)
};

// Asociaciones
Object.keys(db).forEach((modelName) => {
  if (db[modelName] && typeof db[modelName].associate === 'function') {
    db[modelName].associate(db);
  }
});

module.exports = db;
