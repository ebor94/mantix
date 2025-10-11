<!-- src/components/mantenimientos/ReprogramarMantenimientoModal.vue -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
      <!-- Header -->
      <div class="bg-orange-50 border-b border-orange-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-gray-900">Reprogramar Mantenimiento</h2>
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
      <form @submit.prevent="handleSubmit" class="p-6 space-y-6">
        <!-- Información del Mantenimiento -->
        <div class="bg-gray-50 rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Actividad:</span>
            <span class="text-sm font-semibold text-gray-900">{{ mantenimiento.actividad?.nombre }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Sede:</span>
            <span class="text-sm font-semibold text-gray-900">{{ mantenimiento.actividad?.sede?.nombre }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Fecha Actual:</span>
            <span class="text-sm font-semibold text-gray-900">{{ formatDate(mantenimiento.fecha_programada) }}</span>
          </div>
        </div>

        <!-- Nueva Fecha -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Nueva Fecha <span class="text-red-500">*</span>
          </label>
          <input
            v-model="form.nueva_fecha"
            type="date"
            required
            :min="minDate"
            class="input-field"
          />
        </div>

        <!-- Nueva Hora -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Nueva Hora
          </label>
          <input
            v-model="form.nueva_hora"
            type="time"
            class="input-field"
          />
        </div>

        <!-- Motivo de Reprogramación -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Motivo de Reprogramación <span class="text-red-500">*</span>
          </label>
          <textarea
            v-model="form.motivo"
            rows="4"
            required
            placeholder="Explica el motivo de la reprogramación..."
            class="input-field resize-none"
          ></textarea>
        </div>

        <!-- Advertencia -->
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div class="flex items-start space-x-3">
            <svg class="h-5 w-5 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div class="text-sm text-yellow-800">
              <p class="font-medium">Importante:</p>
              <p class="text-xs mt-1">
                Se notificará a los responsables sobre el cambio de fecha. Asegúrate de seleccionar una fecha apropiada.
              </p>
            </div>
          </div>
        </div>

        <!-- Botones -->
        <div class="flex items-center justify-end space-x-3 pt-6 border-t">
          <button
            type="button"
            @click="$emit('close')"
            class="btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="btn-primary bg-orange-600 hover:bg-orange-700"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ loading ? 'Reprogramando...' : 'Reprogramar' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMantenimientosStore } from '@/stores/mantenimientos'
import dayjs from 'dayjs'

const props = defineProps({
  mantenimiento: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

const mantenimientosStore = useMantenimientosStore()
const loading = ref(false)

const form = ref({
  nueva_fecha: '',
  nueva_hora: '',
  motivo: ''
})

const minDate = computed(() => dayjs().format('YYYY-MM-DD'))

const formatDate = (date) => {
  if (!date) return 'Sin fecha'
  return dayjs(date).format('DD/MM/YYYY')
}

const handleSubmit = async () => {
  loading.value = true
  try {
    await mantenimientosStore.reprogramarMantenimiento(props.mantenimiento.id, {
      fecha_programada: form.value.nueva_fecha,
      hora_programada: form.value.nueva_hora,
      motivo_reprogramacion: form.value.motivo
    })
    emit('success')
  } catch (error) {
    console.error('Error al reprogramar:', error)
  } finally {
    loading.value = false
  }
}
</script>