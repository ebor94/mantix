require('dotenv').config();
const app = require('./src/app');
const { sequelize } = require('./src/models');
const logger = require('./src/utils/logger');
const cronService = require('./src/services/cronService');

const PORT = process.env.PORT || 3020;

// Verificar conexión a la base de datos
sequelize.authenticate()
  .then(() => {
    logger.info('✅ Conexión a la base de datos establecida correctamente');
    
    // Sincronizar modelos (solo en desarrollo)
    if (process.env.NODE_ENV === 'development') {
      return sequelize.sync({ alter: false });
    }
  })
  .then(() => {
    // Iniciar tareas programadas
    cronService.start();
    logger.info('✅ Tareas programadas iniciadas');
    
    // Iniciar servidor
    app.listen(PORT, () => {
      logger.info(`🚀 Servidor Mantix corriendo en puerto ${PORT}`);
      logger.info(`📚 Documentación API: http://localhost:${PORT}/api-docs`);
      logger.info(`🌍 Ambiente: ${process.env.NODE_ENV}`);
    });
  })
  .catch(err => {
    logger.error('❌ Error al iniciar el servidor:', err);
    process.exit(1);
  });

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  logger.error('❌ Unhandled Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('❌ Uncaught Exception:', err);
  process.exit(1);
});