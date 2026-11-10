// Proyección de un error apta para logs: nunca message, sqlMessage, sql ni parameters
// ("Duplicate entry '…'" expone datos del beneficiario). Es la misma de Portería, sin nada propio del módulo.
module.exports = require('../../porteria/utils/errorSeguro');
