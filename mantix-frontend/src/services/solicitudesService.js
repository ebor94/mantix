
// ============================================
// src/services/solicitudesService.js
// ============================================
import api from './api'

export const solicitudesService = {
  async getAll(params = {}) {
    const response = await api.get('/solicitudes', { params })
    return response.data
  },

  async getById(id) {
    const response = await api.get(`/solicitudes/${id}`)
    return response.data
  },

  async crear(data) {
    const response = await api.post('/solicitudes', data)
    return response.data
  },

  async asignar(id, data) {
    const response = await api.put(`/solicitudes/${id}/asignar`, data)
    return response.data
  },

  async cerrar(id, data) {
    const response = await api.put(`/solicitudes/${id}/cerrar`, data)
    return response.data
  }
}