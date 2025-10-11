// ============================================
// src/stores/equipos.js - Store de Equipos
// ============================================
import { defineStore } from 'pinia'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const useEquiposStore = defineStore('equipos', {
  state: () => ({
    equipos: [],
    equipoActual: null,
    loading: false,
    filters: {
      categoria_id: null,
      sede_id: null,
      estado: null,
      search: ''
    },
    pagination: {
      page: 1,
      limit: 20,
      total: 0
    }
  }),

  getters: {
    equiposOperativos: (state) => {
      return state.equipos?.filter(e => e.estado === 'operativo') || []
    },

    equiposFueraServicio: (state) => {
      return state.equipos?.filter(e => e.estado === 'fuera_servicio') || []
    },

    equiposEnMantenimiento: (state) => {
      return state.equipos?.filter(e => e.estado === 'en_mantenimiento') || []
    },

    equiposDadosBaja: (state) => {
      return state.equipos?.filter(e => e.estado === 'dado_baja') || []
    },

    equiposFiltrados: (state) => {
      let filtered = [...(state.equipos || [])]

      if (state.filters.categoria_id) {
        filtered = filtered.filter(e => e.categoria_id === state.filters.categoria_id)
      }

      if (state.filters.sede_id) {
        filtered = filtered.filter(e => e.sede_id === state.filters.sede_id)
      }

      if (state.filters.estado) {
        filtered = filtered.filter(e => e.estado === state.filters.estado)
      }

      if (state.filters.search) {
        const search = state.filters.search.toLowerCase()
        filtered = filtered.filter(e => 
          e.nombre?.toLowerCase().includes(search) ||
          e.codigo?.toLowerCase().includes(search) ||
          e.marca?.toLowerCase().includes(search) ||
          e.modelo?.toLowerCase().includes(search)
        )
      }

      return filtered
    },

    totalPages: (state) => {
      return Math.ceil(state.pagination.total / state.pagination.limit)
    }
  },

  actions: {
    // Obtener todos los equipos
    async fetchEquipos(params = {}) {
      this.loading = true
      try {
        const response = await api.get('/equipos', { params })
        console.log('Respuesta de API equipos:', response)
        
        // El interceptor ya extrae response.data
        // response puede ser un array directamente o un objeto con data
        if (Array.isArray(response)) {
          this.equipos = response
          this.pagination.total = response.length
        } else if (response.data && Array.isArray(response.data)) {
          this.equipos = response.data
          this.pagination.total = response.total || response.data.length
        } else {
          this.equipos = []
          this.pagination.total = 0
        }
        
        console.log('Equipos guardados en store:', this.equipos)
        return this.equipos
      } catch (error) {
        console.error('Error al cargar equipos:', error)
        toast.error('Error al cargar los equipos')
        this.equipos = []
        return []
      } finally {
        this.loading = false
      }
    },

    // Obtener un equipo por ID
    async fetchEquipo(id) {
      this.loading = true
      try {
        const response = await api.get(`/equipos/${id}`)
        console.log('Respuesta completa API equipo:', response)
        
        // El interceptor ya extrae response.data
        // Así que response ya es el objeto del equipo directamente
        if (response && response.id) {
          // Si response tiene un 'id', es el equipo directamente
          this.equipoActual = response
        } else if (response.data && response.data.id) {
          // Si response.data tiene un 'id', el equipo está ahí
          this.equipoActual = response.data
        } else {
          console.error('Formato de respuesta inesperado:', response)
          this.equipoActual = null
        }
        
        console.log('Equipo actual guardado:', this.equipoActual)
        return this.equipoActual
      } catch (error) {
        console.error('Error al cargar equipo:', error)
        toast.error('Error al cargar el equipo')
        this.equipoActual = null
        return null
      } finally {
        this.loading = false
      }
    },

    // Crear nuevo equipo
    async crearEquipo(data) {
      this.loading = true
      try {
        const response = await api.post('/equipos', data)
        toast.success('Equipo creado correctamente')
        
        // Actualizar lista
        await this.fetchEquipos()
        
        return response.data
      } catch (error) {
        console.error('Error al crear equipo:', error)
        toast.error('Error al crear el equipo')
        return null
      } finally {
        this.loading = false
      }
    },

    // Actualizar equipo
    async actualizarEquipo(id, data) {
      this.loading = true
      try {
        const response = await api.put(`/equipos/${id}`, data)
        toast.success('Equipo actualizado correctamente')
        
        // Actualizar lista
        await this.fetchEquipos()
        
        return response.data
      } catch (error) {
        console.error('Error al actualizar equipo:', error)
        toast.error('Error al actualizar el equipo')
        return null
      } finally {
        this.loading = false
      }
    },

    // Eliminar equipo
    async eliminarEquipo(id) {
      this.loading = true
      try {
        await api.delete(`/equipos/${id}`)
        toast.success('Equipo eliminado correctamente')
        
        // Actualizar lista
        await this.fetchEquipos()
        
        return true
      } catch (error) {
        console.error('Error al eliminar equipo:', error)
        toast.error('Error al eliminar el equipo')
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
        categoria_id: null,
        sede_id: null,
        estado: null,
        search: ''
      }
    },

    // Actualizar paginación
    updatePagination(page) {
      this.pagination.page = page
      this.fetchEquipos({
        page: this.pagination.page,
        limit: this.pagination.limit,
        ...this.filters
      })
    }
  }
})