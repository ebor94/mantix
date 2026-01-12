<!-- ============================================ -->
<!-- src/components/common/MainLayout.vue - RESPONSIVE FIX -->
<!-- ============================================ -->
<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Sidebar -->
    <Sidebar 
      :is-collapsed="sidebarCollapsed" 
      @update:is-collapsed="sidebarCollapsed = $event"
    />

    <!-- Contenido Principal -->
    <div
      :class="[
        'transition-all duration-300 min-h-screen',
        // En móvil (< lg): sin margen cuando collapsed, pantalla completa
        // En desktop (>= lg): siempre con margen según estado del sidebar
        {
          'ml-0': !sidebarCollapsed && isMobile,
          'ml-0': sidebarCollapsed && isMobile,
          'lg:ml-20': sidebarCollapsed,
          'lg:ml-64': !sidebarCollapsed
        }
      ]"
    >
      <!-- Header -->
      <Header @toggle-sidebar="toggleSidebar" />

      <!-- Área de contenido -->
      <main class="p-4 md:p-6">
        <slot />
      </main>
    </div>

    <!-- Overlay para cerrar sidebar en móvil -->
    <transition name="fade">
      <div
        v-if="!sidebarCollapsed && isMobile"
        @click="sidebarCollapsed = true"
        class="fixed inset-0 bg-black/50 z-30 lg:hidden"
      ></div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import Sidebar from './Sidebar.vue'
import Header from './Header.vue'

const sidebarCollapsed = ref(true) // Inicialmente colapsado en móvil
const isMobile = ref(false)

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

const checkMobile = () => {
  isMobile.value = window.innerWidth < 1024
  // En móvil, el sidebar inicia colapsado
  if (isMobile.value) {
    sidebarCollapsed.value = true
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>