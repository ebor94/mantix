// ============================================
// src/config/constants.js - Constantes
// ============================================
module.exports = {
  ROLES: {
    ADMIN: 1,
    SUPERVISOR: 2,
    TECNICO: 3,
    CONSULTA: 4
  },
  
  ESTADOS_MANTENIMIENTO: {
    PROGRAMADO: 1,
    EN_PROCESO: 2,
    EJECUTADO: 3,
    CANCELADO: 4,
    ATRASADO: 5,
    REPROGRAMADO: 6
  },
  
  ESTADOS_SOLICITUD: {
    PENDIENTE: 7,
    EN_REVISION: 8,
    APROBADA: 9,
    ASIGNADA: 10,
    EN_ATENCION: 11,
    RESUELTA: 12,
    RECHAZADA: 13,
    CANCELADA: 14
  },
  
  PRIORIDADES: ['baja', 'media', 'alta', 'critica'],
  
  TIPOS_MANTENIMIENTO: {
    PREVENTIVO: 1,
    CORRECTIVO: 2,
    PREDICTIVO: 3,
    MEJORA: 4
  },
  
  PERIODICIDADES: {
    DIARIO: 1,
    SEMANAL: 2,
    QUINCENAL: 3,
    MENSUAL: 4,
    BIMESTRAL: 5,
    TRIMESTRAL: 6,
    CUATRIMESTRAL: 7,
    SEMESTRAL: 8,
    ANUAL: 9
  },
  
  TIPOS_NOTIFICACION: {
    MANTENIMIENTO_PROXIMO: 'mantenimiento_proximo',
    MANTENIMIENTO_VENCIDO: 'mantenimiento_vencido',
    SOLICITUD_NUEVA: 'solicitud_nueva',
    SOLICITUD_ASIGNADA: 'solicitud_asignada',
    SOLICITUD_RESUELTA: 'solicitud_resuelta'
  },
  
  MENSAJES: {
    ERROR_SERVIDOR: 'Error interno del servidor',
    ERROR_AUTENTICACION: 'Error de autenticación',
    ERROR_AUTORIZACION: 'No tienes permisos para realizar esta acción',
    ERROR_VALIDACION: 'Error de validación de datos',
    ERROR_NO_ENCONTRADO: 'Recurso no encontrado',
    EXITO_CREAR: 'Registro creado exitosamente',
    EXITO_ACTUALIZAR: 'Registro actualizado exitosamente',
    EXITO_ELIMINAR: 'Registro eliminado exitosamente'
  }
};