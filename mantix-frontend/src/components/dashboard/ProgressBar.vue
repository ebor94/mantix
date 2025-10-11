<!-- ============================================ -->
<!-- src/components/dashboard/ProgressBar.vue -->
<!-- ============================================ -->
<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <span class="text-sm font-medium text-gray-700">{{ label }}</span>
      <span class="text-sm font-bold text-gray-900">{{ percentage }}%</span>
    </div>
    <div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
      <div
        :class="[
          'h-2.5 rounded-full transition-all duration-500 ease-out',
          colorClass
        ]"
        :style="{ width: percentage + '%' }"
      ></div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: {
    type: String,
    required: true
  },
  percentage: {
    type: Number,
    required: true,
    validator: (value) => value >= 0 && value <= 100
  },
  color: {
    type: String,
    default: 'primary'
  }
})

const colorClass = computed(() => {
  const colors = {
    primary: 'bg-gradient-to-r from-primary-500 to-primary-600',
    green: 'bg-gradient-to-r from-green-500 to-green-600',
    blue: 'bg-gradient-to-r from-blue-500 to-blue-600',
    red: 'bg-gradient-to-r from-red-500 to-red-600',
    yellow: 'bg-gradient-to-r from-yellow-500 to-yellow-600',
    orange: 'bg-gradient-to-r from-orange-500 to-orange-600'
  }
  return colors[props.color] || colors.primary
})
</script>