// ============================================
// src/stores/mantenimientos.js - Store de Mantenimientos
// ============================================
import { defineStore } from 'pinia'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const useMantenimientosStore = defineStore('mantenimientos', {
  state: () => ({
    mantenimientos: [],
    mantenimientosHoy: [],
    mantenimientosProximos: [],
    mantenimientosAtrasados: [],
    mantenimientoActual: null,
    loading: false,
    filters: {
      sede_id: null,
      categoria_id: null,
      estado_id: null,
      fecha_inicio: null,
      fecha_fin: null,
      search: ''
    },
    pagination: {
      page: 1,
      limit: 20,
      total: 0
    }
  }),

  getters: {
    mantenimientosFiltrados: (state) => {
      let filtered = [...state.mantenimientos]

      if (state.filters.sede_id) {
        filtered = filtered.filter(m => m.actividad?.sede_id === state.filters.sede_id)
      }

      if (state.filters.categoria_id) {
        filtered = filtered.filter(m => m.actividad?.categoria_id === state.filters.categoria_id)
      }

      if (state.filters.estado_id) {
        filtered = filtered.filter(m => m.estado_id === state.filters.estado_id)
      }

      if (state.filters.search) {
        const search = state.filters.search.toLowerCase()
        filtered = filtered.filter(m => 
          m.actividad?.nombre?.toLowerCase().includes(search) ||
          m.actividad?.sede?.nombre?.toLowerCase().includes(search)
        )
      }

      return filtered
    },

    totalPages: (state) => {
      return Math.ceil(state.pagination.total / state.pagination.limit)
    }
  },

  actions: {
    // Obtener mantenimientos programados
    async fetchMantenimientos(params = {}) {
      this.loading = true
      try {
        const response = await api.get('/mantenimientos', { params })
        this.mantenimientos = response.data
        this.pagination.total = response.total || response.data.length
        return response.data
      } catch (error) {
        console.error('Error al cargar mantenimientos:', error)
        toast.error('Error al cargar los mantenimientos')
        return []
      } finally {
        this.loading = false
      }
    },

    // Obtener mantenimientos de hoy
    async fetchMantenimientosHoy() {
      this.loading = true
      try {
        const response = await api.get('/mantenimientos/dia/hoy')
        this.mantenimientosHoy = response.data
        return response.data
      } catch (error) {
        console.error('Error al cargar mantenimientos de hoy:', error)
        this.mantenimientosHoy = []
        return []
      } finally {
        this.loading = false
      }
    },

    // Obtener mantenimientos próximos
    async fetchMantenimientosProximos() {
      this.loading = true
      try {
        const response = await api.get('/mantenimientos/proximos')
        this.mantenimientosProximos = response.data
        return response.data
      } catch (error) {
        console.error('Error al cargar mantenimientos próximos:', error)
        this.mantenimientosProximos = []
        return []
      } finally {
        this.loading = false
      }
    },

    // Obtener mantenimientos atrasados
    async fetchMantenimientosAtrasados() {
      this.loading = true
      try {
        const response = await api.get('/mantenimientos/atrasados')
        this.mantenimientosAtrasados = response.data
        return response.data
      } catch (error) {
        console.error('Error al cargar mantenimientos atrasados:', error)
        this.mantenimientosAtrasados = []
        return []
      } finally {
        this.loading = false
      }
    },

    // Obtener detalle de mantenimiento
    async fetchMantenimiento(id) {
      this.loading = true
      try {
        const response = await api.get(`/mantenimientos/${id}`)
        this.mantenimientoActual = response.data
        return response.data
      } catch (error) {
        console.error('Error al cargar mantenimiento:', error)
        toast.error('Error al cargar el mantenimiento')
        return null
      } finally {
        this.loading = false
      }
    },

    // Registrar ejecución de mantenimiento
    async ejecutarMantenimiento(id, data) {
      this.loading = true
      try {
        const response = await api.post(`/mantenimientos/${id}/ejecutar`, data)
        toast.success('Mantenimiento ejecutado correctamente')
        
        // Actualizar lista
        await this.fetchMantenimientos()
        await this.fetchMantenimientosHoy()
        
        return response.data
      } catch (error) {
        console.error('Error al ejecutar mantenimiento:', error)
        toast.error('Error al ejecutar el mantenimiento')
        return null
      } finally {
        this.loading = false
      }
    },

    // Reprogramar mantenimiento
    async reprogramarMantenimiento(id, data) {
      this.loading = true
      try {
        const response = await api.put(`/mantenimientos/${id}/reprogramar`, data)
        toast.success('Mantenimiento reprogramado correctamente')
        
        // Actualizar lista
        await this.fetchMantenimientos()
        
        return response.data
      } catch (error) {
        console.error('Error al reprogramar mantenimiento:', error)
        toast.error('Error al reprogramar el mantenimiento')
        return null
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
        sede_id: null,
        categoria_id: null,
        estado_id: null,
        fecha_inicio: null,
        fecha_fin: null,
        search: ''
      }
    },

    // Actualizar paginación
    updatePagination(page) {
      this.pagination.page = page
      this.fetchMantenimientos({
        page: this.pagination.page,
        limit: this.pagination.limit,
        ...this.filters
      })
    }
  }
})