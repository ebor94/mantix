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
            Programar Grupo de Mantenimientos
          </h2>
          <p class="text-sm text-gray-600 mt-1">
            Grupo ID: <span class="font-semibold text-primary-600">{{ grupoMasivoId }}</span>
          </p>
        </div>
        <button
          @click="$emit('close')"
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        
        <!-- Loading state -->
        <div v-if="cargandoActividades" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p class="text-gray-600 mt-4">Cargando actividades del grupo...</p>
        </div>

        <template v-else-if="actividades.length > 0">
          <!-- Resumen del grupo -->
          <div class="bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-200 rounded-lg p-5">
            <h3 class="text-sm font-semibold text-primary-900 mb-3 flex items-center gap-2">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Información del Grupo
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span class="text-primary-700 font-medium">Actividades:</span>
                <p class="text-primary-900 font-bold text-lg">{{ actividades.length }}</p>
              </div>
              <div>
                <span class="text-primary-700 font-medium">Equipos:</span>
                <p class="text-primary-900 font-bold text-lg">{{ actividades.length }}</p>
              </div>
              <div>
                <span class="text-primary-700 font-medium">Categoría:</span>
                <p class="text-primary-900 font-bold text-lg">{{ actividades[0]?.categoria.nombre || 'N/A' }}</p>
              </div>
              <div>
                <span class="text-primary-700 font-medium">Periodicidad:</span>
                <p class="text-primary-900 font-bold text-lg">{{ actividades[0]?.periodicidad.nombre || 'N/A' }}</p>
              </div>
            </div>
          </div>

          <!-- Lista de actividades del grupo -->
          <div class="space-y-3">
            <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <svg class="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Equipos en este Grupo
            </h3>
            <div class="max-h-48 overflow-y-auto border rounded-lg shadow-inner bg-gray-50">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-100 sticky top-0">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Equipo</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sede</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duración</th>
                
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr 
                    v-for="(actividad, index) in actividades" 
                    :key="actividad.id_actividad"
                    class="hover:bg-blue-50 transition-colors"
                  >
                    <td class="px-4 py-2 text-sm font-medium text-gray-900">{{ index + 1 }}</td>
                    <td class="px-4 py-2 text-sm text-gray-900">{{ actividad.equipo.nombre|| 'N/A' }}</td>
                    <td class="px-4 py-2 text-sm text-gray-600">{{ actividad.sede.nombre || 'N/A' }}</td>
                    <td class="px-4 py-2 text-sm text-gray-600">{{ actividad.duracion_estimada_horas || 0 }}h</td>
                     
                   
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
                  <select v-model="opciones.prioridad" required class="input">
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
                  <select v-model="opciones.exigencia" required class="input">
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

          <!-- Preview de totales -->
          <div v-if="totalMantenimientosEstimados > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
              <p class="text-xs text-green-600 font-medium uppercase">Total Mantenimientos</p>
              <p class="text-2xl font-bold text-green-700">~{{ totalMantenimientosEstimados }}</p>
            </div>
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p class="text-xs text-blue-600 font-medium uppercase">Horas Totales</p>
              <p class="text-2xl font-bold text-blue-700">~{{ horasTotalesEstimadas }}h</p>
            </div>
            <div class="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <p class="text-xs text-primary-600 font-medium uppercase">Costo Total</p>
              <p class="text-2xl font-bold text-primary-700">{{ formatCurrency(costoTotalEstimado) }}</p>
            </div>
          </div>
        </template>

        <!-- Error state -->
        <div v-else class="text-center py-12">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p class="text-gray-600 mt-2">No se encontraron actividades para este grupo</p>
        </div>

      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 bg-gray-50 border-t px-6 py-4 flex items-center justify-between">
        <div class="text-sm text-gray-600">
          <span v-if="totalMantenimientosEstimados > 0">
            Se programarán <strong class="text-primary-600">~{{ totalMantenimientosEstimados }}</strong> mantenimiento(s)
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
            :disabled="loading || !formularioValido || actividades.length === 0"
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
              Programar Grupo
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
import api from '@/services/api'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

const props = defineProps({
  grupoMasivoId: {
    type: String,
    required: true
  },
  plan: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

const toast = useToast()
const loading = ref(false)
const cargandoActividades = ref(false)
const actividades = ref([])

const opciones = ref({
  fecha_inicio: '',
  fecha_fin: '',
  excluir_fines_semana: false,
  prioridad: 'media',
  exigencia: ''
})

// Computed
const planFechaInicio = computed(() => dayjs(props.plan.fecha_inicio).format('YYYY-MM-DD'))
const planFechaFin = computed(() => dayjs(props.plan.fecha_fin).format('YYYY-MM-DD'))

const formularioValido = computed(() => {
  return opciones.value.fecha_inicio && 
         opciones.value.fecha_fin && 
         opciones.value.prioridad &&
         opciones.value.exigencia &&
         new Date(opciones.value.fecha_fin) >= new Date(opciones.value.fecha_inicio)
})

const totalMantenimientosEstimados = computed(() => {
  if (!formularioValido.value || actividades.value.length === 0) return 0
  
  const diasTotal = dayjs(opciones.value.fecha_fin).diff(dayjs(opciones.value.fecha_inicio), 'day')
  const periodicidadPromedio = actividades.value[0]?.periodicidad.dias
  const mantoPorActividad = Math.floor(diasTotal / periodicidadPromedio) + 1
  
  return actividades.value.length * mantoPorActividad
})

const horasTotalesEstimadas = computed(() => {
  const duracionTotal = actividades.value.reduce((sum, a) => sum + (a.duracion_estimada_horas || 0), 0)
  return Math.round(duracionTotal * (totalMantenimientosEstimados.value / actividades.value.length))
})

const costoTotalEstimado = computed(() => {
  const costoTotal = actividades.value.reduce((sum, a) => sum + (a.costo_estimado || 0), 0)
  return Math.round(costoTotal * (totalMantenimientosEstimados.value / actividades.value.length))
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

const cargarActividades = async () => {
  cargandoActividades.value = true
  try {
    const response = await api.get(`/plan-actividades/grupo/${props.grupoMasivoId}`)
    actividades.value = response.data
  } catch (error) {
    console.error('Error al cargar actividades:', error)
    toast.error('Error al cargar las actividades del grupo')
  } finally {
    cargandoActividades.value = false
  }
}

const calcularPreview = () => {
  // Preview calculation
}

const programar = async () => {
  if (!formularioValido.value) {
    toast.warning('Por favor complete todos los campos requeridos')
    return
  }

  loading.value = true
  try {
    const response = await api.post(`/programar-mantenimientos/grupo/${props.grupoMasivoId}`, {
      fecha_inicio: opciones.value.fecha_inicio,
      fecha_fin: opciones.value.fecha_fin,
      prioridad: opciones.value.prioridad,
      exigencia: opciones.value.exigencia,
      excluir_fines_semana: opciones.value.excluir_fines_semana
    })

    toast.success(response.data.message, { timeout: 5000 })
    emit('success', response.data)
    emit('close')
  } catch (error) {
    console.error('Error al programar grupo:', error)
    toast.error(error.response?.data?.message || 'Error al programar mantenimientos del grupo')
  } finally {
    loading.value = false
  }
}

// Inicialización
onMounted(async () => {
  await cargarActividades()
  
  const hoy = dayjs()
  const inicioPlan = dayjs(props.plan.fecha_inicio)
  const finPlan = dayjs(props.plan.fecha_fin)
  
  if (hoy.isAfter(inicioPlan) && hoy.isBefore(finPlan)) {
    opciones.value.fecha_inicio = hoy.format('YYYY-MM-DD')
  } else {
    opciones.value.fecha_inicio = inicioPlan.format('YYYY-MM-DD')
  }
  
  opciones.value.fecha_fin = finPlan.format('YYYY-MM-DD')
})

watch(() => opciones.value, calcularPreview, { deep: true })
</script>