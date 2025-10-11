// ============================================
// src/stores/dashboard.js
// ============================================
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dashboardService } from '@/services/dashboardService'

export const useDashboardStore = defineStore('dashboard', () => {
  // State
  const kpis = ref(null)
  const cumplimientoSede = ref([])
  const cumplimientoCategoria = ref([])
  const estadisticasSolicitudes = ref(null)
  const actividadReciente = ref(null)
  const loading = ref(false)

  // Actions
  async function fetchKPIs(params = {}) {
    try {
      loading.value = true
      const response = await dashboardService.getKPIs(params)
      kpis.value = response
    } catch (error) {
      console.error('Error al cargar KPIs:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchCumplimientoSede(params = {}) {
    try {
      const response = await dashboardService.getCumplimientoPorSede(params)
      cumplimientoSede.value = response
    } catch (error) {
      console.error('Error al cargar cumplimiento por sede:', error)
    }
  }

  async function fetchCumplimientoCategoria(params = {}) {
    try {
      const response = await dashboardService.getCumplimientoPorCategoria(params)
      cumplimientoCategoria.value = response
    } catch (error) {
      console.error('Error al cargar cumplimiento por categoría:', error)
    }
  }

  async function fetchEstadisticasSolicitudes(params = {}) {
    try {
      const response = await dashboardService.getEstadisticasSolicitudes(params)
      estadisticasSolicitudes.value = response
    } catch (error) {
      console.error('Error al cargar estadísticas de solicitudes:', error)
    }
  }

  async function fetchActividadReciente(params = {}) {
    try {
      const response = await dashboardService.getActividadReciente(params)
      actividadReciente.value = response
    } catch (error) {
      console.error('Error al cargar actividad reciente:', error)
    }
  }

  async function loadDashboardData(params = {}) {
    await Promise.all([
      fetchKPIs(params),
      fetchCumplimientoSede(params),
      fetchCumplimientoCategoria(params),
      fetchEstadisticasSolicitudes(params),
      fetchActividadReciente(params)
    ])
  }

  return {
    // State
    kpis,
    cumplimientoSede,
    cumplimientoCategoria,
    estadisticasSolicitudes,
    actividadReciente,
    loading,
    // Actions
    fetchKPIs,
    fetchCumplimientoSede,
    fetchCumplimientoCategoria,
    fetchEstadisticasSolicitudes,
    fetchActividadReciente,
    loadDashboardData
  }
})