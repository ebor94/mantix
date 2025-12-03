// ============================================
// src/stores/proveedores.js
// ============================================
import { defineStore } from 'pinia'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const useProveedoresStore = defineStore('proveedores', {
  state: () => ({
    proveedores: [],
    proveedorActual: null,
    loading: false
  }),

  getters: {
    /**
     * Obtener proveedores activos
     */
    proveedoresActivos: (state) => {
      return state.proveedores.filter(p => p.activo)
    },

    /**
     * Obtener proveedores como opciones para select
     */
    proveedoresParaSelect: (state) => {
      return state.proveedores
        .filter(p => p.activo)
        .map(proveedor => ({
          value: proveedor.id,
          label: proveedor.nombre,
          nit: proveedor.nit,
          especialidad: proveedor.especialidad
        }))
    },

    /**
     * Buscar proveedor por ID
     */
    obtenerProveedorPorId: (state) => {
      return (id) => state.proveedores.find(p => p.id === id)
    }
  },

  actions: {
    /**
     * Obtener todos los proveedores
     */
    async fetchProveedores() {
      this.loading = true
      try {
        const response = await api.get('/proveedores')
        console.log('Proveedores cargados:', response)
        this.proveedores = response
      } catch (error) {
        console.error('Error al cargar proveedores:', error)
        toast.error('Error al cargar los proveedores')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Obtener proveedor por ID con sus contactos
     */
    async fetchProveedor(id) {
      this.loading = true
      try {
        const response = await api.get(`/proveedores/${id}`)
        this.proveedorActual = response
        return response
      } catch (error) {
        console.error('Error al cargar proveedor:', error)
        toast.error('Error al cargar el proveedor')
        this.proveedorActual = null
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Crear proveedor
     */
    async crearProveedor(datos) {
      this.loading = true
      try {
        const response = await api.post('/proveedores', datos)
        toast.success('Proveedor creado exitosamente')
        await this.fetchProveedores()
        return response.data.proveedor
      } catch (error) {
        console.error('Error al crear proveedor:', error)
        const mensaje = error.response?.data?.error || 'Error al crear el proveedor'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Actualizar proveedor
     */
    async actualizarProveedor(id, datos) {
      this.loading = true
      try {
        const response = await api.put(`/proveedores/${id}`, datos)
        toast.success('Proveedor actualizado exitosamente')
        
        // Actualizar en la lista
        const index = this.proveedores.findIndex(p => p.id === id)
        if (index !== -1) {
          this.proveedores[index] = response.data.proveedor
        }
        
        // Actualizar proveedorActual si es el mismo
        if (this.proveedorActual?.id === id) {
          this.proveedorActual = response.data.proveedor
        }
        
        return response.data.proveedor
      } catch (error) {
        console.error('Error al actualizar proveedor:', error)
        const mensaje = error.response?.data?.error || 'Error al actualizar el proveedor'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Eliminar proveedor (soft delete)
     */
    async eliminarProveedor(id) {
      this.loading = true
      try {
        await api.delete(`/proveedores/${id}`)
        toast.success('Proveedor desactivado exitosamente')
        
        // Actualizar estado en la lista local
        const index = this.proveedores.findIndex(p => p.id === id)
        if (index !== -1) {
          this.proveedores[index].activo = false
        }
        
        return true
      } catch (error) {
        console.error('Error al eliminar proveedor:', error)
        const mensaje = error.response?.data?.error || 'Error al eliminar el proveedor'
        toast.error(mensaje)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Añadir contacto a un proveedor
     */
    async agregarContacto(proveedorId, contacto) {
      this.loading = true
      try {
        const response = await api.post(`/proveedores/${proveedorId}/contactos`, contacto)
        toast.success('Contacto añadido exitosamente')
        
        // Recargar el proveedor actual si es el mismo
        if (this.proveedorActual?.id === proveedorId) {
          await this.fetchProveedor(proveedorId)
        }
        
        return response.data.contacto
      } catch (error) {
        console.error('Error al añadir contacto:', error)
        toast.error('Error al añadir el contacto')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Eliminar contacto
     */
    async eliminarContacto(contactoId) {
      this.loading = true
      try {
        await api.delete(`/proveedores/contactos/${contactoId}`)
        toast.success('Contacto eliminado exitosamente')
        
        // Actualizar el proveedor actual si tiene contactos
        if (this.proveedorActual?.contactos) {
          this.proveedorActual.contactos = this.proveedorActual.contactos.filter(
            c => c.id !== contactoId
          )
        }
        
        return true
      } catch (error) {
        console.error('Error al eliminar contacto:', error)
        toast.error('Error al eliminar el contacto')
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Limpiar proveedor actual
     */
    limpiarProveedorActual() {
      this.proveedorActual = null
    }
  }
})