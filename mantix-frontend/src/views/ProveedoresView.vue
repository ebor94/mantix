<!-- ============================================ -->
<!-- src/views/Proveedores.vue -->
<!-- Administración completa de proveedores -->
<!-- ============================================ -->
<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Proveedores</h1>
          <p class="text-gray-600 mt-1">Gestión de proveedores externos</p>
        </div>
        <button 
          @click="abrirModalCrear" 
          class="btn-primary flex items-center gap-2"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Proveedor
        </button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="bg-white rounded-lg shadow-sm p-4 mb-6">
      <div class="flex items-center gap-4">
        <div class="flex-1">
          <input
            v-model="busqueda"
            type="text"
            placeholder="Buscar proveedor por nombre, NIT o especialidad..."
            class="input"
          />
        </div>
        <div>
          <label class="flex items-center cursor-pointer">
            <input
              v-model="mostrarInactivos"
              type="checkbox"
              class="form-checkbox h-4 w-4 text-primary-600 rounded"
            />
            <span class="ml-2 text-sm text-gray-700">Mostrar inactivos</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="proveedoresStore.loading && proveedoresStore.proveedores.length === 0" 
         class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      <p class="mt-4 text-gray-600">Cargando proveedores...</p>
    </div>

    <!-- Lista de proveedores -->
    <div v-else-if="proveedoresFiltrados.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div 
        v-for="proveedor in proveedoresFiltrados" 
        :key="proveedor.id"
        class="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden"
        :class="{ 'opacity-60': !proveedor.activo }"
      >
        <!-- Header de la card -->
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 mb-1">
                {{ proveedor.nombre }}
              </h3>
              <p class="text-sm text-gray-600">
                NIT: {{ proveedor.nit }}
              </p>
            </div>
            <span 
              v-if="!proveedor.activo"
              class="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded"
            >
              Inactivo
            </span>
          </div>
        </div>

        <!-- Body de la card -->
        <div class="p-6 space-y-3">
          <div v-if="proveedor.especialidad">
            <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Especialidad</p>
            <p class="text-sm text-gray-900 mt-1">{{ proveedor.especialidad }}</p>
          </div>

          <div v-if="proveedor.periodicidad_contractual">
            <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Periodicidad</p>
            <p class="text-sm text-gray-900 mt-1">{{ proveedor.periodicidad_contractual }}</p>
          </div>

          <!-- Contacto principal -->
          <div v-if="proveedor.contactos && proveedor.contactos.length > 0">
            <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">Contacto Principal</p>
            <div class="mt-1 space-y-1">
              <p class="text-sm text-gray-900">{{ proveedor.contactos[0].nombre }}</p>
              <p v-if="proveedor.contactos[0].telefono" class="text-sm text-gray-600">
                📞 {{ proveedor.contactos[0].telefono }}
              </p>
              <p v-if="proveedor.contactos[0].email" class="text-sm text-gray-600">
                ✉️ {{ proveedor.contactos[0].email }}
              </p>
            </div>
          </div>
        </div>

        <!-- Footer de la card con acciones -->
        <div class="bg-gray-50 px-6 py-4 flex items-center justify-end gap-2 border-t border-gray-200">
          <button
            @click="verDetalle(proveedor)"
            class="text-blue-600 hover:text-blue-900 text-sm font-medium"
          >
            Ver detalle
          </button>
          <button
            @click="abrirModalEditar(proveedor)"
            class="text-gray-600 hover:text-gray-900"
            title="Editar"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            v-if="proveedor.activo"
            @click="confirmarEliminar(proveedor)"
            class="text-red-600 hover:text-red-900"
            title="Desactivar"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="bg-white rounded-lg shadow-sm p-12 text-center">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
      <h3 class="mt-4 text-lg font-medium text-gray-900">No hay proveedores</h3>
      <p class="mt-2 text-gray-600">Comienza creando tu primer proveedor</p>
      <button 
        @click="abrirModalCrear" 
        class="mt-6 btn-primary"
      >
        Crear Proveedor
      </button>
    </div>

    <!-- Modal de Proveedor -->
    <ProveedorModal
      v-if="mostrarModal"
      :proveedor="proveedorSeleccionado"
      @close="cerrarModal"
      @success="handleSuccess"
    />

    <!-- Modal de Detalle -->
    <ProveedorDetalleModal
      v-if="mostrarDetalle"
      :proveedor-id="proveedorDetalleId"
      @close="cerrarDetalle"
      @editar="abrirModalEditar"
    />

    <!-- Modal de confirmación -->
    <ConfirmDialog
      v-if="mostrarConfirmacion"
      :title="`¿Desactivar '${proveedorAEliminar?.nombre}'?`"
      message="El proveedor será marcado como inactivo y no aparecerá en las listas activas."
      confirm-text="Desactivar"
      confirm-class="btn-danger"
      @confirm="eliminarProveedor"
      @cancel="cerrarConfirmacion"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProveedoresStore } from '@/stores/proveedores'
import ProveedorModal from '@/components/proveedores/ProveedorModal.vue'
import ProveedorDetalleModal from '@/components/proveedores/ProveedorDetalleModal.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const proveedoresStore = useProveedoresStore()

const mostrarModal = ref(false)
const mostrarDetalle = ref(false)
const proveedorSeleccionado = ref(null)
const proveedorDetalleId = ref(null)
const busqueda = ref('')
const mostrarInactivos = ref(false)
const mostrarConfirmacion = ref(false)
const proveedorAEliminar = ref(null)

// Computed
const proveedoresFiltrados = computed(() => {
  let proveedores = proveedoresStore.proveedores

  // Filtrar por estado activo
  if (!mostrarInactivos.value) {
    proveedores = proveedores.filter(p => p.activo)
  }

  // Filtrar por búsqueda
  if (busqueda.value) {
    const termino = busqueda.value.toLowerCase()
    proveedores = proveedores.filter(p => 
      p.nombre.toLowerCase().includes(termino) ||
      p.nit.toLowerCase().includes(termino) ||
      p.especialidad?.toLowerCase().includes(termino)
    )
  }

  return proveedores
})

// Métodos
const abrirModalCrear = () => {
  proveedorSeleccionado.value = null
  mostrarModal.value = true
}

const abrirModalEditar = (proveedor) => {
  proveedorSeleccionado.value = proveedor
  mostrarModal.value = true
  mostrarDetalle.value = false
}

const cerrarModal = () => {
  mostrarModal.value = false
  proveedorSeleccionado.value = null
}

const handleSuccess = () => {
  cerrarModal()
  proveedoresStore.fetchProveedores()
}

const verDetalle = (proveedor) => {
  proveedorDetalleId.value = proveedor.id
  mostrarDetalle.value = true
}

const cerrarDetalle = () => {
  mostrarDetalle.value = false
  proveedorDetalleId.value = null
}

const confirmarEliminar = (proveedor) => {
  proveedorAEliminar.value = proveedor
  mostrarConfirmacion.value = true
}

const cerrarConfirmacion = () => {
  mostrarConfirmacion.value = false
  proveedorAEliminar.value = null
}

const eliminarProveedor = async () => {
  try {
    await proveedoresStore.eliminarProveedor(proveedorAEliminar.value.id)
    cerrarConfirmacion()
  } catch (error) {
    // Error manejado por el store
  }
}

onMounted(() => {
  proveedoresStore.fetchProveedores()
})
</script>