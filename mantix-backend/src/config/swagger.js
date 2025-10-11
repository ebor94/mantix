// ============================================
// src/config/swagger.js
// ============================================
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Mantix API',
      version: '1.0.0',
      description: 'API para el sistema de gestión de mantenimiento Mantix',
      contact: {
        name: 'Mantix Support',
        email: 'coordticcucuta@losolivos.co'
      },
      license: {
        name: 'CopyRight,Tecnologias de la informacion, Derechos reservados serfunorte los olivos',
        url: 'https://cucuta.losolivos.co/'
      }
    },
    servers: [
      {
        url: 'http://localhost:3020',
        description: 'Servidor de desarrollo'
      },
      {
        url: 'http://localhost:3020/api',
        description: 'API de desarrollo'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Ingresa tu token JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Auth',
        description: 'Autenticación y autorización'
      },
      {
        name: 'Usuarios',
        description: 'Gestión de usuarios'
      },
      {
        name: 'Sedes',
        description: 'Gestión de sedes'
      },
      {
        name: 'Equipos',
        description: 'Gestión de equipos'
      },
      {
        name: 'Mantenimientos',
        description: 'Gestión de mantenimientos'
      },
      {
        name: 'Solicitudes',
        description: 'Gestión de solicitudes'
      },
      {
        name: 'Dashboard',
        description: 'Estadísticas y reportes'
      }
    ]
  },
  // Rutas donde Swagger buscará los comentarios de documentación
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js',
    './src/models/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;