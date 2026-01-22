<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
      
      <!-- Header -->
      <div class="flex-shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <svg class="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Programar Mantenimientos Masivos
          </h2>
          <p class="text-sm text-gray-600 mt-1">
            {{ actividades.length }} actividad(es) seleccionada(s)
          </p>
        </div>
        <button
          @click="$emit('close')"
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Cerrar modal"
        >
          <svg class="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        
        <!-- Resumen de actividades -->
        <div class="bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-200 rounded-lg p-5">
          <h3 class="text-sm font-semibold text-primary-900 mb-3 flex items-center gap-2">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Resumen de Actividades
          </h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span class="text-primary-700 font-medium">Total actividades:</span>
              <p class="text-primary-900 font-bold text-lg">{{ actividades.length }}</p>
            </div>
            <div>
              <span class="text-primary-700 font-medium">Equipos únicos:</span>
              <p class="text-primary-900 font-bold text-lg">{{ equiposUnicos }}</p>
            </div>
            <div>
              <span class="text-primary-700 font-medium">Duración promedio:</span>
              <p class="text-primary-900 font-bold text-lg">{{ duracionPromedio }}h</p>
            </div>
            <div>
              <span class="text-primary-700 font-medium">Costo promedio:</span>
              <p class="text-primary-900 font-bold text-lg">{{ formatCurrency(costoPromedio) }}</p>
            </div>
          </div>
        </div>

        <!-- Lista de actividades -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <svg class="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Actividades a Programar
          </h3>
          <div class="max-h-48 overflow-y-auto border rounded-lg shadow-inner bg-gray-50">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-100 sticky top-0">
                <tr>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actividad</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Equipo</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Periodicidad</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sede</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr 
                  v-for="(actividad, index) in actividades" 
                  :key="actividad.id_actividad"
                  class="hover:bg-blue-50 transition-colors"
                >
                  <td class="px-4 py-2 text-sm font-medium text-gray-900">{{ index + 1 }}</td>
                  <td class="px-4 py-2 text-sm text-gray-900">{{ actividad.nombre }}</td>
                  <td class="px-4 py-2 text-sm text-gray-600">{{ actividad.equipo || 'N/A' }}</td>
                  <td class="px-4 py-2">
                    <span class="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {{ actividad.periodicidad || 'N/A' }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-sm text-gray-600">{{ actividad.sede || 'N/A' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Configuración de programación -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <svg class="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Configuración de Programación
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Inicio <span class="text-red-500">*</span>
              </label>
              <input
                v-model="opciones.fecha_inicio"
                type="date"
                required
                class="input"
                :min="planFechaInicio"
                :max="planFechaFin"
                @change="calcularPreview"
              />
              <p class="text-xs text-gray-500 mt-1">
                Primera fecha de mantenimiento programado
              </p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Fin <span class="text-red-500">*</span>
              </label>
              <input
                v-model="opciones.fecha_fin"
                type="date"
                required
                class="input"
                :min="opciones.fecha_inicio || planFechaInicio"
                :max="planFechaFin"
                @change="calcularPreview"
              />
              <p class="text-xs text-gray-500 mt-1">
                Última fecha del período de programación
              </p>
            </div>
          </div>

          <!-- Opciones adicionales -->
          <div class="bg-gray-50 rounded-lg p-4 space-y-3">
            <h4 class="text-sm font-medium text-gray-900">Opciones Adicionales</h4>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Prioridad <span class="text-red-500">*</span>
                </label>
                <select
                  v-model="opciones.prioridad"
                  required
                  class="input"
                >
                  <option value="">Seleccione prioridad</option>
                  <option value="critica">Crítica</option>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Exigencia <span class="text-red-500">*</span>
                </label>
                <select
                  v-model="opciones.exigencia"
                  required
                  class="input"
                >
                  <option value="">Seleccione exigencia</option>
                  <option value="Manual/Fabricante">Manual/Fabricante</option>
                  <option value="Contractual/Garantia">Contractual/Garantía</option>
                  <option value="Cumplimiento Legal">Cumplimiento Legal</option>
                </select>
              </div>
            </div>

            <label class="flex items-center cursor-pointer">
              <input
                v-model="opciones.excluir_fines_semana"
                type="checkbox"
                class="form-checkbox h-4 w-4 text-primary-600 rounded"
                @change="calcularPreview"
              />
              <span class="ml-2 text-sm text-gray-700">
                Excluir fines de semana (mover a siguiente día hábil)
              </span>
            </label>
          </div>
        </div>

        <!-- Previsualización total -->
        <div v-if="totalMantenimientosEstimados > 0" class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <svg class="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Vista Previa de Programación
            </h3>
            <span class="px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-bold">
              ~{{ totalMantenimientosEstimados }} mantenimiento(s) total
            </span>
          </div>

          <!-- Resumen de costos y horas -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
              <p class="text-xs text-green-600 font-medium uppercase">Total Mantenimientos</p>
              <p class="text-2xl font-bold text-green-700">~{{ totalMantenimientosEstimados }}</p>
              <p class="text-xs text-green-600 mt-1">Para {{ actividades.length }} actividades</p>
            </div>
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p class="text-xs text-blue-600 font-medium uppercase">Horas Totales Estimadas</p>
              <p class="text-2xl font-bold text-blue-700">~{{ horasTotalesEstimadas }}h</p>
              <p class="text-xs text-blue-600 mt-1">Duración total estimada</p>
            </div>
            <div class="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <p class="text-xs text-primary-600 font-medium uppercase">Costo Total Estimado</p>
              <p class="text-2xl font-bold text-primary-700">{{ formatCurrency(costoTotalEstimado) }}</p>
              <p class="text-xs text-primary-600 mt-1">Inversión aproximada</p>
            </div>
          </div>

          <!-- Advertencia -->
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
            <svg class="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div class="text-sm text-yellow-800">
              <strong>Nota:</strong> Los valores son estimados. Cada actividad se programará según su periodicidad individual.
              El número real de mantenimientos puede variar según las fechas específicas de cada actividad.
            </div>
          </div>
        </div>

        <!-- Calculando -->
        <div v-if="calculando" class="text-center py-8">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="text-gray-600 mt-2">Calculando estimación...</p>
        </div>

      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 bg-gray-50 border-t px-6 py-4 flex items-center justify-between">
        <div class="text-sm text-gray-600">
          <span v-if="totalMantenimientosEstimados > 0">
            Se programarán aproximadamente <strong class="text-primary-600">{{ totalMantenimientosEstimados }}</strong> mantenimiento(s)
          </span>
          <span v-else>
            Seleccione el rango de fechas para programar
          </span>
        </div>

        <div class="flex items-center space-x-3">
          <button
            type="button"
            @click="$emit('close')"
            class="btn-secondary"
            :disabled="loading"
          >
            Cancelar
          </button>

          <button
            @click="programar"
            class="btn-primary"
            :disabled="loading || !formularioValido"
          >
            <span v-if="loading" class="flex items-center">
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Programando...
            </span>
            <span v-else class="flex items-center">
              <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Programar Mantenimientos
            </span>
          </button>
        </div>
      </div>
      
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

const props = defineProps({
  actividades: {
    type: Array,
    required: true
  },
  plan: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'programar'])

const toast = useToast()
const loading = ref(false)
const calculando = ref(false)

// Opciones de programación
const opciones = ref({
  fecha_inicio: '',
  fecha_fin: '',
  excluir_fines_semana: false,
  prioridad: 'media',
  exigencia: ''
})

// Computed - Fechas del plan
const planFechaInicio = computed(() => {
  return dayjs(props.plan.fecha_inicio).format('YYYY-MM-DD')
})

const planFechaFin = computed(() => {
  return dayjs(props.plan.fecha_fin).format('YYYY-MM-DD')
})

// Computed - Estadísticas
const equiposUnicos = computed(() => {
  const equipos = new Set(props.actividades.map(a => a.equipo).filter(Boolean))
  return equipos.size
})

const duracionPromedio = computed(() => {
  const total = props.actividades.reduce((sum, a) => sum + (a.duracion_estimada_horas || 0), 0)
  return (total / props.actividades.length).toFixed(1)
})

const costoPromedio = computed(() => {
  const total = props.actividades.reduce((sum, a) => sum + (a.costo_estimado || 0), 0)
  return Math.round(total / props.actividades.length)
})

// Computed - Validación
const formularioValido = computed(() => {
  return opciones.value.fecha_inicio && 
         opciones.value.fecha_fin && 
         opciones.value.prioridad &&
         opciones.value.exigencia &&
         new Date(opciones.value.fecha_fin) >= new Date(opciones.value.fecha_inicio)
})

// Computed - Estimaciones
const totalMantenimientosEstimados = computed(() => {
  if (!formularioValido.value) return 0
  
  // Estimación simple: calcular días entre fechas y dividir por periodicidad promedio
  const diasTotal = dayjs(opciones.value.fecha_fin).diff(dayjs(opciones.value.fecha_inicio), 'day')
  const periodicidadPromedio = 30 // Asumimos mensual como promedio
  const mantoPorActividad = Math.floor(diasTotal / periodicidadPromedio) + 1
  
  return props.actividades.length * mantoPorActividad
})

const horasTotalesEstimadas = computed(() => {
  const duracionTotal = props.actividades.reduce((sum, a) => sum + (a.duracion_estimada_horas || 0), 0)
  return Math.round(duracionTotal * (totalMantenimientosEstimados.value / props.actividades.length))
})

const costoTotalEstimado = computed(() => {
  const costoTotal = props.actividades.reduce((sum, a) => sum + (a.costo_estimado || 0), 0)
  return Math.round(costoTotal * (totalMantenimientosEstimados.value / props.actividades.length))
})

// Métodos
const formatCurrency = (value) => {
  if (!value) return '$0'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(value)
}

const calcularPreview = () => {
  if (!formularioValido.value) return
  
  calculando.value = true
  setTimeout(() => {
    calculando.value = false
  }, 300)
}

const programar = async () => {
  if (!formularioValido.value) {
    toast.warning('Por favor complete todos los campos requeridos')
    return
  }

  loading.value = true
  try {
    emit('programar', {
      ids_actividades: props.actividades.map(a => a.id_actividad),
      fecha_inicio: opciones.value.fecha_inicio,
      fecha_fin: opciones.value.fecha_fin,
      prioridad: opciones.value.prioridad,
      exigencia: opciones.value.exigencia,
      excluir_fines_semana: opciones.value.excluir_fines_semana
    })
  } finally {
    loading.value = false
  }
}

// Inicialización
onMounted(() => {
  const hoy = dayjs()
  const inicioPlan = dayjs(props.plan.fecha_inicio)
  const finPlan = dayjs(props.plan.fecha_fin)
  
  if (hoy.isAfter(inicioPlan) && hoy.isBefore(finPlan)) {
    opciones.value.fecha_inicio = hoy.format('YYYY-MM-DD')
  } else {
    opciones.value.fecha_inicio = inicioPlan.format('YYYY-MM-DD')
  }
  
  opciones.value.fecha_fin = finPlan.format('YYYY-MM-DD')
  calcularPreview()
})

watch(() => opciones.value, () => {
  calcularPreview()
}, { deep: true })
</script>