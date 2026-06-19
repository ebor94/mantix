/**
 * identity/models/index.js
 * Registra los modelos del módulo de identidad SSO sobre el sequelize central.
 */
const { sequelize, Sequelize } = require('../../models');

const db = {
  sequelize,
  Sequelize,
  OrgIdentidad:  require('./Identidad')(sequelize, Sequelize.DataTypes),
  OrgSesion:     require('./Sesion')(sequelize, Sequelize.DataTypes),
  OrgAplicacion: require('./Aplicacion')(sequelize, Sequelize.DataTypes)
};

Object.keys(db).forEach((name) => {
  if (db[name] && typeof db[name].associate === 'function') db[name].associate(db);
});

module.exports = db;
