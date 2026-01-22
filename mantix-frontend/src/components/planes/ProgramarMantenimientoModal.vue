<!-- ============================================ -->
<!-- src/components/planes/ProgramarMantenimientoModal.vue -->
<!-- Modal para programar mantenimientos según periodicidad -->
<!-- ============================================ -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
      
      <!-- Header -->
      <div class="flex-shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">
            Programar Mantenimientos
          </h2>
          <p class="text-sm text-gray-600 mt-1">
            {{ actividad.nombre }}
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
        
        <!-- Información de la actividad -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 class="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Información de la Actividad
          </h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span class="text-blue-700 font-medium">Periodicidad:</span>
              <p class="text-blue-900 font-semibold">
                {{ periodicidad || 'N/A' }} 
              </p>
              <p v-if="actividad.periodicidad_id" class="text-blue-800 text-xs">
                Cada {{ periodicidad }} días
              </p>
            </div>
            <div>
              <span class="text-blue-700 font-medium">Sede:</span>
              <p class="text-blue-900">{{ actividad.sede?.nombre || 'N/A' }}</p>
            </div>
            <div>
              <span class="text-blue-700 font-medium">Responsable:</span>
              <p class="text-blue-900">{{ responsable }}</p>
            </div>
            <div>
              <span class="text-blue-700 font-medium">Categoría:</span>
              <p class="text-blue-900">{{ actividad.categoria?.nombre || 'N/A' }}</p>
            </div>
            <div>
              <span class="text-blue-700 font-medium">Duración:</span>
              <p class="text-blue-900">{{ actividad.duracion_estimada_horas || 0 }} horas</p>
            </div>
            <div>
              <span class="text-blue-700 font-medium">Costo por mtto:</span>
              <p class="text-blue-900">{{ formatCurrency(actividad.costo_estimado) }}</p>
            </div>
          </div>
        </div>

        <!-- Configuración de fechas -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <svg class="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Rango de Programación
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
                :min="opciones.fecha_inicio"
                @change="calcularPreview"
              />
              <p class="text-xs text-gray-500 mt-1">
                Última fecha del período de programación
              </p>
            </div>
          </div>

          <!-- Opciones adicionales -->
          <div class="bg-gray-50 rounded-lg p-4 space-y-3">
            <h4 class="text-sm font-medium text-gray-900">Opciones adicionales</h4>
            
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

            <label class="flex items-center cursor-pointer">
                <span class="ml-2 text-sm text-gray-700">
               Seleccione prioridad <span class="text-red-500">*</span>
              </span>
             <select
                v-model="opciones.prioridad"
                required
                class="input"
                
              >
                <option value="">Seleccione prioridad</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>  
                <option value="baja">Baja</option>
                <option value="critica">Critica</option>
              </select>
            </label>
             <label class="flex items-center cursor-pointer">
               <span class="ml-2 text-sm text-gray-700">
               Seleccione exigencia <span class="text-red-500">*</span>
              </span>
             <select
                v-model="opciones.exigencia"
                required
                class="input"
               
              >
                <option value="">Seleccione exigencia</option>
                <option value="Manual/Fabricante">Manual/Fabricante</option>
                <option value="Contractual/Garantia">Contractual/Garantia</option>  
                <option value="Cumplimiento Legal">Cumplimiento Legal</option>
                </select>
            </label>

            

          </div>
        </div>

        <!-- Previsualización -->
        <div v-if="preview.length > 0" class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <svg class="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Mantenimientos a Programar
            </h3>
            <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-bold">
              {{ preview.length }} mantenimiento(s)
            </span>
          </div>

          <div class="max-h-64 overflow-y-auto border rounded-lg shadow-inner">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Programada</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Día</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr 
                  v-for="(fecha, index) in preview" 
                  :key="index" 
                  class="hover:bg-gray-50 transition-colors"
                >
                  <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ index + 1 }}</td>
                  <td class="px-4 py-3 text-sm text-gray-900">{{ formatDateLong(fecha) }}</td>
                  <td class="px-4 py-3 text-sm text-gray-600">{{ getDiaSemana(fecha) }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                      Pendiente
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Resumen de costos -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
              <p class="text-xs text-green-600 font-medium uppercase">Total Mantenimientos</p>
              <p class="text-2xl font-bold text-green-700">{{ preview.length }}</p>
            </div>
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p class="text-xs text-blue-600 font-medium uppercase">Horas Totales</p>
              <p class="text-2xl font-bold text-blue-700">
                {{ (actividad.duracion_estimada_horas || 0) * preview.length }}h
              </p>
            </div>
            <div class="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <p class="text-xs text-primary-600 font-medium uppercase">Costo Total Estimado</p>
              <p class="text-2xl font-bold text-primary-700">
                {{ formatCurrency((actividad.costo_estimado || 0) * preview.length) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Estado vacío -->
        <div v-else-if="opcionesValidas && !calculando" class="text-center py-8 bg-gray-50 rounded-lg">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p class="text-gray-600 mt-2">No hay mantenimientos para programar en el rango seleccionado</p>
          <p class="text-sm text-gray-500 mt-1">Verifica las fechas y la periodicidad</p>
        </div>

        <!-- Calculando -->
        <div v-if="calculando" class="text-center py-8">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="text-gray-600 mt-2">Calculando fechas...</p>
        </div>

      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 bg-gray-50 border-t px-6 py-4 flex items-center justify-between">
        <div class="text-sm text-gray-600">
          <span v-if="preview.length > 0">
            Se crearán <strong class="text-primary-600">{{ preview.length }}</strong> mantenimiento(s) programado(s)
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
            :disabled="loading || preview.length === 0"
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
              Programar {{ preview.length }} Mantenimiento(s)
            </span>
          </button>
        </div>
      </div>
      
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { usePlanActividadesStore } from '@/stores/planActividades'
import { useToast } from 'vue-toastification'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

import { useProveedoresStore } from '../../stores/proveedores'
import { useEquiposStore } from '../../stores/equipos'
const proveedorStore = useProveedoresStore()
const equipoStore = useEquiposStore()

dayjs.locale('es')

const props = defineProps({
  actividad: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])
const responsable = ref('N/A')
const periodicidad = ref('N/A')
const toast = useToast()
const actividadesStore = usePlanActividadesStore()

const loading = ref(false)
const calculando = ref(false)
const preview = ref([])

// Opciones de programación
const opciones = ref({
  fecha_inicio: '',
  fecha_fin: '',
  excluir_fines_semana: false,
  prioridad: 'media',
  exigencia: ''
})

// Computed
const opcionesValidas = computed(() => {
  return opciones.value.fecha_inicio && 
         opciones.value.fecha_fin && 
         new Date(opciones.value.fecha_fin) >= new Date(opciones.value.fecha_inicio)
})

const getResponsable =  async() => {
 
  if (props.actividad.responsable_proveedor_id) {
    let infoproveedor = await proveedorStore.fetchProveedor(props.actividad.responsable_proveedor_id)
  responsable.value =  infoproveedor.nombre
  
  }
  if (props.actividad.responsable_usuario_id) {
    return actividad.responsable_proveedor.nombre
  }

}

const getperiodicidad =  async() => {
 
  if (props.actividad.periodicidad_id ) {
    let periodicidadEquipo = await equipoStore.fetchPeriodicidad(props.actividad.periodicidad_id)
    //console.log('periodicidadEquipo', periodicidadEquipo)
    periodicidad.value =  periodicidadEquipo.dias
  
  }else{
     periodicidad.value  = 'N/A'
  }

}


// Métodos
const formatCurrency = (value) => {
  if (!value) return '$0'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(value)
}

const formatDateLong = (date) => {
  return dayjs(date).format('DD [de] MMMM [de] YYYY')
}

const getDiaSemana = (date) => {
  return dayjs(date).format('dddd')
}

/**
 * Calcular fechas de mantenimiento según periodicidad
 */
const calcularPreview = () => {
  if (!opcionesValidas.value) {
    preview.value = []
    return
  }

  calculando.value = true
  
  setTimeout(() => {
    const fechas = []
    const diasPeriodicidad = periodicidad.value || 30
    
    let fechaActual = dayjs(opciones.value.fecha_inicio)
    const fechaFin = dayjs(opciones.value.fecha_fin)

    while (fechaActual.isBefore(fechaFin) || fechaActual.isSame(fechaFin, 'day')) {
      let fechaProgramada = fechaActual

      // Excluir fines de semana si está marcado
      if (opciones.value.excluir_fines_semana) {
        // 0 = Domingo, 6 = Sábado
        while (fechaProgramada.day() === 0 || fechaProgramada.day() === 6) {
          fechaProgramada = fechaProgramada.add(1, 'day')
        }
      }

      // Solo agregar si está dentro del rango
      if (fechaProgramada.isBefore(fechaFin) || fechaProgramada.isSame(fechaFin, 'day')) {
        fechas.push(fechaProgramada.format('YYYY-MM-DD'))
      }

      // Siguiente fecha según periodicidad
      fechaActual = fechaActual.add(diasPeriodicidad, 'day')
    }

    preview.value = fechas
    calculando.value = false
  }, 300) // Pequeño delay para UX
}

/**
 * Ejecutar la programación
 */
const programar = async () => {
  if (preview.value.length === 0) {
    toast.warning('No hay mantenimientos para programar')
    return
  }

  loading.value = true
  try {
    // Enviar al backend para crear los mantenimientos programados
    //console.log('Programando mantenimientos para las fechas:', preview.value)
   // console.log('Con las opciones:', opciones.value)
    const response = await actividadesStore.programarActividad(props.actividad.id, {
      fecha_inicio: opciones.value.fecha_inicio,
      fecha_fin: opciones.value.fecha_fin,
      prioridad: opciones.value.prioridad,
      exigencia: opciones.value.exigencia,
      excluir_fines_semana: opciones.value.excluir_fines_semana,
  
    }) 
    //console.log('Respuesta del servidor:', response.total_programados)
    toast.success(`Se programaron ${response.total_programados} mantenimiento(s) exitosamente`)
    //emit('success', `Se programaron ${response.total_programados} mantenimiento(s) exitosamente`)
  } catch (error) {
    console.error('Error al programar:', error)
    // El error ya se maneja en el store
  } finally {
    loading.value = false
  }
}

// Inicializar con fechas por defecto (próximo mes)
onMounted(() => {
  const hoy = dayjs()
  opciones.value.fecha_inicio = hoy.format('YYYY-MM-DD')
  opciones.value.fecha_fin = hoy.add(1, 'year').format('YYYY-MM-DD')
  
  // Calcular preview inicial
    getResponsable()
    getperiodicidad()
  calcularPreview()
})

// Observar cambios en opciones
watch(() => opciones.value, () => {
  calcularPreview()
}, { deep: true })
</script>