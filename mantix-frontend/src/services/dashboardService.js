
// ============================================
// src/services/dashboardService.js
// ============================================
import api from './api'

export const dashboardService = {
  async getKPIs(params = {}) {
    const response = await api.get('/dashboard/kpis?mes=10&anio=2025', { params })
    console.log('Respuesta de KPIs:', response)
    return response.data
  },

  async getCumplimientoPorSede(params = {}) {
    const response = await api.get('/dashboard/cumplimiento-sede', { params })
    return response.data
  },

  async getCumplimientoPorCategoria(params = {}) {
    const response = await api.get('/dashboard/cumplimiento-categoria', { params })
    return response.data
  },

  async getEstadisticasSolicitudes(params = {}) {
    const response = await api.get('/dashboard/estadisticas-solicitudes', { params })
    return response.data
  },

  async getActividadReciente(params = {}) {
    const response = await api.get('/dashboard/actividad-reciente', { params })
    return response.data
  }
}