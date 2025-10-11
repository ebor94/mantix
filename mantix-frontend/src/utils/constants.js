// ============================================
// src/utils/constants.js
// ============================================
export const ROLES = {
  ADMIN: 1,
  SUPERVISOR: 2,
  TECNICO: 3,
  CONSULTA: 4
}

export const ESTADOS_MANTENIMIENTO = {
  PROGRAMADO: 1,
  EN_PROCESO: 2,
  EJECUTADO: 3,
  CANCELADO: 4,
  ATRASADO: 5,
  REPROGRAMADO: 6
}

export const ESTADOS_SOLICITUD = {
  PENDIENTE: 7,
  EN_REVISION: 8,
  APROBADA: 9,
  ASIGNADA: 10,
  EN_ATENCION: 11,
  RESUELTA: 12,
  RECHAZADA: 13,
  CANCELADA: 14
}

export const PRIORIDADES = {
  BAJA: { value: 'baja', label: 'Baja', color: 'green' },
  MEDIA: { value: 'media', label: 'Media', color: 'yellow' },
  ALTA: { value: 'alta', label: 'Alta', color: 'orange' },
  CRITICA: { value: 'critica', label: 'Crítica', color: 'red' }
}

export const MENU_ITEMS = [
  { 
    name: 'Dashboard', 
    path: '/dashboard', 
    icon: 'ChartBarIcon',
    roles: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.TECNICO, ROLES.CONSULTA]
  },
  { 
    name: 'Mantenimientos', 
    path: '/mantenimientos', 
    icon: 'WrenchIcon',
    roles: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.TECNICO]
  },
  { 
    name: 'Solicitudes R-275', 
    path: '/solicitudes', 
    icon: 'DocumentTextIcon',
    roles: [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.TECNICO]
  },
  { 
    name: 'Equipos', 
    path: '/equipos', 
    icon: 'CpuChipIcon',
    roles: [ROLES.ADMIN, ROLES.SUPERVISOR]
  },
  { 
    name: 'Reportes', 
    path: '/reportes', 
    icon: 'ChartPieIcon',
    roles: [ROLES.ADMIN, ROLES.SUPERVISOR]
  },
  { 
    name: 'Configuración', 
    path: '/configuracion', 
    icon: 'CogIcon',
    roles: [ROLES.ADMIN]
  }
]
