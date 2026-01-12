<!-- src/components/mantenimientos/NovedadModal.vue -->
<template>
  <teleport to="body">
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-gray-900">
              {{ isEditing ? 'Editar Novedad' : 'Registrar Novedad' }}
            </h3>
            <button
              @click="$emit('close')"
              class="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          <form @submit.prevent="handleSubmit" class="space-y-4">
            <!-- Tipo de Novedad -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Novedad *
              </label>
              <select
                v-model="form.tipo_novedad"
                @change="onTipoChange"
                class="input-field"
                required
              >
                <option value="">Seleccione un tipo</option>
                <option value="reprogramacion">Reprogramación</option>
                <option value="comunicacion_proveedor">Comunicación con Proveedor</option>
                <option value="cambio_estado">Cambio de Estado</option>
                <option value="suspension">Suspensión</option>
                <option value="observacion_general">Observación General</option>
                <option value="cambio_prioridad">Cambio de Prioridad</option>
                <option value="asignacion_personal">Asignación de Personal</option>
                <option value="solicitud_requisitos">Solicitud de Requisitos</option>
                <option value="aprobacion_requisitos">Aprobación de Requisitos</option>
                <option value="rechazo_requisitos">Rechazo de Requisitos</option>
                <option value="inicio_trabajo">Inicio de Trabajo</option>
                <option value="finalizacion_trabajo">Finalización de Trabajo</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <!-- Plantillas -->
            <div v-if="plantillasFiltradas.length > 0 && !isEditing">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Usar Plantilla
              </label>
              <select
                v-model="plantillaSeleccionada"
                @change="aplicarPlantilla"
                class="input-field"
              >
                <option :value="null">Sin plantilla</option>
                <option
                  v-for="plantilla in plantillasFiltradas"
                  :key="plantilla.id"
                  :value="plantilla"
                >
                  {{ plantilla.nombre }}
                </option>
              </select>
            </div>

            <!-- Descripción -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Descripción *
              </label>
              <textarea
                v-model="form.descripcion"
                rows="3"
                class="input-field"
                placeholder="Describa la novedad..."
                required
              ></textarea>
            </div>

            <!-- Motivo -->
            <div v-if="mostrarCampo('motivo')">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Motivo {{ requiereCampo('motivo') ? '*' : '' }}
              </label>
              <input
                v-model="form.motivo"
                type="text"
                class="input-field"
                placeholder="Motivo de la novedad"
                :required="requiereCampo('motivo')"
              />
            </div>

            <!-- Campos específicos para Reprogramación -->
            <div v-if="form.tipo_novedad === 'reprogramacion'" class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Fecha Anterior
                  </label>
                  <input
                    v-model="form.fecha_anterior"
                    type="date"
                    class="input-field"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Hora Anterior
                  </label>
                  <input
                    v-model="form.hora_anterior"
                    type="time"
                    class="input-field"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Nueva Fecha *
                  </label>
                  <input
                    v-model="form.fecha_nueva"
                    type="date"
                    class="input-field"
                    required
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Nueva Hora *
                  </label>
                  <input
                    v-model="form.hora_nueva"
                    type="time"
                    class="input-field"
                    required
                  />
                </div>
              </div>
            </div>

            <!-- Campos específicos para Cambio de Estado -->
            <div v-if="form.tipo_novedad === 'cambio_estado'" class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Estado Anterior
                  </label>
                  <select
                    v-model="form.estado_anterior_id"
                    class="input-field"
                  >
                    <option :value="null">Seleccione estado</option>
                    <option
                      v-for="estado in estados"
                      :key="estado.id"
                      :value="estado.id"
                    >
                      {{ estado.nombre }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Nuevo Estado *
                  </label>
                  <select
                    v-model="form.estado_nuevo_id"
                    class="input-field"
                    required
                  >
                    <option :value="null">Seleccione estado</option>
                    <option
                      v-for="estado in estados"
                      :key="estado.id"
                      :value="estado.id"
                    >
                      {{ estado.nombre }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Campos específicos para Cambio de Prioridad -->
            <div v-if="form.tipo_novedad === 'cambio_prioridad'" class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Prioridad Anterior
                  </label>
                  <select
                    v-model="form.prioridad_anterior"
                    class="input-field"
                  >
                    <option :value="null">Seleccione prioridad</option>
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Nueva Prioridad *
                  </label>
                  <select
                    v-model="form.prioridad_nueva"
                    class="input-field"
                    required
                  >
                    <option :value="null">Seleccione prioridad</option>
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Adjuntos (URLs) -->
            <div v-if="mostrarCampo('adjuntos')">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Adjuntos (URLs)
              </label>
              <div class="space-y-2">
                <div
                  v-for="(adjunto, index) in form.adjuntos"
                  :key="index"
                  class="flex items-center space-x-2"
                >
                  <input
                    v-model="form.adjuntos[index]"
                    type="url"
                    class="input-field flex-1"
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    @click="removeAdjunto(index)"
                    class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  @click="addAdjunto"
                  class="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary-500 hover:text-primary-600 transition-colors"
                >
                  + Agregar adjunto
                </button>
              </div>
            </div>

            <!-- Visible para proveedor -->
            <div class="flex items-center">
              <input
                v-model="form.es_visible_proveedor"
                type="checkbox"
                id="visible-proveedor"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label for="visible-proveedor" class="ml-2 text-sm text-gray-700">
                Visible para proveedor
              </label>
            </div>

            <!-- Metadata adicional -->
            <details class="border border-gray-200 rounded-lg p-4">
              <summary class="cursor-pointer text-sm font-medium text-gray-700">
                Información adicional (opcional)
              </summary>
              <div class="mt-4">
                <textarea
                  v-model="metadataJson"
                  rows="3"
                  class="input-field font-mono text-xs"
                  placeholder='{"key": "value"}'
                ></textarea>
                <p class="text-xs text-gray-500 mt-1">
                  Formato JSON válido
                </p>
              </div>
            </details>
          </form>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            @click="$emit('close')"
            class="btn-secondary"
            :disabled="loading"
          >
            Cancelar
          </button>
          <button
            type="submit"
            @click="handleSubmit"
            class="btn-primary"
            :disabled="loading"
          >
            <span v-if="loading" class="flex items-center">
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Guardando...
            </span>
            <span v-else>
              {{ isEditing ? 'Actualizar' : 'Registrar' }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useMantenimientoNovedadesStore } from '@/stores/mantenimientoNovedades'
import { useToast } from 'vue-toastification'
import api from '@/services/api'

const props = defineProps({
  mantenimientoId: {
    type: Number,
    required: true
  },
  novedad: {
    type: Object,
    default: null
  },
  mantenimiento: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const novedadesStore = useMantenimientoNovedadesStore()
const toast = useToast()

const loading = ref(false)
const estados = ref([])
const plantillaSeleccionada = ref(null)
const metadataJson = ref('')

const isEditing = computed(() => !!props.novedad)

const form = ref({
  mantenimiento_programado_id: props.mantenimientoId,
  tipo_novedad: '',
  descripcion: '',
  motivo: '',
  fecha_anterior: '',
  fecha_nueva: '',
  hora_anterior: '',
  hora_nueva: '',
  estado_anterior_id: null,
  estado_nuevo_id: null,
  prioridad_anterior: null,
  prioridad_nueva: null,
  adjuntos: [],
  metadata: null,
  es_visible_proveedor: false
})

const plantillasFiltradas = computed(() => {
  if (!form.value.tipo_novedad) return []
  return novedadesStore.plantillasPorTipo(form.value.tipo_novedad)
})

const onTipoChange = () => {
  plantillaSeleccionada.value = null
  // Limpiar campos específicos del tipo anterior
  form.value.fecha_anterior = ''
  form.value.fecha_nueva = ''
  form.value.hora_anterior = ''
  form.value.hora_nueva = ''
  form.value.estado_anterior_id = null
  form.value.estado_nuevo_id = null
  form.value.prioridad_anterior = null
  form.value.prioridad_nueva = null
}

const aplicarPlantilla = () => {
  if (!plantillaSeleccionada.value) return
  
  form.value.descripcion = plantillaSeleccionada.value.descripcion_plantilla
  
  // Pre-llenar datos del mantenimiento actual si corresponde
  if (plantillaSeleccionada.value.requiere_fecha && props.mantenimiento) {
    form.value.fecha_anterior = props.mantenimiento.fecha_programada
    form.value.hora_anterior = props.mantenimiento.hora_programada
  }
}

const mostrarCampo = (campo) => {
  const mostrar = {
    'motivo': ['reprogramacion', 'suspension', 'cambio_estado', 'rechazo_requisitos'].includes(form.value.tipo_novedad),
    'adjuntos': true
  }
  return mostrar[campo] !== undefined ? mostrar[campo] : true
}

const requiereCampo = (campo) => {
  if (!plantillaSeleccionada.value) return false
  
  const requisitos = {
    'motivo': plantillaSeleccionada.value.requiere_motivo,
    'adjuntos': plantillaSeleccionada.value.requiere_adjunto,
    'fecha': plantillaSeleccionada.value.requiere_fecha
  }
  
  return requisitos[campo] || false
}

const addAdjunto = () => {
  form.value.adjuntos.push('')
}

const removeAdjunto = (index) => {
  form.value.adjuntos.splice(index, 1)
}

const handleSubmit = async () => {
  try {
    loading.value = true

    // Preparar datos
    const data = {
      ...form.value,
      adjuntos: form.value.adjuntos.filter(a => a.trim() !== '')
    }

    // Parsear metadata si existe
    if (metadataJson.value.trim()) {
      try {
        data.metadata = JSON.parse(metadataJson.value)
      } catch (error) {
        toast.error('Formato JSON inválido en metadata')
        return
      }
    }

    // Crear o actualizar
    if (isEditing.value) {
      await novedadesStore.actualizarNovedad(props.novedad.id, data)
      toast.success('Novedad actualizada exitosamente')
    } else {
      await novedadesStore.crearNovedad(data)
      toast.success('Novedad registrada exitosamente')
    }

    emit('success')
    emit('close')
  } catch (error) {
    console.error('Error al guardar novedad:', error)
    toast.error(error.response?.data?.error || 'Error al guardar la novedad')
  } finally {
    loading.value = false
  }
}

const loadEstados = async () => {
  try {
    const response = await api.get('/estados?tipo=mantenimiento')
    estados.value = response.data
  } catch (error) {
    console.error('Error al cargar estados:', error)
  }
}

const initForm = () => {
  if (isEditing.value) {
    form.value = {
      ...props.novedad,
      adjuntos: props.novedad.adjuntos || []
    }
    if (props.novedad.metadata) {
      metadataJson.value = JSON.stringify(props.novedad.metadata, null, 2)
    }
  } else if (props.mantenimiento) {
    // Pre-llenar con datos del mantenimiento
    form.value.fecha_anterior = props.mantenimiento.fecha_programada
    form.value.hora_anterior = props.mantenimiento.hora_programada
    form.value.estado_anterior_id = props.mantenimiento.estado_id
    form.value.prioridad_anterior = props.mantenimiento.prioridad
  }
}

onMounted(async () => {
  await Promise.all([
    loadEstados(),
    novedadesStore.fetchPlantillas()
  ])
  initForm()
})
</script>