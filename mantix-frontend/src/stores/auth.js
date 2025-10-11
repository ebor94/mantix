
// ============================================
// src/stores/auth.js - Store de autenticación con Pinia
// ============================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/authService'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref(null)
  const token = ref(null)
  const loading = ref(false)

  // Getters
  const isAuthenticated = computed(() => !!token.value)
  const userRole = computed(() => user.value?.rol?.id || null)
  const userName = computed(() => 
    user.value ? `${user.value.nombre} ${user.value.apellido}` : ''
  )

  // Actions
  async function login(email, password) {
    try {
      loading.value = true
      const response = await authService.login(email, password)
      
      token.value = response.token
      user.value = response.usuario
      
      // Guardar en localStorage
      localStorage.setItem('token', response.token)
      localStorage.setItem('user', JSON.stringify(response.usuario))
      
      toast.success(`¡Bienvenido ${response.usuario.nombre}!`)
      return true
    } catch (error) {
      console.error('Error en login:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    authService.logout()
    user.value = null
    token.value = null
    toast.info('Sesión cerrada')
  }

  async function loadUserFromStorage() {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    
    if (storedToken && storedUser) {
      token.value = storedToken
      user.value = JSON.parse(storedUser)
      
      // Verificar si el token es válido
      try {
        const profile = await authService.getProfile()
        user.value = profile
        localStorage.setItem('user', JSON.stringify(profile))
      } catch (error) {
        // Token inválido, limpiar
        logout()
      }
    }
  }

  async function changePassword(currentPassword, newPassword) {
    try {
      loading.value = true
      await authService.changePassword(currentPassword, newPassword)
      toast.success('Contraseña actualizada exitosamente')
      return true
    } catch (error) {
      console.error('Error al cambiar contraseña:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  function hasRole(...roles) {
    return roles.includes(userRole.value)
  }

  return {
    // State
    user,
    token,
    loading,
    // Getters
    isAuthenticated,
    userRole,
    userName,
    // Actions
    login,
    logout,
    loadUserFromStorage,
    changePassword,
    hasRole
  }
})