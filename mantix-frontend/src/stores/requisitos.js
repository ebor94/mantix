// ============================================
// src/stores/requisitos.js
// ============================================
import { defineStore } from 'pinia'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const useRequisitosStore = defineStore('requisitos', {
  state: () => ({
    requisitos: [],
    requisitoActual: null,
    categorias: [],
    dependencias: [],
    loading: false,
    error: null,
    filtros: {
      categoria_id: null,
      activo: true,
      busqueda: ''
    }
  }),

  getters: {
    requisitosFiltrados: (state) => {
      let resultado = state.requisitos

      // Filtrar por búsqueda
      if (state.filtros.busqueda) {
        const busqueda = state.filtros.busqueda.toLowerCase()
        resultado = resultado.filter(req =>
          req.nombre.toLowerCase().includes(busqueda) ||
          req.descripcion?.toLowerCase().includes(busqueda)
        )
      }

      // Filtrar por estado activo
      if (state.filtros.activo !== null) {
        resultado = resultado.filter(req => req.activo === state.filtros.activo)
      }

      return resultado
    },

    requisitosPorCategoria: (state) => {
      return state.requisitos.reduce((acc, req) => {
        req.categorias?.forEach(cat => {
          if (!acc[cat.id]) {
            acc[cat.id] = {
              categoria: cat,
              requisitos: []
            }
          }
          acc[cat.id].requisitos.push(req)
        })
        return acc
      }, {})
    },

    totalRequisitos: (state) => state.requisitos.length,
    requisitosActivos: (state) => state.requisitos.filter(r => r.activo).length,
    requisitosInactivos: (state) => state.requisitos.filter(r => !r.activo).length
  },

  actions: {
    async fetchRequisitos(filtros = {}) {
      this.loading = true
      this.error = null
      try {
        const params = new URLSearchParams()
        if (filtros.activo !== undefined) params.append('activo', filtros.activo)
        if (filtros.categoria_id) params.append('categoria_id', filtros.categoria_id)

        const response = await api.get(`/requisitos?${params}`)
        this.requisitos = response.data || response
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al cargar requisitos'
        toast.error(this.error)
      } finally {
        this.loading = false
      }
    },

    async fetchRequisito(id) {
      this.loading = true
      this.error = null
      try {
        const response = await api.get(`/requisitos/${id}`)
        this.requisitoActual = response.data || response
        return this.requisitoActual
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al cargar requisito'
        toast.error(this.error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async crearRequisito(datos) {
      this.loading = true
      this.error = null
      try {
        const response = await api.post('/requisitos', datos)
        this.requisitos.unshift(response.data || response)
        toast.success('Requisito creado exitosamente')
        return response.data || response
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al crear requisito'
        toast.error(this.error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async actualizarRequisito(id, datos) {
      this.loading = true
      this.error = null
      try {
        const response = await api.put(`/requisitos/${id}`, datos)
        const index = this.requisitos.findIndex(r => r.id === id)
        if (index !== -1) {
          this.requisitos[index] = response.data || response
        }
        toast.success('Requisito actualizado exitosamente')
        return response.data || response
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al actualizar requisito'
        toast.error(this.error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async eliminarRequisito(id) {
      this.loading = true
      this.error = null
      try {
        await api.delete(`/requisitos/${id}`)
        this.requisitos = this.requisitos.filter(r => r.id !== id)
        toast.success('Requisito desactivado exitosamente')
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al eliminar requisito'
        toast.error(this.error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async asociarCategorias(requisitoId, categorias) {
      this.loading = true
      this.error = null
      try {
        const response = await api.post(`/requisitos/${requisitoId}/categorias/asociar`, {
          categorias
        })
        const index = this.requisitos.findIndex(r => r.id === requisitoId)
        if (index !== -1) {
          this.requisitos[index] = response.data || response
        }
        toast.success('Categorías asociadas exitosamente')
        return response.data || response
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al asociar categorías'
        toast.error(this.error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async desasociarCategorias(requisitoId, categorias) {
      this.loading = true
      this.error = null
      try {
        const response = await api.post(`/requisitos/${requisitoId}/categorias/desasociar`, {
          categorias
        })
        const index = this.requisitos.findIndex(r => r.id === requisitoId)
        if (index !== -1) {
          this.requisitos[index] = response.data || response
        }
        toast.success('Categorías desasociadas exitosamente')
        return response.data || response
      } catch (error) {
        this.error = error.response?.data?.error || 'Error al desasociar categorías'
        toast.error(this.error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchCategorias() {
      try {
        const response = await api.get('/categorias-mantenimiento?activo=true')
        this.categorias = response.data || response
      } catch (error) {
        console.error('Error al cargar categorías:', error)
      }
    },

    async fetchDependencias() {
      try {
        const response = await api.get('/dependencias?activo=true')
        this.dependencias = response.data || response
      } catch (error) {
        console.error('Error al cargar dependencias:', error)
      }
    },

    setFiltros(filtros) {
      this.filtros = { ...this.filtros, ...filtros }
    },

    clearFiltros() {
      this.filtros = {
        categoria_id: null,
        activo: true,
        busqueda: ''
      }
    }
  }
})