<!-- ============================================ -->
<!-- src/components/common/Badge.vue -->
<!-- ============================================ -->
<template>
  <span
    :class="[
      'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium',
      colorClasses
    ]"
  >
    <span v-if="dot" :class="['h-2 w-2 mr-1.5 rounded-full', dotColorClass]"></span>
    <slot />
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  color: {
    type: String,
    default: 'gray',
    validator: (value) => ['gray', 'red', 'yellow', 'green', 'blue', 'purple', 'orange'].includes(value)
  },
  dot: {
    type: Boolean,
    default: false
  }
})

const colorClasses = computed(() => {
  const colors = {
    gray: 'bg-gray-100 text-gray-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    purple: 'bg-purple-100 text-purple-800',
    orange: 'bg-orange-100 text-orange-800'
  }
  return colors[props.color]
})

const dotColorClass = computed(() => {
  const colors = {
    gray: 'bg-gray-400',
    red: 'bg-red-400',
    yellow: 'bg-yellow-400',
    green: 'bg-green-400',
    blue: 'bg-blue-400',
    purple: 'bg-purple-400',
    orange: 'bg-orange-400'
  }
  return colors[props.color]
})
</script>
