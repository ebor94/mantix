<!-- ============================================ -->
<!-- src/components/common/ConfirmDialog.vue -->
<!-- Diálogo de confirmación reutilizable -->
<!-- ============================================ -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
      
      <!-- Header -->
      <div class="bg-white border-b px-6 py-4">
        <h3 class="text-xl font-bold text-gray-900">
          {{ title }}
        </h3>
      </div>

      <!-- Body -->
      <div class="p-6">
        <p class="text-gray-600">
          {{ message }}
        </p>
      </div>

      <!-- Footer -->
      <div class="bg-gray-50 border-t px-6 py-4 flex items-center justify-end space-x-3">
        <button
          type="button"
          @click="$emit('cancel')"
          class="btn-secondary"
        >
          {{ cancelText }}
        </button>
        <button
          @click="$emit('confirm')"
          :class="confirmClass"
        >
          {{ confirmText }}
        </button>
      </div>
      
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '¿Estás seguro?'
  },
  message: {
    type: String,
    required: true
  },
  confirmText: {
    type: String,
    default: 'Confirmar'
  },
  cancelText: {
    type: String,
    default: 'Cancelar'
  },
  confirmClass: {
    type: String,
    default: 'btn-primary'
  }
})

defineEmits(['confirm', 'cancel'])
</script>

<style scoped>
.btn-danger {
  @apply px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 
         focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 
         disabled:opacity-50 disabled:cursor-not-allowed transition-colors;
}
</style>