// src/stores/mantenimientoNovedades.js
import { defineStore } from 'pinia'
import api from '@/services/api'

export const useMantenimientoNovedadesStore = defineStore('mantenimientoNovedades', {
  state: () => ({
    novedades: [],
    novedadActual: null,
    plantillas: [],
    estadisticas: null,
    loading: false,
    error: null
  }),

  getters: {
    // Novedades agrupadas por tipo
    novedadesPorTipo: (state) => {
      return state.novedades.reduce((acc, novedad) => {
        if (!acc[novedad.tipo_novedad]) {
          acc[novedad.tipo_novedad] = []
        }
        acc[novedad.tipo_novedad].push(novedad)
        return acc
      }, {})
    },

    // Novedades visibles para proveedor
    novedadesVisiblesProveedor: (state) => {
      return state.novedades.filter(n => n.es_visible_proveedor)
    },

    // Última novedad registrada
    ultimaNovedad: (state) => {
      return state.novedades.length > 0 ? state.novedades[0] : null
    },

    // Total de reprogramaciones
    totalReprogramaciones: (state) => {
      return state.novedades.filter(n => n.tipo_novedad === 'reprogramacion').length
    },

    // Plantillas por tipo
    plantillasPorTipo: (state) => (tipo) => {
      return state.plantillas.filter(p => p.tipo_novedad === tipo)
    }
  },

  actions: {
    // Cargar novedades de un mantenimiento
    async fetchNovedades(mantenimientoId, filtros = {}) {
      this.loading = true
      this.error = null
      try {
        const params = new URLSearchParams(filtros)
        const response = await api.get(
          `/mantenimiento-novedades/mantenimiento/${mantenimientoId}?${params}`
        )
        console.log('Novedades cargadas:', response)
        this.novedades = response
        return response
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al cargar novedades'
        throw error
      } finally {
        this.loading = false
      }
    },

    // Obtener novedad por ID
    async fetchNovedad(novedadId) {
      this.loading = true
      this.error = null
      try {
        const response = await api.get(`/mantenimiento-novedades/${novedadId}`)
        this.novedadActual = response.data
        return response.data
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al cargar novedad'
        throw error
      } finally {
        this.loading = false
      }
    },

    // Crear novedad
    async crearNovedad(novedadData) {
      this.loading = true
      this.error = null
      try {
        const response = await api.post('/mantenimiento-novedades', novedadData)
        this.novedades.unshift(response.data)
        return response.data
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al crear novedad'
        throw error
      } finally {
        this.loading = false
      }
    },

    // Actualizar novedad
    async actualizarNovedad(novedadId, novedadData) {
      this.loading = true
      this.error = null
      try {
        const response = await api.put(`/mantenimiento-novedades/${novedadId}`, novedadData)
        const index = this.novedades.findIndex(n => n.id === novedadId)
        if (index !== -1) {
          this.novedades[index] = response.data
        }
        return response.data
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al actualizar novedad'
        throw error
      } finally {
        this.loading = false
      }
    },

    // Eliminar novedad
    async eliminarNovedad(novedadId) {
      this.loading = true
      this.error = null
      try {
        await api.delete(`/mantenimiento-novedades/${novedadId}`)
        this.novedades = this.novedades.filter(n => n.id !== novedadId)
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al eliminar novedad'
        throw error
      } finally {
        this.loading = false
      }
    },

    // Obtener estadísticas
    async fetchEstadisticas(mantenimientoId) {
      try {
        const response = await api.get(
          `/mantenimiento-novedades/mantenimiento/${mantenimientoId}/estadisticas`
        )
        this.estadisticas = response.data
        return response.data
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al cargar estadísticas'
        throw error
      }
    },

    // Cargar plantillas
    async fetchPlantillas(tipoNovedad = null) {
      this.loading = true
      this.error = null
      try {
        const params = tipoNovedad ? `?tipo_novedad=${tipoNovedad}` : ''
        const response = await api.get(`/mantenimiento-novedades/plantillas/all${params}`)
        this.plantillas = response.data
        return response.data
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al cargar plantillas'
        throw error
      } finally {
        this.loading = false
      }
    },

    // Limpiar estado
    clearNovedades() {
      this.novedades = []
      this.novedadActual = null
      this.estadisticas = null
      this.error = null
    }
  }
})