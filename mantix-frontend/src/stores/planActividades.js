// ============================================
// src/stores/planActividades.js
// ============================================
import { defineStore } from 'pinia'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const usePlanActividadesStore = defineStore('planActividades', {
  state: () => ({
    actividades: [],
    actividadActual: null,
    loading: false,
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0
    }
  }),

  getters: {
    actividadesActivas: (state) => state.actividades.filter(a => a.activo),
    actividadesPorSede: (state) => {
      const agrupadas = {}
      state.actividades.forEach(act => {
        const sede = act.sede?.nombre || 'Sin sede'
        if (!agrupadas[sede]) {
          agrupadas[sede] = []
        }
        agrupadas[sede].push(act)
      })
      return agrupadas
    },
    actividadesPorCategoria: (state) => {
      const agrupadas = {}
      state.actividades.forEach(act => {
        const categoria = act.categoria?.nombre || 'Sin categoría'
        if (!agrupadas[categoria]) {
          agrupadas[categoria] = []
        }
        agrupadas[categoria].push(act)
      })
      return agrupadas
    }
  },

  actions: {
    /**
     * Obtener actividades (todas o de un plan específico)
     */
    async fetchActividades(params = {}) {
      this.loading = true
      try {
        const queryParams = {
          page: params.page || this.pagination.page,
          limit: params.limit || this.pagination.limit,
          ...params
        }

        const response = await api.get('/plan-actividades', { params: queryParams })
        
        this.actividades = response.data.data
        this.pagination = {
          page: response.data.page,
          limit: response.data.limit,
          total: response.data.total,
          totalPages: response.data.totalPages
        }

        console.log('Actividades cargadas:', this.actividades)
      } catch (error) {
        console.error('Error al cargar actividades:', error)
        toast.error('Error al cargar las actividades')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Obtener actividad por ID
     */
    async fetchActividad(id) {
      this.loading = true
      try {
        const response = await api.get(`/plan-actividades/${id}`)
        this.actividadActual = response.data.data
        return response.data.data
      } catch (error) {
        console.error('Error al cargar actividad:', error)
        toast.error('Error al cargar la actividad')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Crear actividad
     */
    async crearActividad(datos) {
      this.loading = true
      try {
        const response = await api.post('/plan-actividades', datos)
        toast.success('Actividad creada exitosamente')
        
        // Agregar a la lista si ya está cargada
        if (this.actividades.length > 0) {
          this.actividades.unshift(response.data.data)
        }
        
        return response.data.data
      } catch (error) {
        console.error('Error al crear actividad:', error)
        const mensaje = error.response?.data?.message || 'Error al crear la actividad'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Actualizar actividad
     */
    async actualizarActividad(id, datos) {
      this.loading = true
      try {
        const response = await api.put(`/plan-actividades/${id}`, datos)
        toast.success('Actividad actualizada exitosamente')
        
        // Actualizar en la lista
        const index = this.actividades.findIndex(a => a.id === id)
        if (index !== -1) {
          this.actividades[index] = response.data.data
        }
        
        return response.data.data
      } catch (error) {
        console.error('Error al actualizar actividad:', error)
        toast.error('Error al actualizar la actividad')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Eliminar actividad
     */
    async eliminarActividad(id) {
      this.loading = true
      try {
        await api.delete(`/plan-actividades/${id}`)
        toast.success('Actividad eliminada exitosamente')
        
        // Quitar de la lista
        this.actividades = this.actividades.filter(a => a.id !== id)
        
        return true
      } catch (error) {
        console.error('Error al eliminar actividad:', error)
        const mensaje = error.response?.data?.message || 'Error al eliminar la actividad'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Cambiar estado (activo/inactivo)
     */
    async toggleActivo(id) {
      this.loading = true
      try {
        const response = await api.patch(`/plan-actividades/${id}/toggle`)
        toast.success(response.data.message)
        
        // Actualizar en la lista
        const index = this.actividades.findIndex(a => a.id === id)
        if (index !== -1) {
          this.actividades[index] = response.data.data
        }
        
        return response.data.data
      } catch (error) {
        console.error('Error al cambiar estado:', error)
        toast.error('Error al cambiar el estado')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Programar mantenimientos de una actividad
     */
    async programarActividad(id, data) {
      this.loading = true
      try {
        const response = await api.post(`/programar-mantenimientos/actividad/${id}`, data)
        toast.success(response.data.message)
        return response.data
      } catch (error) {
        console.error('Error al programar:', error)
        const mensaje = error.response?.data?.message || 'Error al programar mantenimientos'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Programar mantenimientos de todo un plan
     */
    async programarPlan(planId) {
      this.loading = true
      try {
        const response = await api.post(`/programar-mantenimientos/plan/${planId}`)
        toast.success(response.data.message)
        return response.data
      } catch (error) {
        console.error('Error al programar plan:', error)
        const mensaje = error.response?.data?.message || 'Error al programar mantenimientos'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Preview de programación
     */
    async previewProgramacion(params) {
      try {
        const response = await api.get('/programar-mantenimientos/preview', { params })
        return response.data.data
      } catch (error) {
        console.error('Error al obtener preview:', error)
        toast.error('Error al obtener preview')
        throw error
      }
    }
  }
})