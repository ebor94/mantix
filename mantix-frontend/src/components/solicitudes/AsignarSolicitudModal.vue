<!-- src/components/solicitudes/AsignarSolicitudModal.vue -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
      <!-- Header -->
      <div class="bg-blue-50 border-b border-blue-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 bg-blue-500 rounded-xl flex items-center justify-center">
            <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-gray-900">Asignar Solicitud</h2>
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
      <form @submit.prevent="handleAsignar" class="p-6 space-y-6">
        <!-- Información de la Solicitud -->
        <div class="bg-gray-50 rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Solicitud:</span>
            <span class="text-sm font-semibold text-gray-900">#{{ solicitud.id }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Sede:</span>
            <span class="text-sm font-semibold text-gray-900">{{ solicitud.sede?.nombre }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Prioridad:</span>
            <Badge :color="getPrioridadColor(solicitud.prioridad)">
              {{ solicitud.prioridad }}
            </Badge>
          </div>
        </div>

        <!-- Tipo de Asignación -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-3">
            Asignar a <span class="text-red-500">*</span>
          </label>
          <div class="flex items-center space-x-4">
            <label class="flex items-center cursor-pointer">
              <input
                v-model="tipoAsignacion"
                type="radio"
                value="tecnico"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
              />
              <span class="ml-2 text-sm text-gray-700">Técnico Interno</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input
                v-model="tipoAsignacion"
                type="radio"
                value="proveedor"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
              />
              <span class="ml-2 text-sm text-gray-700">Proveedor</span>
            </label>
          </div>
        </div>

        <!-- Selección de Técnico -->
        <div v-if="tipoAsignacion === 'tecnico'">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Técnico <span class="text-red-500">*</span>
          </label>
          <select v-model="form.tecnico_id" required class="input-field">
            <option value="">Seleccionar técnico</option>
            <option v-for="tecnico in tecnicos" :key="tecnico.id" :value="tecnico.id">
              {{ tecnico.nombre }}
            </option>
          </select>
        </div>

        <!-- Selección de Proveedor -->
        <div v-if="tipoAsignacion === 'proveedor'">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Proveedor <span class="text-red-500">*</span>
          </label>
          <select v-model="form.proveedor_id" required class="input-field">
            <option value="">Seleccionar proveedor</option>
            <option v-for="proveedor in proveedores" :key="proveedor.id" :value="proveedor.id">
              {{ proveedor.nombre }}
            </option>
          </select>
        </div>

        <!-- Fecha de Atención Programada -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Fecha de Atención <span class="text-red-500">*</span>
          </label>
          <input
            v-model="form.fecha_atencion"
            type="date"
            required
            :min="minDate"
            class="input-field"
          />
        </div>

        <!-- Observaciones -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Observaciones para el Técnico
          </label>
          <textarea
            v-model="form.observaciones"
            rows="4"
            placeholder="Instrucciones especiales, herramientas necesarias, etc..."
            class="input-field resize-none"
          ></textarea>
        </div>

        <!-- Información Importante -->
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div class="flex items-start space-x-3">
            <svg class="h-5 w-5 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div class="text-sm text-yellow-800">
              <p class="font-medium mb-1">Importante:</p>
              <p class="text-xs">
                El técnico o proveedor asignado recibirá una notificación con los detalles de la solicitud.
                La fecha de atención es una estimación y puede ajustarse según disponibilidad.
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
            :disabled="loading || !tipoAsignacion"
            class="btn-primary"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ loading ? 'Asignando...' : 'Asignar Solicitud' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSolicitudesStore } from '@/stores/solicitudes'
import Badge from '@/components/common/Badge.vue'
import api from '@/services/api'
import dayjs from 'dayjs'

const props = defineProps({
  solicitud: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

const solicitudesStore = useSolicitudesStore()
const loading = ref(false)
const tipoAsignacion = ref('tecnico')
const tecnicos = ref([])
const proveedores = ref([])

const form = ref({
  tecnico_id: '',
  proveedor_id: '',
  fecha_atencion: dayjs().add(1, 'day').format('YYYY-MM-DD'),
  observaciones: ''
})

const minDate = computed(() => dayjs().format('YYYY-MM-DD'))

const getPrioridadColor = (prioridad) => {
  const colors = {
    baja: 'green',
    media: 'yellow',
    alta: 'orange',
    critica: 'red'
  }
  return colors[prioridad?.toLowerCase()] || 'gray'
}

const handleAsignar = async () => {
  loading.value = true
  try {
    const data = {
      asignado_a: tipoAsignacion.value === 'tecnico' 
        ? tecnicos.value.find(t => t.id === form.value.tecnico_id)?.nombre
        : proveedores.value.find(p => p.id === form.value.proveedor_id)?.nombre,
      tipo_asignacion: tipoAsignacion.value,
      fecha_atencion: form.value.fecha_atencion,
      observaciones: form.value.observaciones
    }

    await solicitudesStore.asignarSolicitud(props.solicitud.id, data)
    emit('success')
  } catch (error) {
    console.error('Error al asignar solicitud:', error)
  } finally {
    loading.value = false
  }
}

const loadData = async () => {
  try {
    const [tecnicosRes, proveedoresRes] = await Promise.all([
      api.get('/usuarios?rol=tecnico'),
      api.get('/proveedores')
    ])
    tecnicos.value = tecnicosRes.data || []
    proveedores.value = proveedoresRes.data || []
  } catch (error) {
    console.error('Error al cargar datos:', error)
  }
}

onMounted(() => {
  loadData()
})
</script>