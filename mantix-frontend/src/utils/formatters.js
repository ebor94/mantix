// ============================================
// src/utils/formatters.js
// ============================================
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.locale('es')
dayjs.extend(relativeTime)

export const formatDate = (date, format = 'DD/MM/YYYY') => {
  return dayjs(date).format(format)
}

export const formatDateTime = (date) => {
  return dayjs(date).format('DD/MM/YYYY HH:mm')
}

export const formatTime = (time) => {
  return dayjs(time, 'HH:mm:ss').format('HH:mm')
}

export const formatRelativeTime = (date) => {
  return dayjs(date).fromNow()
}

export const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(value)
}

export const formatPercentage = (value) => {
  return `${value.toFixed(1)}%`
}

export const getPriorityColor = (prioridad) => {
  const colors = {
    baja: 'green',
    media: 'yellow',
    alta: 'orange',
    critica: 'red'
  }
  return colors[prioridad] || 'gray'
}

export const getEstadoColor = (estadoId) => {
  const colors = {
    1: 'blue',    // Programado
    2: 'orange',  // En Proceso
    3: 'green',   // Ejecutado
    4: 'gray',    // Cancelado
    5: 'red',     // Atrasado
    6: 'yellow',  // Reprogramado
    7: 'blue',    // Pendiente
    8: 'orange',  // En Revisión
    9: 'green',   // Aprobada
    10: 'blue',   // Asignada
    11: 'orange', // En Atención
    12: 'green',  // Resuelta
    13: 'red',    // Rechazada
    14: 'gray'    // Cancelada
  }
  return colors[estadoId] || 'gray'
}