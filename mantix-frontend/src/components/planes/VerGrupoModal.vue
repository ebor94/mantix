<!-- src/components/planes/VerGrupoModal.vue -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
      
      <!-- Header -->
      <div class="flex-shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Actividades del Grupo</h2>
          <p class="text-sm text-gray-500 mt-1">
            Grupo: <code class="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">{{ grupoMasivoId }}</code>
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

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <span class="ml-3 text-gray-600">Cargando actividades...</span>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
          <div class="flex items-start">
            <svg class="h-5 w-5 text-red-600 mt-0.5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 class="text-sm font-medium text-red-800">Error al cargar actividades</h3>
              <p class="text-sm text-red-700 mt-1">{{ error }}</p>
            </div>
          </div>
        </div>

        <!-- Lista de actividades -->
        <div v-else-if="actividades.length > 0" class="space-y-4">
          <!-- Info summary -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <svg class="h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-sm font-medium text-blue-900">
                  {{ actividades.length }} actividad{{ actividades.length !== 1 ? 'es' : '' }} en este grupo
                </span>
              </div>
              <div class="flex space-x-2">
                <button
                  @click="$emit('editar-grupo', grupoMasivoId)"
                  class="text-xs font-medium text-blue-700 hover:text-blue-800 underline"
                >
                  Editar grupo completo
                </button>
              </div>
            </div>
          </div>

          <!-- Cards de actividades -->
          <div class="grid gap-4">
            <div
              v-for="actividad in actividades"
              :key="actividad.id"
              class="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:bg-primary-50 transition-all"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center space-x-2 mb-2">
                    <h3 class="text-lg font-semibold text-gray-900">{{ actividad.nombre }}</h3>
                    <span
                      class="px-2 py-0.5 text-xs font-medium rounded-full"
                      :class="actividad.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
                    >
                      {{ actividad.activo ? 'Activa' : 'Inactiva' }}
                    </span>
                  </div>

                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span class="text-gray-500">Equipo:</span>
                      <p class="font-medium text-gray-900">
                        {{ actividad.equipo?.codigo || 'Sin equipo' }}
                      </p>
                      <p class="text-xs text-gray-600">
                        {{ actividad.equipo?.nombre || '' }}
                      </p>
                    </div>

                    <div>
                      <span class="text-gray-500">Sede:</span>
                      <p class="font-medium text-gray-900">
                        {{ actividad.sede?.nombre || 'N/A' }}
                      </p>
                    </div>

                    <div>
                      <span class="text-gray-500">Periodicidad:</span>
                      <p class="font-medium text-gray-900">
                        {{ actividad.periodicidad?.nombre || 'N/A' }}
                      </p>
                      <p class="text-xs text-gray-600">
                        Cada {{ actividad.periodicidad?.dias || 0 }} días
                      </p>
                    </div>

                    <div>
                      <span class="text-gray-500">Responsable:</span>
                      <p class="font-medium text-gray-900">
                        {{ getResponsable(actividad) }}
                      </p>
                    </div>
                  </div>
                </div>

                <div class="ml-4">
                  <button
                    @click="$emit('editar-individual', actividad)"
                    class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Editar solo esta actividad"
                  >
                    <svg class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="text-center py-12">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p class="mt-2 text-sm text-gray-600">No se encontraron actividades en este grupo</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 bg-white border-t px-6 py-4 flex items-center justify-end space-x-3">
        <button
          type="button"
          @click="$emit('close')"
          class="btn-secondary"
        >
          Cerrar
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const props = defineProps({
  grupoMasivoId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'editar-grupo', 'editar-individual'])

const toast = useToast()
const loading = ref(true)
const error = ref(null)
const actividades = ref([])

const cargarActividades = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await api.get(`/plan-actividades/grupo/${props.grupoMasivoId}`)
    actividades.value = response.data || response
    
    if (actividades.value.length === 0) {
      toast.warning('No se encontraron actividades en este grupo')
    }
  } catch (err) {
    console.error('Error al cargar actividades del grupo:', err)
    error.value = err.response?.data?.message || 'Error al cargar las actividades del grupo'
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}

const getResponsable = (actividad) => {
  if (actividad.responsable_tipo === 'interno' && actividad.responsable_usuario) {
    return `${actividad.responsable_usuario.nombre} ${actividad.responsable_usuario.apellido || ''}`.trim()
  }
  if (actividad.responsable_tipo === 'externo' && actividad.responsable_proveedor) {
    return actividad.responsable_proveedor.nombre
  }
  return 'Sin asignar'
}

onMounted(() => {
  cargarActividades()
})
</script>