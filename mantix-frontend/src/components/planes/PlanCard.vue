<!-- ============================================ -->
<!-- src/components/planes/PlanCard.vue -->
<!-- ============================================ -->
<template>
  <div class="card hover:shadow-lg transition-shadow">
    <!-- Header -->
    <div class="flex items-start justify-between mb-4">
      <div class="flex-1">
        <div class="flex items-center space-x-3">
          <h3 class="text-xl font-bold text-gray-900">{{ plan.nombre }}</h3>
          <Badge :color="plan.activo ? 'green' : 'gray'">
            {{ plan.activo ? 'Activo' : 'Inactivo' }}
          </Badge>
        </div>
        <p class="text-gray-500 text-sm mt-1">Año {{ plan.anio }}</p>
      </div>

      <!-- Menú de acciones -->
      <div class="relative">
        <button
          @click="mostrarMenu = !mostrarMenu"
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="h-5 w-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        <!-- Dropdown menu -->
        <div
          v-if="mostrarMenu"
          v-click-outside="() => mostrarMenu = false"
          class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-10"
        >
          <button
            @click="$emit('ver', plan); mostrarMenu = false"
            class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
          >
            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Ver detalle
          </button>

          <button
            @click="$emit('editar', plan); mostrarMenu = false"
            class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
          >
            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar
          </button>

          <button
            @click="$emit('toggle', plan); mostrarMenu = false"
            class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
          >
            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            {{ plan.activo ? 'Desactivar' : 'Activar' }}
          </button>

          <button
            @click="$emit('duplicar', plan); mostrarMenu = false"
            class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
          >
            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Duplicar
          </button>

          <hr class="my-1">

          <button
            @click="$emit('eliminar', plan); mostrarMenu = false"
            class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
          >
            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eliminar
          </button>
        </div>
      </div>
    </div>

    <!-- Descripción -->
    <p v-if="plan.descripcion" class="text-gray-600 text-sm mb-4 line-clamp-2">
      {{ plan.descripcion }}
    </p>

    <!-- Información -->
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div>
        <label class="text-xs font-medium text-gray-500">Fecha inicio</label>
        <p class="text-sm font-semibold text-gray-900">{{ formatDate(plan.fecha_inicio) }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-gray-500">Fecha fin</label>
        <p class="text-sm font-semibold text-gray-900">{{ formatDate(plan.fecha_fin) }}</p>
      </div>
    </div>

    <!-- Estadísticas -->
    <div class="bg-gray-50 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div class="text-center flex-1">
          <p class="text-2xl font-bold text-primary-600">{{ plan.cantidad_actividades || 0 }}</p>
          <p class="text-xs text-gray-500">Actividades</p>
        </div>
        <div class="h-10 w-px bg-gray-300"></div>
        <div class="text-center flex-1">
          <p class="text-2xl font-bold text-green-600">
            {{ plan.usuario_creador.nombre  }}
          </p>
          <p class="text-xs text-gray-500">Creado por</p>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-4 pt-4 border-t flex items-center justify-between">
      <div class="text-xs text-gray-500">
        Creado {{ formatDateRelative(plan.created_at) }}
      </div>
      <button
        @click="$emit('ver', plan)"
        class="btn-primary text-sm"
      >
        Ver detalle
        <svg class="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Badge from '@/components/common/Badge.vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/es'

dayjs.extend(relativeTime)
dayjs.locale('es')

defineProps({
  plan: {
    type: Object,
    required: true
  }
})

defineEmits(['ver', 'editar', 'eliminar', 'duplicar', 'toggle'])

const mostrarMenu = ref(false)

const formatDate = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY')
}

const formatDateRelative = (date) => {
  if (!date) return ''
  return dayjs(date).fromNow()
}

// Directiva click-outside
const vClickOutside = {
  mounted(el, binding) {
    el.clickOutsideEvent = (event) => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value()
      }
    }
    document.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el) {
    document.removeEventListener('click', el.clickOutsideEvent)
  }
}
</script>