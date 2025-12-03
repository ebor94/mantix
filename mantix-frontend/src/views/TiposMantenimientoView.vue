<!-- ============================================ -->
<!-- src/views/TiposMantenimiento.vue -->
<!-- Administración completa de tipos de mantenimiento -->
<!-- ============================================ -->
<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Tipos de Mantenimiento</h1>
          <p class="text-gray-600 mt-1">Gestión de tipos de mantenimiento</p>
        </div>
        <button 
          @click="abrirModalCrear" 
          class="btn-primary flex items-center gap-2"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Tipo
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
            placeholder="Buscar tipo de mantenimiento..."
            class="input"
            @input="buscar"
          />
        </div>
        <button 
          v-if="busqueda" 
          @click="limpiarBusqueda"
          class="btn-secondary"
        >
          Limpiar
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="tiposStore.loading && tiposStore.tipos.length === 0" class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      <p class="mt-4 text-gray-600">Cargando tipos de mantenimiento...</p>
    </div>

    <!-- Lista de tipos -->
    <div v-else-if="tiposStore.tipos.length > 0" class="bg-white rounded-lg shadow-sm overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nombre
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Descripción
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Creado
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="tipo in tiposStore.tipos" :key="tipo.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900">
                {{ tipo.nombre }}
              </div>
            </td>
            <td class="px-6 py-4">
              <div class="text-sm text-gray-600">
                {{ tipo.descripcion || 'Sin descripción' }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm text-gray-500">
                {{ formatearFecha(tipo.created_at) }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <div class="flex items-center justify-end gap-2">
                <button
                  @click="abrirModalEditar(tipo)"
                  class="text-blue-600 hover:text-blue-900"
                  title="Editar"
                >
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  @click="confirmarEliminar(tipo)"
                  class="text-red-600 hover:text-red-900"
                  title="Eliminar"
                >
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Paginación -->
      <div v-if="tiposStore.pagination.totalPages > 1" class="bg-gray-50 px-6 py-4 border-t border-gray-200">
        <div class="flex items-center justify-between">
          <div class="text-sm text-gray-700">
            Mostrando 
            <span class="font-medium">{{ (tiposStore.pagination.page - 1) * tiposStore.pagination.limit + 1 }}</span>
            a
            <span class="font-medium">{{ Math.min(tiposStore.pagination.page * tiposStore.pagination.limit, tiposStore.pagination.total) }}</span>
            de
            <span class="font-medium">{{ tiposStore.pagination.total }}</span>
            resultados
          </div>
          <div class="flex gap-2">
            <button
              @click="cambiarPagina(tiposStore.pagination.page - 1)"
              :disabled="tiposStore.pagination.page === 1"
              class="btn-secondary"
              :class="{ 'opacity-50 cursor-not-allowed': tiposStore.pagination.page === 1 }"
            >
              Anterior
            </button>
            <button
              @click="cambiarPagina(tiposStore.pagination.page + 1)"
              :disabled="tiposStore.pagination.page >= tiposStore.pagination.totalPages"
              class="btn-secondary"
              :class="{ 'opacity-50 cursor-not-allowed': tiposStore.pagination.page >= tiposStore.pagination.totalPages }"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="bg-white rounded-lg shadow-sm p-12 text-center">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <h3 class="mt-4 text-lg font-medium text-gray-900">No hay tipos de mantenimiento</h3>
      <p class="mt-2 text-gray-600">Comienza creando tu primer tipo de mantenimiento</p>
      <button 
        @click="abrirModalCrear" 
        class="mt-6 btn-primary"
      >
        Crear Tipo
      </button>
    </div>

    <!-- Modal -->
    <TipoMantenimientoModal
      v-if="mostrarModal"
      :tipo="tipoSeleccionado"
      @close="cerrarModal"
      @success="handleSuccess"
    />

    <!-- Modal de confirmación de eliminación -->
    <ConfirmDialog
      v-if="mostrarConfirmacion"
      :title="`¿Eliminar '${tipoAEliminar?.nombre}'?`"
      message="Esta acción no se puede deshacer. Si este tipo tiene actividades asociadas, no podrá eliminarse."
      confirm-text="Eliminar"
      confirm-class="btn-danger"
      @confirm="eliminarTipo"
      @cancel="cerrarConfirmacion"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useTiposMantenimientoStore } from '@/stores/tiposMantenimiento'
import TipoMantenimientoModal from '@/components/configuracion/TipoMantenimientoModal.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const tiposStore = useTiposMantenimientoStore()

const mostrarModal = ref(false)
const tipoSeleccionado = ref(null)
const busqueda = ref('')
const mostrarConfirmacion = ref(false)
const tipoAEliminar = ref(null)

let timeoutBusqueda = null

// Métodos
const abrirModalCrear = () => {
  tipoSeleccionado.value = null
  mostrarModal.value = true
}

const abrirModalEditar = (tipo) => {
  tipoSeleccionado.value = tipo
  mostrarModal.value = true
}

const cerrarModal = () => {
  mostrarModal.value = false
  tipoSeleccionado.value = null
}

const handleSuccess = () => {
  cerrarModal()
  tiposStore.fetchTipos()
}

const buscar = () => {
  if (timeoutBusqueda) clearTimeout(timeoutBusqueda)
  
  timeoutBusqueda = setTimeout(() => {
    tiposStore.aplicarFiltros({ buscar: busqueda.value })
  }, 300)
}

const limpiarBusqueda = () => {
  busqueda.value = ''
  tiposStore.limpiarFiltros()
}

const cambiarPagina = (page) => {
  tiposStore.cambiarPagina(page)
}

const confirmarEliminar = (tipo) => {
  tipoAEliminar.value = tipo
  mostrarConfirmacion.value = true
}

const cerrarConfirmacion = () => {
  mostrarConfirmacion.value = false
  tipoAEliminar.value = null
}

const eliminarTipo = async () => {
  try {
    await tiposStore.eliminarTipo(tipoAEliminar.value.id)
    cerrarConfirmacion()
  } catch (error) {
    // Error manejado por el store
  }
}

const formatearFecha = (fecha) => {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(() => {
  tiposStore.fetchTipos()
})
</script>