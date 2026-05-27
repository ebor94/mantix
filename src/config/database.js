// =================src/config/database.js===========================
//
// typeCast: el driver mysql2 devuelve BIT(1) como Buffer por defecto, lo
// que rompe comparaciones en el frontend ({ type:'Buffer', data:[1] } !== 1).
// Forzamos el casteo a número entero (0/1) para todas las columnas BIT(N<=8).
//
const bitToNumberCast = function (field, next) {
  if (field.type === 'BIT' && field.length <= 8) {
    const bytes = field.buffer();
    return bytes && bytes.length ? bytes[0] : null;
  }
  return next();
};

module.exports = {
  development: {
    host: process.env.DB_HOST ,
    port: process.env.DB_PORT ,
    database: process.env.DB_NAME ,
    username: process.env.DB_USER ,
    password: process.env.DB_PASSWORD ,
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    timezone: '-05:00', // Colombia timezone
    dialectOptions: {
      typeCast: bitToNumberCast
    },
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: true
    }
  },
  production: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    },
    timezone: '-05:00',
    dialectOptions: {
      typeCast: bitToNumberCast
    },
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: true
    }
  }
};