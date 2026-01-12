// ============================================
// src/services/api.js - Cliente Axios configurado
// ============================================
import axios from 'axios'
import { useToast } from 'vue-toastification'

const toast = useToast()

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3020/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Interceptor de request - Agregar token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Interceptor de response - Manejo de errores
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response

      switch (status) {
        case 401:
          // Token inválido o expirado
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          window.location.href = '/login'
          toast.error('Sesión expirada. Por favor inicia sesión nuevamente')
          break
        case 403:
          toast.error('No tienes permisos para realizar esta acción')
          break
        case 404:
          toast.error('Recurso no encontrado')
          break
        case 500:
          toast.error('Error del servidor. Intenta de nuevo más tarde')
          break
        default:
          toast.error(data.message || 'Ha ocurrido un error')
      }
    } else if (error.request) {
      toast.error('No se pudo conectar con el servidor')
    } else {
      toast.error('Error al procesar la solicitud')
    }

    return Promise.reject(error)
  }
)

export default api
