<!-- ============================================ -->
<!-- src/components/proveedores/ProveedorDetalleModal.vue -->
<!-- Modal para ver el detalle completo de un proveedor -->
<!-- ============================================ -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
      
      <!-- Header -->
      <div class="flex-shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">
          Detalle del Proveedor
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
      <div v-if="loading" class="flex-1 flex items-center justify-center p-12">
        <div class="text-center">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p class="mt-4 text-gray-600">Cargando información...</p>
        </div>
      </div>

      <div v-else-if="proveedor" class="flex-1 overflow-y-auto p-6 space-y-6">
        
        <!-- Información del Proveedor -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">
              Información del Proveedor
            </h3>
            <span 
              :class="proveedor.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
              class="px-3 py-1 text-xs font-medium rounded-full"
            >
              {{ proveedor.activo ? 'Activo' : 'Inactivo' }}
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Nombre Comercial</p>
              <p class="text-base text-gray-900 mt-1 font-medium">{{ proveedor.nombre }}</p>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">NIT/RUC</p>
              <p class="text-base text-gray-900 mt-1 font-medium">{{ proveedor.nit }}</p>
            </div>

            <div class="bg-gray-50 rounded-lg p-4 md:col-span-2">
              <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Razón Social</p>
              <p class="text-base text-gray-900 mt-1">{{ proveedor.razon_social }}</p>
            </div>

            <div v-if="proveedor.especialidad" class="bg-gray-50 rounded-lg p-4 md:col-span-2">
              <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Especialidad</p>
              <p class="text-base text-gray-900 mt-1">{{ proveedor.especialidad }}</p>
            </div>

            <div v-if="proveedor.periodicidad_contractual" class="bg-gray-50 rounded-lg p-4">
              <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Periodicidad Contractual</p>
              <p class="text-base text-gray-900 mt-1">{{ proveedor.periodicidad_contractual }}</p>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Fecha de Creación</p>
              <p class="text-base text-gray-900 mt-1">{{ formatearFecha(proveedor.created_at) }}</p>
            </div>

            <div v-if="proveedor.observaciones" class="bg-gray-50 rounded-lg p-4 md:col-span-2">
              <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Observaciones</p>
              <p class="text-base text-gray-900 mt-1">{{ proveedor.observaciones }}</p>
            </div>
          </div>
        </div>

        <!-- Contactos -->
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-gray-900 border-b pb-2">
            Contactos ({{ proveedor.contactos?.length || 0 }})
          </h3>

          <div v-if="!proveedor.contactos || proveedor.contactos.length === 0" 
               class="text-center py-8 bg-gray-50 rounded-lg">
            <p class="text-gray-600">No hay contactos registrados</p>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="contacto in proveedor.contactos"
              :key="contacto.id"
              class="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
            >
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h4 class="font-semibold text-gray-900 text-lg">
                    {{ contacto.nombre }}
                  </h4>
                  <p v-if="contacto.cargo" class="text-sm text-gray-600 mt-1">
                    {{ contacto.cargo }}
                  </p>
                </div>
                <span 
                  v-if="contacto.es_principal"
                  class="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded"
                >
                  Principal
                </span>
              </div>

              <div class="space-y-2">
                <div v-if="contacto.telefono" class="flex items-center gap-2 text-sm text-gray-700">
                  <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <a :href="`tel:${contacto.telefono}`" class="hover:text-primary-600">
                    {{ contacto.telefono }}
                  </a>
                </div>

                <div v-if="contacto.email" class="flex items-center gap-2 text-sm text-gray-700">
                  <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a :href="`mailto:${contacto.email}`" class="hover:text-primary-600">
                    {{ contacto.email }}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 bg-gray-50 border-t px-6 py-4 flex items-center justify-end space-x-3">
        <button
          type="button"
          @click="$emit('close')"
          class="btn-secondary"
        >
          Cerrar
        </button>
        <button
          v-if="proveedor"
          @click="$emit('editar', proveedor)"
          class="btn-primary"
        >
          Editar Proveedor
        </button>
      </div>
      
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useProveedoresStore } from '@/stores/proveedores'

const props = defineProps({
  proveedorId: {
    type: Number,
    required: true
  }
})

defineEmits(['close', 'editar'])

const proveedoresStore = useProveedoresStore()

const loading = ref(true)
const proveedor = ref(null)

const formatearFecha = (fecha) => {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

onMounted(async () => {
  try {
    proveedor.value = await proveedoresStore.fetchProveedor(props.proveedorId)
  } catch (error) {
    console.error('Error al cargar proveedor:', error)
  } finally {
    loading.value = false
  }
})
</script>