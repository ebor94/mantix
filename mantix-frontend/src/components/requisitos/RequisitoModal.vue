<!-- ============================================ -->
<!-- src/components/requisitos/RequisitoModal.vue -->
<!-- ============================================ -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
      
      <!-- Header -->
      <div class="flex-shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">
          {{ modoEdicion ? 'Editar Requisito' : 'Nuevo Requisito' }}
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

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          
          <!-- Información Básica -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold text-gray-900">Información Básica</h3>

            <div>
              <label for="req_nombre" class="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Requisito <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.nombre"
                id="req_nombre"
                type="text"
                required
                placeholder="Ej: Certificado de Seguridad Industrial"
                class="input-field"
              />
            </div>

            <div>
              <label for="req_descripcion" class="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                v-model="form.descripcion"
                id="req_descripcion"
                rows="3"
                placeholder="Describe el requisito..."
                class="input-field"
              ></textarea>
            </div>

            <div>
              <label for="req_dependencia" class="block text-sm font-medium text-gray-700 mb-1">
                Dependencia Responsable <span class="text-red-500">*</span>
              </label>
              <select
                v-model="form.id_dependencia"
                id="req_dependencia"
                required
                class="input-field"
              >
                <option value="">Seleccione dependencia</option>
                <option
                  v-for="dep in dependencias"
                  :key="dep.id"
                  :value="dep.id"
                >
                  {{ dep.nombre }}
                </option>
              </select>
            </div>
          </div>

          <!-- Categorías -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-gray-900">
                Categorías Asociadas <span class="text-red-500">*</span>
              </h3>
              <button
                type="button"
                @click="seleccionarTodasCategorias"
                class="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {{ todasSeleccionadas ? 'Deseleccionar todas' : 'Seleccionar todas' }}
              </button>
            </div>

            <p class="text-sm text-gray-600">
              Selecciona las categorías de mantenimiento que requieren este documento
            </p>

            <div v-if="categorias.length === 0" class="text-center py-8 text-gray-500">
              <svg class="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              No hay categorías disponibles
            </div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto p-1">
              <label
                v-for="categoria in categorias"
                :key="categoria.id"
                class="relative flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                :class="[
                  form.categorias.includes(categoria.id)
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200'
                ]"
              >
                <div class="flex items-center h-5">
                  <input
                    type="checkbox"
                    :value="categoria.id"
                    v-model="form.categorias"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div class="ml-3 flex-1 min-w-0">
                  <div class="flex items-center space-x-2">
                    <span v-if="categoria.icono" class="text-lg">{{ categoria.icono }}</span>
                    <span class="text-sm font-medium text-gray-900">
                      {{ categoria.nombre }}
                    </span>
                  </div>
                  <p v-if="categoria.descripcion" class="text-xs text-gray-500 mt-0.5 truncate">
                    {{ categoria.descripcion }}
                  </p>
                </div>
              </label>
            </div>

            <p v-if="form.categorias.length > 0" class="text-sm text-gray-600">
              {{ form.categorias.length }} categoría{{ form.categorias.length !== 1 ? 's' : '' }} seleccionada{{ form.categorias.length !== 1 ? 's' : '' }}
            </p>
          </div>

          <!-- Estado -->
          <div v-if="modoEdicion" class="space-y-4">
            <h3 class="text-lg font-semibold text-gray-900">Estado</h3>
            <div class="bg-gray-50 rounded-lg p-4">
              <label class="flex items-center cursor-pointer">
                <input
                  v-model="form.activo"
                  type="checkbox"
                  class="h-5 w-5 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <span class="ml-3 text-sm font-medium text-gray-900">
                  Requisito activo
                </span>
              </label>
              <p class="text-xs text-gray-500 mt-2">
                Los requisitos inactivos no se mostrarán en las actividades
              </p>
            </div>
          </div>

        </form>
      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 bg-white border-t px-6 py-4 flex items-center justify-end space-x-3">
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
            {{ modoEdicion ? 'Actualizar' : 'Crear' }} Requisito
          </span>
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRequisitosStore } from '@/stores/requisitos'
import api from '@/services/api'

const props = defineProps({
  requisito: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const requisitosStore = useRequisitosStore()

const loading = ref(false)
const modoEdicion = computed(() => !!props.requisito)
const categorias = ref([])
const dependencias = ref([])

const form = ref({
  nombre: '',
  descripcion: '',
  id_dependencia: '',
  categorias: [],
  activo: true
})

const formularioValido = computed(() => {
  return form.value.nombre &&
         form.value.id_dependencia &&
         form.value.categorias.length > 0
})

const todasSeleccionadas = computed(() => {
  return categorias.value.length > 0 &&
         form.value.categorias.length === categorias.value.length
})

const seleccionarTodasCategorias = () => {
  if (todasSeleccionadas.value) {
    form.value.categorias = []
  } else {
    form.value.categorias = categorias.value.map(c => c.id)
  }
}

const handleSubmit = async () => {
  if (!formularioValido.value) return

  loading.value = true
  try {
    const datos = { ...form.value }

    if (modoEdicion.value) {
      await requisitosStore.actualizarRequisito(props.requisito.id, datos)
    } else {
      await requisitosStore.crearRequisito(datos)
    }

    emit('success')
    emit('close')
  } catch (error) {
    console.error('Error al guardar requisito:', error)
  } finally {
    loading.value = false
  }
}

const cargarDatos = async () => {
  try {
    const [categoriasRes, dependenciasRes] = await Promise.all([
      api.get('/categorias-mantenimiento?activo=true'),
      api.get('/dependencias?activo=true')
    ])

    categorias.value = categoriasRes.data || categoriasRes
    dependencias.value = dependenciasRes.data || dependenciasRes

    // Si es edición, cargar datos del requisito
    if (modoEdicion.value) {
      form.value = {
        nombre: props.requisito.nombre,
        descripcion: props.requisito.descripcion || '',
        id_dependencia: props.requisito.id_dependencia,
        categorias: props.requisito.categorias?.map(c => c.id) || [],
        activo: props.requisito.activo
      }
    }
  } catch (error) {
    console.error('Error al cargar datos:', error)
  }
}

onMounted(() => {
  cargarDatos()
})
</script>

<style scoped>
.input-field {
  @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors;
}

.btn-primary {
  @apply inline-flex items-center justify-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-secondary {
  @apply inline-flex items-center justify-center px-4 py-2 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>