<!-- ============================================ -->
<!-- src/components/dashboard/ChartCard.vue -->
<!-- ============================================ -->
<template>
  <div class="card">
    <div class="flex items-center justify-between mb-6">
      <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
      <div v-if="$slots.actions" class="flex items-center space-x-2">
        <slot name="actions" />
      </div>
    </div>
    <div :style="{ height: height }">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  height: {
    type: String,
    default: '300px'
  }
})
</script>
