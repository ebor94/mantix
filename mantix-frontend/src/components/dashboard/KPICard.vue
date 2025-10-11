<!-- src/components/dashboard/KPICard.vue -->
<template>
  <div class="card hover:shadow-xl transition-all duration-300 group">
    <div class="flex items-center justify-between">
      <div class="flex-1">
        <p class="text-sm font-medium text-gray-600 mb-2">{{ title }}</p>
        <div class="flex items-baseline space-x-2">
          <p class="text-3xl font-bold text-gray-900">
            {{ prefix }}{{ formattedValue }}{{ suffix }}
          </p>
        </div>
        <p v-if="subtitle" class="text-xs text-gray-500 mt-2">{{ subtitle }}</p>
        <div v-if="trend !== null" class="flex items-center mt-3">
          <span
            :class="[
              'inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full',
              trend >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            ]"
          >
            <svg
              :class="['h-3 w-3 mr-1', trend >= 0 ? '' : 'rotate-180']"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            {{ Math.abs(trend) }}%
          </span>
          <span class="text-xs text-gray-500 ml-2">{{ trendLabel }}</span>
        </div>
      </div>
      <div
        :class="[
          'h-16 w-16 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110',
          iconBgClass
        ]"
      >
        <component :is="iconComponent" class="h-8 w-8 text-white" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  ChartBarIcon,
  CalendarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/vue/24/outline'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  value: {
    type: [Number, String],
    required: true
  },
  prefix: {
    type: String,
    default: ''
  },
  suffix: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: 'ChartBarIcon'
  },
  color: {
    type: String,
    default: 'blue',
    validator: (value) => ['blue', 'green', 'orange', 'red', 'purple'].includes(value)
  },
  trend: {
    type: Number,
    default: null
  },
  trendLabel: {
    type: String,
    default: ''
  }
})

const icons = {
  ChartBarIcon,
  CalendarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon
}

const iconComponent = computed(() => icons[props.icon] || ChartBarIcon)

const formattedValue = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toLocaleString('es-CO')
  }
  return props.value
})

const iconBgClass = computed(() => {
  const colors = {
    blue: 'bg-gradient-to-br from-blue-500 to-blue-600',
    green: 'bg-gradient-to-br from-green-500 to-green-600',
    orange: 'bg-gradient-to-br from-orange-500 to-orange-600',
    red: 'bg-gradient-to-br from-red-500 to-red-600',
    purple: 'bg-gradient-to-br from-purple-500 to-purple-600'
  }
  return colors[props.color]
})
</script>