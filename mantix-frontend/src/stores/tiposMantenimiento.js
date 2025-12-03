// ============================================
// src/stores/tiposMantenimiento.js
// ============================================
import { defineStore } from 'pinia'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const useTiposMantenimientoStore = defineStore('tiposMantenimiento', {
  state: () => ({
    tipos: [],
    tipoActual: null,
    loading: false,
    pagination: {
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0
    },
    filtros: {
      buscar: ''
    }
  }),

  getters: {
    /**
     * Obtener tipos como opciones para select
     */
    tiposParaSelect: (state) => {
      return state.tipos.map(tipo => ({
        value: tipo.id,
        label: tipo.nombre,
        descripcion: tipo.descripcion
      }))
    },

    /**
     * Buscar tipo por ID
     */
    obtenerTipoPorId: (state) => {
      return (id) => state.tipos.find(t => t.id === id)
    }
  },

  actions: {
    /**
     * Obtener lista de tipos con paginación
     */
    async fetchTipos(params = {}) {
      this.loading = true
      try {
        const queryParams = {
          page: params.page || this.pagination.page,
          limit: params.limit || this.pagination.limit,
          buscar: params.buscar || this.filtros.buscar
        }

        // Limpiar parámetros vacíos
        Object.keys(queryParams).forEach(key => {
          if (queryParams[key] === null || queryParams[key] === '') {
            delete queryParams[key]
          }
        })

        const response = await api.get('/tipos-mantenimiento', { params: queryParams })
        
        this.tipos = response.data
        this.pagination = {
          page: response.data.page,
          limit: response.data.limit,
          total: response.data.total,
          totalPages: response.data.totalPages
        }
      } catch (error) {
        console.error('Error al cargar tipos de mantenimiento:', error)
        toast.error('Error al cargar los tipos de mantenimiento')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Obtener todos los tipos sin paginación (para selects)
     */
    async fetchTodosTipos() {
      this.loading = true
      try {
        const response = await api.get('/tipos-mantenimiento', {
          params: { all: true }
        })
        
        this.tipos = response.data.data
      } catch (error) {
        console.error('Error al cargar tipos de mantenimiento:', error)
        toast.error('Error al cargar los tipos de mantenimiento')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Obtener tipo por ID
     */
    async fetchTipo(id) {
      this.loading = true
      try {
        const response = await api.get(`/tipos-mantenimiento/${id}`)
        this.tipoActual = response.data.data
        return response.data.data
      } catch (error) {
        console.error('Error al cargar tipo de mantenimiento:', error)
        toast.error('Error al cargar el tipo de mantenimiento')
        this.tipoActual = null
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Crear tipo de mantenimiento
     */
    async crearTipo(datos) {
      this.loading = true
      try {
        const response = await api.post('/tipos-mantenimiento', datos)
        toast.success('Tipo de mantenimiento creado exitosamente')
        await this.fetchTipos()
        return response.data.data
      } catch (error) {
        console.error('Error al crear tipo de mantenimiento:', error)
        const mensaje = error.response?.data?.message || 'Error al crear el tipo de mantenimiento'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Actualizar tipo de mantenimiento
     */
    async actualizarTipo(id, datos) {
      this.loading = true
      try {
        const response = await api.put(`/tipos-mantenimiento/${id}`, datos)
        toast.success('Tipo de mantenimiento actualizado exitosamente')
        
        // Actualizar en la lista
        const index = this.tipos.findIndex(t => t.id === id)
        if (index !== -1) {
          this.tipos[index] = response.data.data
        }
        
        // Actualizar tipoActual si es el mismo
        if (this.tipoActual?.id === id) {
          this.tipoActual = response.data.data
        }
        
        return response.data.data
      } catch (error) {
        console.error('Error al actualizar tipo de mantenimiento:', error)
        const mensaje = error.response?.data?.message || 'Error al actualizar el tipo de mantenimiento'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Eliminar tipo de mantenimiento
     */
    async eliminarTipo(id) {
      this.loading = true
      try {
        await api.delete(`/tipos-mantenimiento/${id}`)
        toast.success('Tipo de mantenimiento eliminado exitosamente')
        
        // Quitar de la lista
        this.tipos = this.tipos.filter(t => t.id !== id)
        
        return true
      } catch (error) {
        console.error('Error al eliminar tipo de mantenimiento:', error)
        const mensaje = error.response?.data?.message || 'Error al eliminar el tipo de mantenimiento'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Obtener estadísticas del tipo
     */
    async fetchEstadisticas(id) {
      try {
        const response = await api.get(`/tipos-mantenimiento/${id}/estadisticas`)
        return response.data.data
      } catch (error) {
        console.error('Error al cargar estadísticas:', error)
        toast.error('Error al cargar estadísticas')
        throw error
      }
    },

    /**
     * Aplicar filtros
     */
    aplicarFiltros(filtros) {
      this.filtros = { ...this.filtros, ...filtros }
      this.pagination.page = 1
      this.fetchTipos()
    },

    /**
     * Limpiar filtros
     */
    limpiarFiltros() {
      this.filtros = {
        buscar: ''
      }
      this.pagination.page = 1
      this.fetchTipos()
    },

    /**
     * Cambiar página
     */
    cambiarPagina(page) {
      this.pagination.page = page
      this.fetchTipos()
    }
  }
})