// ============================================
// src/stores/solicitudes.js - Store de Solicitudes R-275
// ============================================
import { defineStore } from 'pinia'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const useSolicitudesStore = defineStore('solicitudes', {
  state: () => ({
    solicitudes: [],
    solicitudActual: null,
    loading: false,
    filters: {
      estado_id: null,
      sede_id: null,
      prioridad: null,
      search: ''
    },
    pagination: {
      page: 1,
      limit: 20,
      total: 0
    }
  }),

  getters: {
    solicitudesPendientes: (state) => {
      return state.solicitudes.filter(s => 
        s.estado?.nombre === 'Pendiente' || s.estado?.nombre === 'En Revisión'
      )
    },

    solicitudesAprobadas: (state) => {
      return state.solicitudes.filter(s => s.estado?.nombre === 'Aprobada')
    },

    solicitudesAsignadas: (state) => {
      return state.solicitudes.filter(s => s.estado?.nombre === 'Asignada')
    },

    solicitudesCerradas: (state) => {
      return state.solicitudes.filter(s => 
        s.estado?.nombre === 'Cerrada' || s.estado?.nombre === 'Rechazada'
      )
    },

    solicitudesFiltradas: (state) => {
      let filtered = [...state.solicitudes]

      if (state.filters.estado_id) {
        filtered = filtered.filter(s => s.estado_id === state.filters.estado_id)
      }

      if (state.filters.sede_id) {
        filtered = filtered.filter(s => s.sede_id === state.filters.sede_id)
      }

      if (state.filters.prioridad) {
        filtered = filtered.filter(s => s.prioridad === state.filters.prioridad)
      }

      if (state.filters.search) {
        const search = state.filters.search.toLowerCase()
        filtered = filtered.filter(s => 
          s.descripcion?.toLowerCase().includes(search) ||
          s.solicitante?.toLowerCase().includes(search) ||
          s.area?.toLowerCase().includes(search)
        )
      }

      return filtered
    },

    totalPages: (state) => {
      return Math.ceil(state.pagination.total / state.pagination.limit)
    }
  },

  actions: {
    // Obtener todas las solicitudes
    async fetchSolicitudes(params = {}) {
      this.loading = true
      try {
        const response = await api.get('/solicitudes', { params })
        this.solicitudes = response.data
        this.pagination.total = response.total || response.data.length
        return response.data
      } catch (error) {
        console.error('Error al cargar solicitudes:', error)
        toast.error('Error al cargar las solicitudes')
        return []
      } finally {
        this.loading = false
      }
    },

    // Obtener una solicitud por ID
    async fetchSolicitud(id) {
      this.loading = true
      try {
        const response = await api.get(`/solicitudes/${id}`)
        this.solicitudActual = response.data
        return response.data
      } catch (error) {
        console.error('Error al cargar solicitud:', error)
        toast.error('Error al cargar la solicitud')
        return null
      } finally {
        this.loading = false
      }
    },

    // Crear nueva solicitud
    async crearSolicitud(data) {
      this.loading = true
      try {
        const response = await api.post('/solicitudes', data)
        toast.success('Solicitud creada correctamente')
        
        // Actualizar lista
        await this.fetchSolicitudes()
        
        return response.data
      } catch (error) {
        console.error('Error al crear solicitud:', error)
        toast.error('Error al crear la solicitud')
        return null
      } finally {
        this.loading = false
      }
    },

    // Actualizar solicitud
    async actualizarSolicitud(id, data) {
      this.loading = true
      try {
        const response = await api.put(`/solicitudes/${id}`, data)
        toast.success('Solicitud actualizada correctamente')
        
        // Actualizar lista
        await this.fetchSolicitudes()
        
        return response.data
      } catch (error) {
        console.error('Error al actualizar solicitud:', error)
        toast.error('Error al actualizar la solicitud')
        return null
      } finally {
        this.loading = false
      }
    },

    // Aprobar solicitud
    async aprobarSolicitud(id, observaciones = '') {
      this.loading = true
      try {
        const response = await api.post(`/solicitudes/${id}/aprobar`, { observaciones })
        toast.success('Solicitud aprobada correctamente')
        
        // Actualizar lista
        await this.fetchSolicitudes()
        
        return response.data
      } catch (error) {
        console.error('Error al aprobar solicitud:', error)
        toast.error('Error al aprobar la solicitud')
        return null
      } finally {
        this.loading = false
      }
    },

    // Asignar solicitud a técnico
    async asignarSolicitud(id, data) {
      this.loading = true
      try {
        const response = await api.post(`/solicitudes/${id}/asignar`, data)
        toast.success('Solicitud asignada correctamente')
        
        // Actualizar lista
        await this.fetchSolicitudes()
        
        return response.data
      } catch (error) {
        console.error('Error al asignar solicitud:', error)
        toast.error('Error al asignar la solicitud')
        return null
      } finally {
        this.loading = false
      }
    },

    // Cerrar solicitud
    async cerrarSolicitud(id, data) {
      this.loading = true
      try {
        const response = await api.post(`/solicitudes/${id}/cerrar`, data)
        toast.success('Solicitud cerrada correctamente')
        
        // Actualizar lista
        await this.fetchSolicitudes()
        
        return response.data
      } catch (error) {
        console.error('Error al cerrar solicitud:', error)
        toast.error('Error al cerrar la solicitud')
        return null
      } finally {
        this.loading = false
      }
    },

    // Eliminar solicitud
    async eliminarSolicitud(id) {
      this.loading = true
      try {
        await api.delete(`/solicitudes/${id}`)
        toast.success('Solicitud eliminada correctamente')
        
        // Actualizar lista
        await this.fetchSolicitudes()
        
        return true
      } catch (error) {
        console.error('Error al eliminar solicitud:', error)
        toast.error('Error al eliminar la solicitud')
        return false
      } finally {
        this.loading = false
      }
    },

    // Actualizar filtros
    updateFilters(filters) {
      this.filters = { ...this.filters, ...filters }
    },

    // Limpiar filtros
    clearFilters() {
      this.filters = {
        estado_id: null,
        sede_id: null,
        prioridad: null,
        search: ''
      }
    },

    // Actualizar paginación
    updatePagination(page) {
      this.pagination.page = page
      this.fetchSolicitudes({
        page: this.pagination.page,
        limit: this.pagination.limit,
        ...this.filters
      })
    }
  }
})