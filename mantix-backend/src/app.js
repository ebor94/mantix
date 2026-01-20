const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');
const path = require('path');
const fs = require('fs');

const app = express();

// ✅ Crear carpeta de uploads FUERA de src
// Si app.js está en /src, entonces __dirname es /src
// Necesitamos subir un nivel con ../
const uploadsPath = path.join(__dirname, '../uploads/evidencias');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  console.log('✅ Carpeta uploads/evidencias creada en:', uploadsPath);
}
const pdfsPath = path.join(__dirname, '../uploads/pdfs');
if (!fs.existsSync(pdfsPath)) {
  fs.mkdirSync(pdfsPath, { recursive: true });
  console.log('✅ Carpeta uploads/pdfs creada');
}
// ============================================
// CORS
// ============================================


app.use(cors({
  origin: '*' , 
  credentials: false,  
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Content-Disposition']
}));

app.options('*', cors());

// ============================================
// HELMET
// ============================================
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,  // Deshabilitar esta política
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,  // Deshabilitar CSP completamente para Swagger
}));
// ============================================
// Rate limiting
// ============================================
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 1000,
  message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.'
});
app.use('/api/', limiter);

// ============================================
// Body Parsers
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// ============================================
// Logging
// ============================================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ============================================
// Archivos estáticos - ✅ SUBIR UN NIVEL ../uploads
// ============================================
app.use('/uploads', (req, res, next) => {
  console.log('📁 Solicitud de archivo estático:', req.url);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(path.join(__dirname, '../uploads'))); // ✅ ../uploads

// ============================================
// Documentación Swagger
// ============================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ============================================
// Health check
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// Test endpoint para uploads
// ============================================
app.get('/test-uploads', (req, res) => {
  const uploadsDir = path.join(__dirname, '../uploads/evidencias'); // ✅ ../uploads
  
  try {
    const files = fs.readdirSync(uploadsDir);
    res.json({
      success: true,
      uploadsPath: uploadsDir,
      files: files.map(f => ({
        nombre: f,
        url: `http://localhost:3020/uploads/evidencias/${f}`
      }))
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      uploadsPath: uploadsDir
    });
  }
});
app.use('/uploads/pdfs', express.static(path.join(__dirname, '../uploads/pdfs')));
// ============================================
// Rutas principales
// ============================================
app.use('/api', routes);

// ============================================
// Ruta 404
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// ============================================
// Middleware de manejo de errores
// ============================================
app.use(errorHandler);

module.exports = app;