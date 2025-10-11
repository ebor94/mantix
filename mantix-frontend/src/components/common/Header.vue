<!-- src/components/common/Header.vue -->
<template>
  <header class="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
    <div class="flex items-center justify-between px-6 py-4">
      
      <!-- Título de la página -->
      <div class="flex items-center space-x-4">
        <button
          @click="emit('toggle-sidebar')"
          class="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ pageTitle }}</h1>
          <p v-if="pageSubtitle" class="text-sm text-gray-500">{{ pageSubtitle }}</p>
        </div>
      </div>

      <!-- Acciones del header -->
      <div class="flex items-center space-x-4">
        
        <!-- Notificaciones -->
        <div class="relative">
          <button
            @click="toggleNotifications"
            class="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span
              v-if="unreadNotifications > 0"
              class="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
            >
              {{ unreadNotifications > 9 ? '9+' : unreadNotifications }}
            </span>
          </button>

          <!-- Dropdown de notificaciones -->
          <transition name="fade-scale">
            <div
              v-if="showNotifications"
              class="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
            >
              <div class="p-4 bg-gradient-to-r from-primary-500 to-primary-700 text-white">
                <h3 class="font-semibold">Notificaciones</h3>
                <p class="text-xs text-primary-100">{{ unreadNotifications }} sin leer</p>
              </div>
              
              <div class="max-h-96 overflow-y-auto">
                <div
                  v-for="notification in notifications"
                  :key="notification.id"
                  class="p-4 hover:bg-gray-50 border-b border-gray-100 cursor-pointer transition-colors"
                  :class="{ 'bg-blue-50': !notification.leida }"
                >
                  <div class="flex items-start space-x-3">
                    <div class="flex-shrink-0">
                      <div class="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <svg class="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-900">
                        {{ notification.titulo }}
                      </p>
                      <p class="text-xs text-gray-500 mt-1">
                        {{ notification.mensaje }}
                      </p>
                      <p class="text-xs text-gray-400 mt-1">
                        {{ formatRelativeTime(notification.created_at) }}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div v-if="notifications.length === 0" class="p-8 text-center text-gray-500">
                  <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p class="mt-2">No tienes notificaciones</p>
                </div>
              </div>
              
              <div class="p-3 bg-gray-50 text-center">
                <a href="#" class="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  Ver todas las notificaciones
                </a>
              </div>
            </div>
          </transition>
        </div>

        <!-- Perfil de usuario -->
        <div class="relative">
          <button
            @click="toggleUserMenu"
            class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div class="h-10 w-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
              <span class="text-sm font-bold text-white">{{ userInitials }}</span>
            </div>
            <div class="hidden md:block text-left">
              <p class="text-sm font-medium text-gray-900">{{ userName }}</p>
              <p class="text-xs text-gray-500">{{ userRole }}</p>
            </div>
            <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Dropdown de usuario -->
          <transition name="fade-scale">
            <div
              v-if="showUserMenu"
              class="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
            >
              <div class="p-4 bg-gradient-to-r from-primary-500 to-primary-700 text-white">
                <p class="font-semibold">{{ userName }}</p>
                <p class="text-xs text-primary-100">{{ userEmail }}</p>
              </div>
              
              <div class="py-2">
                <a
                  href="#"
                  class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <svg class="h-5 w-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Mi Perfil
                </a>
                <a
                  href="#"
                  @click.prevent="openChangePassword"
                  class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <svg class="h-5 w-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Cambiar Contraseña
                </a>
              </div>
              
              <div class="border-t border-gray-200">
                <button
                  @click="handleLogout"
                  class="flex items-center w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg class="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Cerrar Sesión
                </button>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { formatRelativeTime } from '@/utils/formatters'

const emit = defineEmits(['toggle-sidebar'])

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const showNotifications = ref(false)
const showUserMenu = ref(false)

// Mock notifications - Reemplazar con datos reales de la API
const notifications = ref([
  {
    id: 1,
    titulo: 'Mantenimiento Próximo',
    mensaje: 'Tienes un mantenimiento programado mañana a las 09:00 AM',
    leida: false,
    created_at: new Date(Date.now() - 3600000)
  },
  {
    id: 2,
    titulo: 'Nueva Solicitud R-275',
    mensaje: 'Se ha creado una nueva solicitud de mantenimiento correctivo',
    leida: false,
    created_at: new Date(Date.now() - 7200000)
  },
  {
    id: 3,
    titulo: 'Mantenimiento Completado',
    mensaje: 'El mantenimiento MNT-2025-00142 ha sido completado',
    leida: true,
    created_at: new Date(Date.now() - 86400000)
  }
])

const pageTitle = computed(() => {
  const routeNames = {
    Dashboard: 'Dashboard',
    Mantenimientos: 'Mantenimientos',
    Solicitudes: 'Solicitudes R-275',
    Equipos: 'Equipos',
    Reportes: 'Reportes',
    Configuracion: 'Configuración'
  }
  return routeNames[route.name] || 'Mantix'
})

const pageSubtitle = computed(() => {
  const subtitles = {
    Dashboard: 'Resumen general del sistema',
    Mantenimientos: 'Gestión de mantenimientos preventivos y correctivos',
    Solicitudes: 'Solicitudes adicionales de mantenimiento',
    Equipos: 'Inventario y gestión de equipos',
    Reportes: 'Reportes y estadísticas',
    Configuracion: 'Configuración del sistema'
  }
  return subtitles[route.name] || ''
})

const unreadNotifications = computed(() => {
  return notifications.value.filter(n => !n.leida).length
})

const userName = computed(() => authStore.userName || 'Usuario')
const userEmail = computed(() => authStore.user?.email || '')
const userRole = computed(() => authStore.user?.rol?.nombre || 'Rol')
const userInitials = computed(() => {
  if (!authStore.user) return 'U'
  const nombre = authStore.user.nombre?.[0] || ''
  const apellido = authStore.user.apellido?.[0] || ''
  return (nombre + apellido).toUpperCase()
})

const toggleNotifications = () => {
  showNotifications.value = !showNotifications.value
  showUserMenu.value = false
}

const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value
  showNotifications.value = false
}

const handleLogout = async () => {
  showUserMenu.value = false
  await authStore.logout()
  router.push({ name: 'Login' })
}

const openChangePassword = () => {
  showUserMenu.value = false
  // Abrir modal de cambio de contraseña
  console.log('Abrir modal de cambio de contraseña')
}

const closeDropdowns = (e) => {
  if (!e.target.closest('.relative')) {
    showNotifications.value = false
    showUserMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', closeDropdowns)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdowns)
})
</script>

<style scoped>
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.2s ease;
}

.fade-scale-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}

.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}
</style>