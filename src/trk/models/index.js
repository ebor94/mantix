// ============================================
// src/trk/models/index.js — Modelos TRIKIPELUDOS (tablas trk_*)
// Se registran en la instancia central (src/models/index.js). El esquema lo crean
// las migraciones de src/trk/migrations; nunca sequelize.sync.
// ============================================
module.exports = (sequelize, DataTypes) => {
  const modelos = {
  TrkRubrica:             require('./TrkRubrica')(sequelize, DataTypes),
  TrkCriterio:            require('./TrkCriterio')(sequelize, DataTypes),
  TrkCategoria:           require('./TrkCategoria')(sequelize, DataTypes),
  TrkParticipante:        require('./TrkParticipante')(sequelize, DataTypes),
  TrkAcceso:              require('./TrkAcceso')(sequelize, DataTypes),
  TrkCalificacion:        require('./TrkCalificacion')(sequelize, DataTypes),
  TrkCalificacionDetalle: require('./TrkCalificacionDetalle')(sequelize, DataTypes),
  TrkBorrador:            require('./TrkBorrador')(sequelize, DataTypes),
  TrkAuditoria:           require('./TrkAuditoria')(sequelize, DataTypes),
  TrkEventoEstado:        require('./TrkEventoEstado')(sequelize, DataTypes),
  TrkRankingSnapshot:     require('./TrkRankingSnapshot')(sequelize, DataTypes),
  TrkImportacion:         require('./TrkImportacion')(sequelize, DataTypes)
  };
  // El sequelize.sync() que Mantix ejecuta al arrancar no debe crear ni tocar tablas trk_*:
  // su esquema (nombres de índices y FKs según §8.0) lo controlan solo las migraciones.
  for (const modelo of Object.values(modelos)) {
    modelo.sync = async function syncNeutralizado() { return this; };
  }
  return modelos;
};
