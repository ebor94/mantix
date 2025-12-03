<!-- ============================================ -->
<!-- src/components/planes/CrearPlanModal.vue -->
<!-- ============================================ -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">
          {{ modoEdicion ? 'Editar Plan' : 'Nuevo Plan de Mantenimiento' }}
        </h2>
        <button
          @click="$emit('close')"
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Form -->
      <form @submit.prevent="guardar" class="p-6 space-y-6">
        <!-- Año -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Año <span class="text-red-500">*</span>
          </label>
          <select
            v-model="form.anio"
            required
            class="input"
            :disabled="modoEdicion"
          >
            <option value="">Seleccione un año</option>
            <option v-for="anio in aniosDisponibles" :key="anio" :value="anio">
              {{ anio }}
            </option>
          </select>
          <p v-if="modoEdicion" class="text-xs text-gray-500 mt-1">
            El año no puede ser modificado
          </p>
        </div>

        <!-- Nombre -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Nombre del Plan <span class="text-red-500">*</span>
          </label>
          <input
            v-model="form.nombre"
            type="text"
            required
            placeholder="Ej: Plan de Mantenimiento Preventivo 2025"
            class="input"
            maxlength="200"
          />
          <p class="text-xs text-gray-500 mt-1">
            {{ form.nombre.length }}/200 caracteres
          </p>
        </div>

        <!-- Descripción -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            v-model="form.descripcion"
            rows="3"
            placeholder="Describe el objetivo y alcance del plan..."
            class="input"
          ></textarea>
        </div>

        <!-- Fechas -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Inicio <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.fecha_inicio"
              type="date"
              required
              class="input"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Fin <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.fecha_fin"
              type="date"
              required
              class="input"
              :min="form.fecha_inicio"
            />
          </div>
        </div>

        <!-- Alerta de validación de fechas -->
        <div
          v-if="form.fecha_inicio && form.fecha_fin && form.fecha_fin < form.fecha_inicio"
          class="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start"
        >
          <svg class="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
          <div>
            <p class="text-sm font-medium text-red-800">Error en las fechas</p>
            <p class="text-sm text-red-600 mt-1">La fecha de fin debe ser posterior a la fecha de inicio</p>
          </div>
        </div>

        <!-- Estado (solo en edición) -->
        <div v-if="modoEdicion" class="bg-gray-50 rounded-lg p-4">
          <label class="flex items-center cursor-pointer">
            <input
              v-model="form.activo"
              type="checkbox"
              class="form-checkbox h-5 w-5 text-primary-600 rounded focus:ring-primary-500"
            />
            <span class="ml-3 text-sm font-medium text-gray-900">
              Plan activo
            </span>
          </label>
          <p class="text-xs text-gray-500 mt-2">
            Los planes inactivos no generan mantenimientos programados
          </p>
        </div>

        <!-- Info adicional -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex">
            <svg class="h-5 w-5 text-blue-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
            </svg>
            <div>
              <p class="text-sm font-medium text-blue-800">Información</p>
              <p class="text-sm text-blue-600 mt-1">
                Después de crear el plan, podrás agregar actividades de mantenimiento y programar su ejecución automática.
              </p>
            </div>
          </div>
        </div>

        <!-- Botones -->
        <div class="flex items-center justify-end space-x-3 pt-4 border-t">
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
              {{ modoEdicion ? 'Actualizar Plan' : 'Crear Plan' }}
            </span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePlanesStore } from '@/stores/planes'

const props = defineProps({
  plan: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const planesStore = usePlanesStore()
const loading = ref(false)

const modoEdicion = computed(() => !!props.plan)

// Años disponibles (últimos 2 años + próximos 5)
const aniosDisponibles = computed(() => {
  const anioActual = new Date().getFullYear()
  const anios = []
  for (let i = anioActual - 2; i <= anioActual + 5; i++) {
    anios.push(i)
  }
  return anios
})

// Formulario
const form = ref({
  anio: new Date().getFullYear(),
  nombre: '',
  descripcion: '',
  fecha_inicio: '',
  fecha_fin: '',
  activo: true
})

// Validación del formulario
const formularioValido = computed(() => {
  return (
    form.value.anio &&
    form.value.nombre.trim() !== '' &&
    form.value.fecha_inicio &&
    form.value.fecha_fin &&
    form.value.fecha_fin >= form.value.fecha_inicio
  )
})

// Métodos
const guardar = async () => {
  if (!formularioValido.value) return

  loading.value = true
  try {
    if (modoEdicion.value) {
      await planesStore.actualizarPlan(props.plan.id, form.value)
    } else {
      await planesStore.crearPlan(form.value)
    }
    emit('success')
  } catch (error) {
    // Error manejado en el store
  } finally {
    loading.value = false
  }
}

// Inicializar formulario en modo edición
onMounted(() => {
  if (modoEdicion.value) {
    form.value = {
      nombre: props.plan.nombre,
      descripcion: props.plan.descripcion || '',
      fecha_inicio: props.plan.fecha_inicio,
      fecha_fin: props.plan.fecha_fin,
      activo: props.plan.activo
    }
  } else {
    // Establecer fechas por defecto para el año seleccionado
    const anio = form.value.anio
    form.value.fecha_inicio = `${anio}-01-01`
    form.value.fecha_fin = `${anio}-12-31`
  }
})
</script>