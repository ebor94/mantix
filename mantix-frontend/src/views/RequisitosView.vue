<!-- ============================================ -->
<!-- src/views/RequisitosView.vue -->
<!-- ============================================ -->
<template>
  <MainLayout>
    <div class="space-y-6">
      
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Requisitos por Categoría</h1>
          <p class="text-gray-500 mt-1">
            Gestiona los requisitos y documentación necesaria para cada categoría de mantenimiento
          </p>
        </div>
        <button
          @click="showModal = true"
          class="btn-primary"
        >
          <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Requisito
        </button>
      </div>

      <!-- Estadísticas -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Total Requisitos</p>
              <p class="text-3xl font-bold text-gray-900 mt-2">{{ totalRequisitos }}</p>
            </div>
            <div class="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <svg class="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Activos</p>
              <p class="text-3xl font-bold text-green-600 mt-2">{{ requisitosActivos }}</p>
            </div>
            <div class="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Inactivos</p>
              <p class="text-3xl font-bold text-red-600 mt-2">{{ requisitosInactivos }}</p>
            </div>
            <div class="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Categorías</p>
              <p class="text-3xl font-bold text-blue-600 mt-2">{{ categorias.length }}</p>
            </div>
            <div class="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Filtros y Búsqueda -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          <!-- Búsqueda -->
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
            <div class="relative">
              <input
                v-model="filtros.busqueda"
                type="text"
                placeholder="Buscar por nombre o descripción..."
                class="input-field pl-10"
              />
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Categoría -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
            <select v-model="filtros.categoria_id" class="input-field" @change="aplicarFiltros">
              <option :value="null">Todas las categorías</option>
              <option v-for="cat in categorias" :key="cat.id" :value="cat.id">
                {{ cat.nombre }}
              </option>
            </select>
          </div>

          <!-- Estado -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Estado</label>
            <select v-model="filtros.activo" class="input-field" @change="aplicarFiltros">
              <option :value="null">Todos</option>
              <option :value="true">Activos</option>
              <option :value="false">Inactivos</option>
            </select>
          </div>

        </div>

        <div class="flex items-center justify-end space-x-3 mt-4">
          <button @click="limpiarFiltros" class="btn-secondary text-sm">
            Limpiar filtros
          </button>
        </div>
      </div>

      <!-- Tabs de Vista -->
      <div class="border-b border-gray-200">
        <nav class="-mb-px flex space-x-8">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            @click="vistaActual = tab.value"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              vistaActual === tab.value
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <!-- Vista de Lista -->
      <div v-if="vistaActual === 'lista'">
        <div v-if="loading" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <p class="text-gray-500 mt-4">Cargando requisitos...</p>
        </div>

        <div v-else-if="requisitosFiltrados.length === 0" class="text-center py-12">
          <svg class="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-gray-500">No se encontraron requisitos</p>
          <button @click="showModal = true" class="btn-primary mt-4">
            Crear primer requisito
          </button>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <RequisitoCard
            v-for="requisito in requisitosFiltrados"
            :key="requisito.id"
            :requisito="requisito"
            @editar="editarRequisito"
            @eliminar="confirmarEliminarRequisito"
          />
        </div>
      </div>

      <!-- Vista por Categoría -->
      <div v-else-if="vistaActual === 'categoria'">
        <div v-if="loading" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <p class="text-gray-500 mt-4">Cargando requisitos...</p>
        </div>

        <div v-else-if="Object.keys(requisitosPorCategoria).length === 0" class="text-center py-12">
          <svg class="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p class="text-gray-500">No hay requisitos asignados a categorías</p>
        </div>

        <div v-else class="space-y-6">
          <div
            v-for="(grupo, categoriaId) in requisitosPorCategoria"
            :key="categoriaId"
            class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
          >
            <!-- Header de Categoría -->
            <div
              class="px-6 py-4 border-b border-gray-200"
              :style="{
                backgroundColor: grupo.categoria.color + '10',
                borderLeftColor: grupo.categoria.color,
                borderLeftWidth: '4px'
              }"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <span v-if="grupo.categoria.icono" class="text-2xl">
                    {{ grupo.categoria.icono }}
                  </span>
                  <div>
                    <h3 class="text-lg font-bold text-gray-900">
                      {{ grupo.categoria.nombre }}
                    </h3>
                    <p v-if="grupo.categoria.descripcion" class="text-sm text-gray-600">
                      {{ grupo.categoria.descripcion }}
                    </p>
                  </div>
                </div>
                <span class="px-3 py-1 text-sm font-semibold rounded-full"
                  :style="{
                    backgroundColor: grupo.categoria.color + '20',
                    color: grupo.categoria.color
                  }"
                >
                  {{ grupo.requisitos.length }} requisito{{ grupo.requisitos.length !== 1 ? 's' : '' }}
                </span>
              </div>
            </div>

            <!-- Lista de Requisitos -->
            <div class="p-6">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RequisitoCard
                  v-for="requisito in grupo.requisitos"
                  :key="requisito.id"
                  :requisito="requisito"
                  @editar="editarRequisito"
                  @eliminar="confirmarEliminarRequisito"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Modal de Requisito -->
    <RequisitoModal
      v-if="showModal"
      :requisito="requisitoEditando"
      @close="cerrarModal"
      @success="handleSuccess"
    />

  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRequisitosStore } from '@/stores/requisitos'
import { storeToRefs } from 'pinia'
import MainLayout from '@/components/common/MainLayout.vue'
import RequisitoCard from '@/components/requisitos/RequisitoCard.vue'
import RequisitoModal from '@/components/requisitos/RequisitoModal.vue'
import { useToast } from 'vue-toastification'

const toast = useToast()
const requisitosStore = useRequisitosStore()

const {
  requisitos,
  requisitosFiltrados,
  requisitosPorCategoria,
  totalRequisitos,
  requisitosActivos,
  requisitosInactivos,
  categorias,
  loading
} = storeToRefs(requisitosStore)

const showModal = ref(false)
const requisitoEditando = ref(null)
const vistaActual = ref('lista')

const filtros = ref({
  busqueda: '',
  categoria_id: null,
  activo: true
})

const tabs = [
  { label: 'Vista de Lista', value: 'lista' },
  { label: 'Por Categoría', value: 'categoria' }
]

const editarRequisito = (requisito) => {
  requisitoEditando.value = requisito
  showModal.value = true
}

const confirmarEliminarRequisito = async (requisito) => {
  if (confirm(`¿Está seguro de desactivar el requisito "${requisito.nombre}"?`)) {
    try {
      await requisitosStore.eliminarRequisito(requisito.id)
    } catch (error) {
      console.error('Error al eliminar requisito:', error)
    }
  }
}

const cerrarModal = () => {
  showModal.value = false
  requisitoEditando.value = null
}

const handleSuccess = async () => {
  await cargarDatos()
}

const aplicarFiltros = async () => {
  requisitosStore.setFiltros(filtros.value)
  await requisitosStore.fetchRequisitos(filtros.value)
}

const limpiarFiltros = async () => {
  filtros.value = {
    busqueda: '',
    categoria_id: null,
    activo: true
  }
  requisitosStore.clearFiltros()
  await cargarDatos()
}

const cargarDatos = async () => {
  await Promise.all([
    requisitosStore.fetchRequisitos(filtros.value),
    requisitosStore.fetchCategorias()
  ])
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
  @apply inline-flex items-center justify-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors;
}

.btn-secondary {
  @apply inline-flex items-center justify-center px-4 py-2 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors;
}
</style>