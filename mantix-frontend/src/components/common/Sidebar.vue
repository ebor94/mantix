<!-- src/components/common/Sidebar.vue -->
<template>
  <div
    :class="[
      'fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300',
      isCollapsed ? 'w-20' : 'w-64'
    ]"
  >
    <!-- Sidebar Container -->
    <div class="flex flex-col h-full bg-gradient-to-b from-primary-500 to-primary-700 text-white shadow-2xl">
      
      <!-- Logo y Empresa -->
      <div class="flex items-center justify-between px-4 py-6 border-b border-primary-600/30">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div v-if="!isCollapsed" class="transition-opacity duration-300">
            <h1 class="text-lg font-bold">Mantix</h1>
            <p class="text-xs text-primary-100">Serfunorte</p>
          </div>
        </div>
        
        <!-- Botón de colapsar -->
        <button
          @click="toggleSidebar"
          class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          :class="isCollapsed ? 'ml-auto' : ''"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="isCollapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'" />
          </svg>
        </button>
      </div>

      <!-- Navegación -->
      <nav class="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          v-slot="{ isActive }"
          custom
        >
          <a
            @click="navigateTo(item.path)"
            :class="[
              'flex items-center px-3 py-3 rounded-xl cursor-pointer transition-all duration-200',
              isActive 
                ? 'bg-white/20 shadow-lg backdrop-blur-sm' 
                : 'hover:bg-white/10',
              isCollapsed ? 'justify-center' : 'space-x-3'
            ]"
          >
            <component :is="item.icon" class="h-6 w-6 flex-shrink-0" />
            <span
              v-if="!isCollapsed"
              class="font-medium transition-opacity duration-300"
            >
              {{ item.name }}
            </span>
          </a>
        </router-link>
      </nav>

      <!-- Usuario -->
      <div class="px-4 py-4 border-t border-primary-600/30">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center flex-shrink-0">
            <span class="text-sm font-bold">{{ userInitials }}</span>
          </div>
          <div v-if="!isCollapsed" class="flex-1 min-w-0 transition-opacity duration-300">
            <p class="text-sm font-medium truncate">{{ userName }}</p>
            <p class="text-xs text-primary-100 truncate">{{ userRole }}</p>
          </div>
          <button
            @click="handleLogout"
            :class="[
              'p-2 rounded-lg hover:bg-white/10 transition-colors',
              isCollapsed ? 'ml-auto' : ''
            ]"
            title="Cerrar sesión"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Overlay para móvil -->
  <div
    v-if="!isCollapsed && isMobile"
    @click="toggleSidebar"
    class="fixed inset-0 bg-black/50 z-40 lg:hidden"
  ></div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  ChartBarIcon,
  WrenchIcon,
  DocumentTextIcon,
  CpuChipIcon,
  ChartPieIcon,
  CogIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isCollapsed = ref(false)
const isMobile = ref(false)

const menuItems = computed(() => [
  { name: 'Dashboard', path: '/dashboard', icon: ChartBarIcon },
  { name: 'Mantenimientos', path: '/mantenimientos', icon: WrenchIcon },
  { name: 'Solicitudes R-275', path: '/solicitudes', icon: DocumentTextIcon },
  { name: 'Equipos', path: '/equipos', icon: CpuChipIcon },
  { name: 'Reportes', path: '/reportes', icon: ChartPieIcon },
  { name: 'Configuración', path: '/configuracion', icon: CogIcon }
])

const userName = computed(() => authStore.userName || 'Usuario')
const userRole = computed(() => authStore.user?.rol?.nombre || 'Rol')
const userInitials = computed(() => {
  if (!authStore.user) return 'U'
  const nombre = authStore.user.nombre?.[0] || ''
  const apellido = authStore.user.apellido?.[0] || ''
  return (nombre + apellido).toUpperCase()
})

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value
}

const navigateTo = (path) => {
  router.push(path)
  if (isMobile.value) {
    isCollapsed.value = true
  }
}

const handleLogout = async () => {
  await authStore.logout()
  router.push({ name: 'Login' })
}

const checkMobile = () => {
  isMobile.value = window.innerWidth < 1024
  if (isMobile.value) {
    isCollapsed.value = true
  }
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
/* Scrollbar personalizado para el menú */
nav::-webkit-scrollbar {
  width: 4px;
}

nav::-webkit-scrollbar-track {
  background: transparent;
}

nav::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

nav::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
</style>