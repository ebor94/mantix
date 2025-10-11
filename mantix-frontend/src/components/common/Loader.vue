<!-- ============================================ -->
<!-- src/components/common/Loader.vue -->
<!-- ============================================ -->
<template>
  <div v-if="loading" class="flex items-center justify-center p-8">
    <div class="relative">
      <div class="h-16 w-16 rounded-full border-4 border-gray-200"></div>
      <div class="absolute top-0 left-0 h-16 w-16 rounded-full border-4 border-primary-500 border-t-transparent animate-spin"></div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})
</script>