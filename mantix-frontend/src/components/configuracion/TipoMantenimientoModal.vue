<!-- ============================================ -->
<!-- src/components/configuracion/TipoMantenimientoModal.vue -->
<!-- Modal para crear/editar tipos de mantenimiento -->
<!-- ============================================ -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-hidden">
      
      <!-- Header -->
      <div class="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">
          {{ modoEdicion ? 'Editar Tipo de Mantenimiento' : 'Nuevo Tipo de Mantenimiento' }}
        </h2>
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
      <form @submit.prevent="guardar" class="p-6 space-y-6">
        
        <!-- Nombre -->
        <div>
          <label for="tipo_nombre" class="block text-sm font-medium text-gray-700 mb-1">
            Nombre <span class="text-red-500">*</span>
          </label>
          <input
            v-model="form.nombre"
            id="tipo_nombre"
            type="text"
            required
            maxlength="50"
            placeholder="Ej: Preventivo, Correctivo, Predictivo"
            class="input"
            :class="{ 'border-red-500': errors.nombre }"
          />
          <p v-if="errors.nombre" class="text-sm text-red-600 mt-1">
            {{ errors.nombre }}
          </p>
          <p class="text-xs text-gray-500 mt-1">
            Máximo 50 caracteres
          </p>
        </div>

        <!-- Descripción -->
        <div>
          <label for="tipo_descripcion" class="block text-sm font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            v-model="form.descripcion"
            id="tipo_descripcion"
            rows="4"
            placeholder="Describe las características de este tipo de mantenimiento..."
            class="input"
          ></textarea>
          <p class="text-xs text-gray-500 mt-1">
            Opcional. Breve descripción del tipo de mantenimiento
          </p>
        </div>

        <!-- Ejemplos de tipos comunes -->
        <div v-if="!modoEdicion" class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 class="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Ejemplos de tipos comunes
          </h4>
          <ul class="text-sm text-blue-800 space-y-1">
            <li><strong>Preventivo:</strong> Mantenimiento programado para prevenir fallas</li>
            <li><strong>Correctivo:</strong> Mantenimiento para reparar fallas existentes</li>
            <li><strong>Predictivo:</strong> Basado en análisis de condición del equipo</li>
            <li><strong>Proactivo:</strong> Para eliminar causas raíz de fallas</li>
          </ul>
        </div>

      </form>

      <!-- Footer -->
      <div class="bg-gray-50 border-t px-6 py-4 flex items-center justify-end space-x-3">
        <button
          type="button"
          @click="$emit('close')"
          class="btn-secondary"
          :disabled="loading"
        >
          Cancelar
        </button>
        <button
          @click="guardar"
          class="btn-primary"
          :disabled="loading || !formularioValido"
        >
          <span v-if="loading" class="flex items-center">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Guardando...
          </span>
          <span v-else>
            {{ modoEdicion ? 'Actualizar' : 'Crear' }}
          </span>
        </button>
      </div>
      
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTiposMantenimientoStore } from '@/stores/tiposMantenimiento'

const props = defineProps({
  tipo: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const tiposStore = useTiposMantenimientoStore()

const loading = ref(false)
const modoEdicion = computed(() => !!props.tipo)
const errors = ref({})

// Formulario
const form = ref({
  nombre: '',
  descripcion: ''
})

// Validaciones
const formularioValido = computed(() => {
  return form.value.nombre.trim().length >= 3 && 
         form.value.nombre.length <= 50
})

// Métodos
const validar = () => {
  errors.value = {}

  if (!form.value.nombre.trim()) {
    errors.value.nombre = 'El nombre es requerido'
    return false
  }

  if (form.value.nombre.length < 3) {
    errors.value.nombre = 'El nombre debe tener al menos 3 caracteres'
    return false
  }

  if (form.value.nombre.length > 50) {
    errors.value.nombre = 'El nombre no puede exceder 50 caracteres'
    return false
  }

  return true
}

const guardar = async () => {
  if (!validar()) return

  loading.value = true
  try {
    const datos = {
      nombre: form.value.nombre.trim(),
      descripcion: form.value.descripcion.trim() || null
    }

    if (modoEdicion.value) {
      await tiposStore.actualizarTipo(props.tipo.id, datos)
    } else {
      await tiposStore.crearTipo(datos)
    }
    
    emit('success')
  } catch (error) {
    // Los errores ya son manejados por el store
    // pero podemos capturar errores específicos aquí si es necesario
    if (error.response?.data?.message) {
      if (error.response.data.message.includes('nombre')) {
        errors.value.nombre = error.response.data.message
      }
    }
  } finally {
    loading.value = false
  }
}

// Inicializar
onMounted(() => {
  if (modoEdicion.value) {
    form.value = {
      nombre: props.tipo.nombre,
      descripcion: props.tipo.descripcion || ''
    }
  }
})
</script>