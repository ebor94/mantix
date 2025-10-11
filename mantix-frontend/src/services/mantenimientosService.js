// ============================================
// src/services/mantenimientosService.js
// ============================================
import api from './api'

export const mantenimientosService = {
  async getAll(params = {}) {
    const response = await api.get('/mantenimientos', { params })
    return response.data
  },

  async getById(id) {
    const response = await api.get(`/mantenimientos/${id}`)
    return response.data
  },

  async getDelDia() {
    const response = await api.get('/mantenimientos/hoy')
    return response.data
  },

  async getProximos() {
    const response = await api.get('/mantenimientos/proximos')
    return response.data
  },

  async getAtrasados() {
    const response = await api.get('/mantenimientos/atrasados')
    return response.data
  },

  async reprogramar(id, data) {
    const response = await api.put(`/mantenimientos/${id}/reprogramar`, data)
    return response.data
  },

  async registrarEjecucion(id, data) {
    const response = await api.post(`/mantenimientos/${id}/ejecutar`, data)
    return response.data
  }
}