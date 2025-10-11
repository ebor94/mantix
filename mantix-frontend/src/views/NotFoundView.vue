<!-- ============================================ -->
<!-- ARCHIVO: src/views/NotFoundView.vue -->
<!-- ============================================ -->
<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <h1 class="text-9xl font-bold text-primary-600">404</h1>
      <p class="text-2xl font-semibold text-gray-900 mt-4">Página no encontrada</p>
      <p class="text-gray-600 mt-2 mb-8">La página que buscas no existe o ha sido movida.</p>
      <router-link to="/dashboard" class="btn-primary inline-flex items-center">
        <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        Volver al Dashboard
      </router-link>
    </div>
  </div>
</template>

<script setup>
// Sin lógica necesaria
</script>