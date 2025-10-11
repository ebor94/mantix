// ============================================
// src/stores/reportes.js - Store de Reportes
// ============================================
import { defineStore } from 'pinia'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const useReportesStore = defineStore('reportes', {
  state: () => ({
    loading: false,
    tipoReporte: null,
    filtros: {
      fecha_inicio: null,
      fecha_fin: null,
      sede_id: null,
      categoria_id: null,
      estado_id: null
    }
  }),

  actions: {
    // Generar reporte de cumplimiento
    async generarReporteCumplimiento(filtros) {
      this.loading = true
      try {
        const response = await api.get('/dashboard/cumplimiento-sede', {
          params: filtros
        })
        return response.data || response
      } catch (error) {
        console.error('Error al generar reporte de cumplimiento:', error)
        toast.error('Error al generar el reporte')
        return null
      } finally {
        this.loading = false
      }
    },

    // Generar reporte de mantenimientos
    async generarReporteMantenimientos(filtros) {
      this.loading = true
      try {
        const response = await api.get('/mantenimientos', {
          params: filtros
        })
        return response.data || response
      } catch (error) {
        console.error('Error al generar reporte de mantenimientos:', error)
        toast.error('Error al generar el reporte')
        return null
      } finally {
        this.loading = false
      }
    },

    // Generar reporte de solicitudes
    async generarReporteSolicitudes(filtros) {
      this.loading = true
      try {
        const response = await api.get('/solicitudes', {
          params: filtros
        })
        return response.data || response
      } catch (error) {
        console.error('Error al generar reporte de solicitudes:', error)
        toast.error('Error al generar el reporte')
        return null
      } finally {
        this.loading = false
      }
    },

    // Generar reporte de equipos
    async generarReporteEquipos(filtros) {
      this.loading = true
      try {
        const response = await api.get('/equipos', {
          params: filtros
        })
        return response.data || response
      } catch (error) {
        console.error('Error al generar reporte de equipos:', error)
        toast.error('Error al generar el reporte')
        return null
      } finally {
        this.loading = false
      }
    },

    // Obtener estadísticas para reportes
    async obtenerEstadisticas(filtros) {
      this.loading = true
      try {
        const [kpis, cumplimientoSede, solicitudes] = await Promise.all([
          api.get('/dashboard/kpis', { params: filtros }),
          api.get('/dashboard/cumplimiento-sede', { params: filtros }),
          api.get('/dashboard/estadisticas-solicitudes', { params: filtros })
        ])

        return {
          kpis: kpis.data || kpis,
          cumplimientoSede: cumplimientoSede.data || cumplimientoSede,
          solicitudes: solicitudes.data || solicitudes
        }
      } catch (error) {
        console.error('Error al obtener estadísticas:', error)
        return null
      } finally {
        this.loading = false
      }
    },

    // Actualizar filtros
    updateFiltros(filtros) {
      this.filtros = { ...this.filtros, ...filtros }
    },

    // Limpiar filtros
    clearFiltros() {
      this.filtros = {
        fecha_inicio: null,
        fecha_fin: null,
        sede_id: null,
        categoria_id: null,
        estado_id: null
      }
    }
  }
})