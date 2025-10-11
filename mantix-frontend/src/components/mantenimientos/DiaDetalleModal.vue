<!-- src/components/mantenimientos/DiaDetalleModal.vue -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">
            {{ formatDate(dia.fecha) }}
          </h2>
          <p class="text-sm text-gray-500 mt-1">
            {{ dia.mantenimientos.length }} mantenimiento(s) programado(s)
          </p>
        </div>
        <button
          @click="$emit('close')"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 space-y-4">
        <div
          v-for="mantenimiento in dia.mantenimientos"
          :key="mantenimiento.id"
          class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900">
                {{ mantenimiento.actividad?.nombre }}
              </h3>
              <div class="mt-2 space-y-1">
                <div class="flex items-center text-sm text-gray-600">
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {{ mantenimiento.actividad?.sede?.nombre }}
                </div>
                <div class="flex items-center text-sm text-gray-600">
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ mantenimiento.hora_programada || 'Sin hora específica' }}
                </div>
              </div>
            </div>
            <div class="ml-4">
              <Badge :color="getEstadoColor(mantenimiento.estado?.nombre)">
                {{ mantenimiento.estado?.nombre }}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import Badge from '@/components/common/Badge.vue'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

defineProps({
  dia: {
    type: Object,
    required: true
  }
})

defineEmits(['close'])

const formatDate = (date) => {
  return dayjs(date).format('dddd, D [de] MMMM [de] YYYY')
}

const getEstadoColor = (estado) => {
  const colors = {
    'Programado': 'blue',
    'En Proceso': 'orange',
    'Ejecutado': 'green',
    'Atrasado': 'red'
  }
  return colors[estado] || 'gray'
}
</script>