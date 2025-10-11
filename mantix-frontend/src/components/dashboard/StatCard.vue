
<!-- ============================================ -->
<!-- src/components/dashboard/StatCard.vue -->
<!-- ============================================ -->
<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
    <div class="flex items-center justify-between mb-4">
      <h4 class="text-sm font-medium text-gray-600">{{ title }}</h4>
      <div v-if="badge" :class="['px-2.5 py-0.5 rounded-full text-xs font-medium', badgeClass]">
        {{ badge }}
      </div>
    </div>
    
    <div class="space-y-3">
      <div
        v-for="(item, index) in items"
        :key="index"
        class="flex items-center justify-between"
      >
        <span class="text-sm text-gray-700">{{ item.label }}</span>
        <span class="text-sm font-semibold text-gray-900">{{ item.value }}</span>
      </div>
    </div>
    
    <div v-if="$slots.footer" class="mt-4 pt-4 border-t border-gray-200">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  items: {
    type: Array,
    default: () => []
  },
  badge: {
    type: String,
    default: ''
  },
  badgeColor: {
    type: String,
    default: 'blue'
  }
})

const badgeClass = computed(() => {
  const colors = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800'
  }
  return colors[props.badgeColor] || colors.blue
})
</script>