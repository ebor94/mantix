// ============================================
// src/stores/planes.js - ACTUALIZADO
// ============================================
import { defineStore } from 'pinia'
import api from '@/services/api'
import { useToast } from 'vue-toastification'
import { useAuthStore } from '@/stores/auth' // ✅ Importar el store de auth

const toast = useToast()

export const usePlanesStore = defineStore('planes', {
  state: () => ({
    planes: [],
    planActual: null,
    loading: false,
    pagination: {
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0
    },
    filtros: {
      activo: null,
      anio: null,
      buscar: ''
    }
  }),

  getters: {
    planesActivos: (state) => state.planes.filter(p => p.activo),
    planesInactivos: (state) => state.planes.filter(p => !p.activo),
    
    planesPorAnio: (state) => {
      const agrupados = {}
      state.planes.forEach(plan => {
        if (!agrupados[plan.anio]) {
          agrupados[plan.anio] = []
        }
        agrupados[plan.anio].push(plan)
      })
      return agrupados
    }
  },

  actions: {
    /**
     * Obtener lista de planes
     */
    async fetchPlanes(params = {}) {
      this.loading = true
      try {
        const queryParams = {
          page: params.page || this.pagination.page,
          limit: params.limit || this.pagination.limit,
          activo: params.activo !== undefined ? params.activo : this.filtros.activo,
          anio: params.anio || this.filtros.anio,
          buscar: params.buscar || this.filtros.buscar
        }

        // Limpiar parámetros vacíos
        Object.keys(queryParams).forEach(key => {
          if (queryParams[key] === null || queryParams[key] === '') {
            delete queryParams[key]
          }
        })

        const response = await api.get('/planes-mantenimiento', { params: queryParams })
        console.log('Respuesta de planes:', response)
        this.planes = response.data
        this.pagination = {
          page: response.data.page,
          limit: response.data.limit,
          total: response.data.total,
          totalPages: response.data.totalPages
        }

        console.log('Planes cargados:', this.planes)
      } catch (error) {
        console.error('Error al cargar planes:', error)
        toast.error('Error al cargar los planes')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Obtener plan por ID con actividades
     */
    async fetchPlan(id) {
      this.loading = true
      try {
        const response = await api.get(`/planes-mantenimiento/${id}`)
        this.planActual = response.data
        console.log('Plan cargado:', this.planActual)
        return response.data
      } catch (error) {
        console.error('Error al cargar plan:', error)
        toast.error('Error al cargar el plan')
        this.planActual = null
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Crear plan
     * ✅ ACTUALIZADO: Incluye automáticamente el responsable_id del usuario autenticado
     */
    async crearPlan(datos) {
      this.loading = true
      try {
        // ✅ Obtener el usuario autenticado del store de auth
        const authStore = useAuthStore()
        
        // ✅ Verificar que el usuario esté autenticado
        if (!authStore.user?.id) {
          toast.error('Debes iniciar sesión para crear un plan')
          throw new Error('Usuario no autenticado')
        }

        // ✅ Agregar el responsable_id al objeto de datos
        const datosConUsuario = {
          ...datos,
          responsable_id: authStore.user.id  // ✅ ID del usuario autenticado
        }

        console.log('Datos enviados al API:', datosConUsuario)

        const response = await api.post('/planes-mantenimiento', datosConUsuario)
        toast.success('Plan creado exitosamente')
        await this.fetchPlanes()
        return response.data.data
      } catch (error) {
        console.error('Error al crear plan:', error)
        const mensaje = error.response?.data?.message || 'Error al crear el plan'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Actualizar plan
     */
    async actualizarPlan(id, datos) {
      this.loading = true
      try {
        const response = await api.put(`/planes-mantenimiento/${id}`, datos)
        toast.success('Plan actualizado exitosamente')
        
        // Actualizar en la lista
        const index = this.planes.findIndex(p => p.id === id)
        if (index !== -1) {
          this.planes[index] = response.data.data
        }
        
        // Actualizar planActual si es el mismo
        if (this.planActual?.id === id) {
          this.planActual = response.data.data
        }
        
        return response.data.data
      } catch (error) {
        console.error('Error al actualizar plan:', error)
        toast.error('Error al actualizar el plan')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Eliminar plan
     */
    async eliminarPlan(id) {
      this.loading = true
      try {
        await api.delete(`/planes-mantenimiento/${id}`)
        toast.success('Plan eliminado exitosamente')
        
        // Quitar de la lista
        this.planes = this.planes.filter(p => p.id !== id)
        
        return true
      } catch (error) {
        console.error('Error al eliminar plan:', error)
        const mensaje = error.response?.data?.message || 'Error al eliminar el plan'
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
        const response = await api.patch(`/planes-mantenimiento/${id}/toggle`)
        toast.success(response.data.message)
        
        // Actualizar en la lista
        const index = this.planes.findIndex(p => p.id === id)
        if (index !== -1) {
          this.planes[index] = response.data.data
        }
        
        return response.data.data
      } catch (error) {
        console.error('Error al cambiar estado:', error)
        toast.error('Error al cambiar el estado del plan')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Obtener estadísticas del plan
     */
    async fetchEstadisticas(id) {
      try {
        const response = await api.get(`/planes-mantenimiento/${id}/estadisticas`)
        return response.data.data
      } catch (error) {
        console.error('Error al cargar estadísticas:', error)
        toast.error('Error al cargar estadísticas')
        throw error
      }
    },

    /**
     * Duplicar plan
     * ✅ ACTUALIZADO: Incluye automáticamente el responsable_id del usuario autenticado
     */
    async duplicarPlan(id, datos) {
      this.loading = true
      try {
        // ✅ Obtener el usuario autenticado del store de auth
        const authStore = useAuthStore()
        
        // ✅ Verificar que el usuario esté autenticado
        if (!authStore.user?.id) {
          toast.error('Debes iniciar sesión para duplicar un plan')
          throw new Error('Usuario no autenticado')
        }

        // ✅ Agregar el responsable_id al objeto de datos (si lo necesitas en la API)
        const datosConUsuario = {
          ...datos,
          responsable_id: authStore.user.id
        }

        const response = await api.post(`/planes-mantenimiento/${id}/duplicar`, datosConUsuario)
        toast.success('Plan duplicado exitosamente')
        await this.fetchPlanes()
        return response.data.data
      } catch (error) {
        console.error('Error al duplicar plan:', error)
        toast.error('Error al duplicar el plan')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Aplicar filtros
     */
    aplicarFiltros(filtros) {
      this.filtros = { ...this.filtros, ...filtros }
      this.pagination.page = 1
      this.fetchPlanes()
    },

    /**
     * Limpiar filtros
     */
    limpiarFiltros() {
      this.filtros = {
        activo: null,
        anio: null,
        buscar: ''
      }
      this.pagination.page = 1
      this.fetchPlanes()
    },

    /**
     * Cambiar página
     */
    cambiarPagina(page) {
      this.pagination.page = page
      this.fetchPlanes()
    }
  }
})