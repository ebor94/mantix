<!-- src/components/solicitudes/AprobarSolicitudModal.vue -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
      <!-- Header -->
      <div class="bg-green-50 border-b border-green-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 bg-green-500 rounded-xl flex items-center justify-center">
            <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-gray-900">Aprobar Solicitud</h2>
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
      <form @submit.prevent="handleAprobar" class="p-6 space-y-6">
        <!-- Información de la Solicitud -->
        <div class="bg-gray-50 rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Solicitud:</span>
            <span class="text-sm font-semibold text-gray-900">#{{ solicitud.id }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Solicitante:</span>
            <span class="text-sm font-semibold text-gray-900">{{ solicitud.solicitante }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Prioridad:</span>
            <Badge :color="getPrioridadColor(solicitud.prioridad)">
              {{ solicitud.prioridad }}
            </Badge>
          </div>
        </div>

        <!-- Descripción del Problema -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Descripción del Problema
          </label>
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p class="text-sm text-gray-700">{{ solicitud.descripcion }}</p>
          </div>
        </div>

        <!-- Observaciones de Aprobación -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Observaciones (Opcional)
          </label>
          <textarea
            v-model="observaciones"
            rows="4"
            placeholder="Agrega comentarios o instrucciones adicionales..."
            class="input-field resize-none"
          ></textarea>
        </div>

        <!-- Acción Alternativa: Rechazar -->
        <div class="flex items-center space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <input
            v-model="rechazar"
            type="checkbox"
            id="rechazar-check"
            class="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
          />
          <label for="rechazar-check" class="text-sm font-medium text-red-700 cursor-pointer">
            Rechazar esta solicitud en lugar de aprobarla
          </label>
        </div>

        <!-- Confirmación -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex items-start space-x-3">
            <svg class="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="text-sm text-blue-800">
              <p v-if="!rechazar">
                Al aprobar esta solicitud, quedará disponible para ser asignada a un técnico o proveedor.
              </p>
              <p v-else class="text-red-700 font-medium">
                Al rechazar esta solicitud, no se realizará ninguna acción y se notificará al solicitante.
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
            :class="[
              'btn-primary',
              rechazar ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            ]"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ loading ? 'Procesando...' : (rechazar ? 'Rechazar Solicitud' : 'Aprobar Solicitud') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSolicitudesStore } from '@/stores/solicitudes'
import Badge from '@/components/common/Badge.vue'

const props = defineProps({
  solicitud: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

const solicitudesStore = useSolicitudesStore()
const loading = ref(false)
const observaciones = ref('')
const rechazar = ref(false)

const getPrioridadColor = (prioridad) => {
  const colors = {
    baja: 'green',
    media: 'yellow',
    alta: 'orange',
    critica: 'red'
  }
  return colors[prioridad?.toLowerCase()] || 'gray'
}

const handleAprobar = async () => {
  loading.value = true
  try {
    if (rechazar.value) {
      // Lógica para rechazar
      await solicitudesStore.actualizarSolicitud(props.solicitud.id, {
        estado_id: 13, // ID del estado "Rechazada"
        observaciones: observaciones.value
      })
    } else {
      // Aprobar solicitud
      await solicitudesStore.aprobarSolicitud(props.solicitud.id, observaciones.value)
    }
    emit('success')
  } catch (error) {
    console.error('Error al procesar solicitud:', error)
  } finally {
    loading.value = false
  }
}
</script>