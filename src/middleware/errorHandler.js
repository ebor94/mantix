// ============================================
// src/middleware/errorHandler.js
// ============================================
const logger = require('../utils/logger');
const { MENSAJES } = require('../config/constants');

// Etiquetas legibles para columnas del R-44 (para mensajes de error claros).
const ETIQUETAS_CAMPOS = {
  pj_nit: 'NIT', pj_razon_social: 'Razón social', pj_nombre_comercial: 'Nombre comercial',
  pj_sigla: 'Sigla', pj_direccion: 'Dirección', pj_municipio: 'Municipio', pj_departamento: 'Departamento',
  pj_telefono_fijo: 'Teléfono fijo', pj_celular: 'Celular', pj_correo: 'Correo electrónico',
  pj_persona_contacto: 'Persona de contacto', pj_tel_contacto: 'Teléfono de contacto',
  pj_ciiu_principal: 'CIIU principal', pj_ciiu_secundario: 'CIIU secundario',
  pn_numero_documento: 'Número de documento', pn_nombre_completo: 'Nombre completo',
  pn_direccion_domicilio: 'Dirección', pn_telefono_domicilio: 'Teléfono', pn_telefono_empresa: 'Teléfono de la empresa',
  pn_correo: 'Correo electrónico', pn_persona_contacto: 'Persona de contacto', pn_telefono_contacto: 'Teléfono de contacto',
  pn_ocupacion: 'Ocupación', pn_actividad_economica: 'Actividad económica', pn_ciiu: 'CIIU',
  nombres_apellidos: 'Nombres y apellidos del representante legal', numero_documento: 'Número de documento',
  razon_social_nombre: 'Nombre del accionista', porcentaje_participacion: 'Porcentaje de participación',
  entidad: 'Entidad bancaria', numero_cuenta: 'Número de cuenta', empresa: 'Empresa (referencia comercial)',
  contacto: 'Contacto', telefono: 'Teléfono', direccion: 'Dirección', ciudad: 'Ciudad',
  productos_servicios: 'Productos / servicios', cual_certificacion: 'Certificación',
  total_activos: 'Activos totales', total_pasivos: 'Pasivos totales', total_patrimonio: 'Patrimonio',
  total_ingresos_brutos: 'Ingresos operacionales', utilidad_operacional: 'Utilidad neta', anio_gravable: 'Año de declaración',
  total_empleados: 'Total de empleados',
};

function etiquetaCampo(col) {
  if (!col) return 'uno de los campos';
  if (ETIQUETAS_CAMPOS[col]) return ETIQUETAS_CAMPOS[col];
  // Fallback: quitar prefijo pj_/pn_, guiones bajos -> espacios, capitalizar.
  const limpio = col.replace(/^(pj_|pn_)/, '').replace(/_/g, ' ').trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const errorHandler = (err, req, res, next) => {
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Error de validación de Sequelize (campos obligatorios, formatos, etc.)
  if (err.name === 'SequelizeValidationError') {
    const campos = [...new Set(err.errors.map(e => etiquetaCampo(e.path)))];
    const mensaje = campos.length
      ? `Faltan datos o hay valores inválidos en: ${campos.join(', ')}.`
      : MENSAJES.ERROR_VALIDACION;
    return res.status(400).json({
      success: false,
      error: mensaje,
      message: mensaje,
      errors: err.errors.map(e => ({ field: e.path, message: e.message })),
    });
  }

  // Error de unicidad de Sequelize
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      success: false,
      message: 'El registro ya existe',
      errors: err.errors.map(e => ({
        field: e.path,
        message: `${e.path} ya está en uso`
      }))
    });
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
  }

  // Error de multer (subida de archivos): traducir a mensaje claro en español.
  if (err.name === 'MulterError') {
    const maxMb = process.env.MAX_FILE_SIZE
      ? Math.round(parseInt(process.env.MAX_FILE_SIZE, 10) / (1024 * 1024))
      : (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10);
    const mensajes = {
      LIMIT_FILE_SIZE: `El archivo supera el tamaño máximo permitido (${maxMb} MB). Reduce o comprime la imagen/PDF e inténtalo de nuevo.`,
      LIMIT_UNEXPECTED_FILE: 'Se envió un archivo en un campo no permitido.'
    };
    return res.status(400).json({
      success: false,
      message: mensajes[err.code] || `Error al subir el archivo: ${err.message}`
    });
  }

  // Errores de base de datos (longitud excedida, campo nulo, valor de ENUM
  // inválido): traducir a un 400 con mensaje claro en español que nombre el
  // campo, en vez de un 500 genérico. Así el proveedor sabe qué corregir.
  if (err.name === 'SequelizeDatabaseError') {
    const sqlMsg = err.parent?.sqlMessage || err.original?.sqlMessage || err.message || '';
    const code = err.parent?.code || err.original?.code;
    const col = (sqlMsg.match(/column '([^']+)'/i) || [])[1];
    const campo = etiquetaCampo(col);
    let mensaje;
    if (code === 'ER_DATA_TOO_LONG') {
      mensaje = `El campo "${campo}" es demasiado largo. Acórtalo e inténtalo de nuevo.`;
    } else if (code === 'ER_BAD_NULL_ERROR') {
      mensaje = `El campo "${campo}" es obligatorio.`;
    } else if (code === 'ER_WARN_DATA_OUT_OF_RANGE') {
      mensaje = `El valor del campo "${campo}" está fuera del rango permitido. Revisa que el número sea correcto.`;
    } else if (code === 'WARN_DATA_TRUNCATED' || code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
      mensaje = `El valor del campo "${campo}" no es válido.`;
    } else {
      mensaje = col
        ? `Hay un problema con el campo "${campo}". Revísalo e inténtalo de nuevo.`
        : 'No se pudieron guardar los datos. Revisa la información e inténtalo de nuevo.';
    }
    return res.status(400).json({
      success: false,
      error: mensaje,
      message: mensaje,
      errors: col ? [{ field: col, message: mensaje }] : [],
    });
  }

  // Error genérico
  const cuerpo = {
    success: false,
    message: err.message || MENSAJES.ERROR_SERVIDOR
  };
  // Datos estructurados opcionales (ver AppError). Solo se incluyen si el error
  // los trae, así que ningún error existente cambia de forma.
  if (err.detalles !== undefined) cuerpo.detalles = err.detalles;
  res.status(err.statusCode || 500).json(cuerpo);
};

module.exports = errorHandler;