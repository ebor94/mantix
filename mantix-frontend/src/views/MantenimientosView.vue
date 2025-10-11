<!-- src/views/MantenimientosView.vue -->
<template>
  <MainLayout>
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Mantenimientos</h1>
          <p class="text-gray-500 mt-1">Gestión y seguimiento de mantenimientos programados</p>
        </div>
        <div class="flex items-center space-x-3">
          <button
            @click="viewMode = 'list'"
            :class="[
              'p-2 rounded-lg transition-colors',
              viewMode === 'list' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            ]"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            @click="viewMode = 'calendar'"
            :class="[
              'p-2 rounded-lg transition-colors',
              viewMode === 'calendar' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            ]"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Filtros -->
      <div class="card">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <!-- Búsqueda -->
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
            <div class="relative">
              <input
                v-model="filters.search"
                type="text"
                placeholder="Buscar por nombre o sede..."
                class="input-field pl-10"
              />
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Sede -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Sede</label>
            <select v-model="filters.sede_id" class="input-field">
              <option :value="null">Todas las sedes</option>
              <option v-for="sede in sedes" :key="sede.id" :value="sede.id">
                {{ sede.nombre }}
              </option>
            </select>
          </div>

          <!-- Estado -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Estado</label>
            <select v-model="filters.estado_id" class="input-field">
              <option :value="null">Todos los estados</option>
              <option v-for="estado in estados" :key="estado.id" :value="estado.id">
                {{ estado.nombre }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex items-center justify-end space-x-3 mt-4">
          <button @click="clearFilters" class="btn-secondary text-sm">
            Limpiar filtros
          </button>
          <button @click="applyFilters" class="btn-primary text-sm">
            Aplicar filtros
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="border-b border-gray-200">
        <nav class="-mb-px flex space-x-8">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            @click="activeTab = tab.value"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === tab.value
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]"
          >
            {{ tab.label }}
            <span
              v-if="tab.count !== undefined"
              :class="[
                'ml-2 py-0.5 px-2 rounded-full text-xs',
                activeTab === tab.value ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'
              ]"
            >
              {{ tab.count }}
            </span>
          </button>
        </nav>
      </div>

      <!-- Vista de Lista -->
      <div v-if="viewMode === 'list'">
        <div v-if="loading" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <p class="text-gray-500 mt-4">Cargando mantenimientos...</p>
        </div>

        <div v-else-if="currentMantenimientos.length === 0" class="text-center py-12">
          <EmptyState
            title="No hay mantenimientos"
            description="No se encontraron mantenimientos con los filtros aplicados"
            icon="calendar"
          />
        </div>

        <div v-else class="space-y-4">
          <MantenimientoCard
            v-for="mantenimiento in currentMantenimientos"
            :key="mantenimiento.id"
            :mantenimiento="mantenimiento"
            @ejecutar="openEjecutarModal"
            @reprogramar="openReprogramarModal"
            @ver-detalle="verDetalle"
          />
        </div>

        <!-- Paginación -->
        <div v-if="totalPages > 1" class="flex items-center justify-center space-x-2 mt-6">
          <button
            @click="previousPage"
            :disabled="currentPage === 1"
            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <span class="px-4 py-2 text-sm text-gray-700">
            Página {{ currentPage }} de {{ totalPages }}
          </span>
          <button
            @click="nextPage"
            :disabled="currentPage === totalPages"
            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      </div>

      <!-- Vista de Calendario -->
      <div v-else>
        <CalendarioMantenimientos :mantenimientos="currentMantenimientos" />
      </div>
    </div>

    <!-- Modal de Ejecución -->
    <EjecutarMantenimientoModal
      v-if="showEjecutarModal"
      :mantenimiento="selectedMantenimiento"
      @close="showEjecutarModal = false"
      @success="handleEjecutado"
    />

    <!-- Modal de Reprogramación -->
    <ReprogramarMantenimientoModal
      v-if="showReprogramarModal"
      :mantenimiento="selectedMantenimiento"
      @close="showReprogramarModal = false"
      @success="handleReprogramado"
    />

    <Loader :loading="loading" />
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useMantenimientosStore } from '@/stores/mantenimientos'
import MainLayout from '@/components/common/MainLayout.vue'
import MantenimientoCard from '@/components/mantenimientos/MantenimientoCard.vue'
import CalendarioMantenimientos from '@/components/mantenimientos/CalendarioMantenimientos.vue'
import EjecutarMantenimientoModal from '@/components/mantenimientos/EjecutarMantenimientoModal.vue'
import ReprogramarMantenimientoModal from '@/components/mantenimientos/ReprogramarMantenimientoModal.vue'
import Loader from '@/components/common/Loader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import api from '@/services/api'

const router = useRouter()
const mantenimientosStore = useMantenimientosStore()

const {
  mantenimientos,
  mantenimientosHoy,
  mantenimientosProximos,
  mantenimientosAtrasados,
  loading
} = storeToRefs(mantenimientosStore)

const viewMode = ref('list')
const activeTab = ref('todos')
const filters = ref({
  search: '',
  sede_id: null,
  estado_id: null
})

const sedes = ref([])
const estados = ref([])
const selectedMantenimiento = ref(null)
const showEjecutarModal = ref(false)
const showReprogramarModal = ref(false)
const currentPage = ref(1)
const itemsPerPage = 20

const tabs = computed(() => [
  { label: 'Todos', value: 'todos', count: mantenimientos.value.length },
  { label: 'Hoy', value: 'hoy', count: mantenimientosHoy.value.length },
  { label: 'Próximos', value: 'proximos', count: mantenimientosProximos.value.length },
  { label: 'Atrasados', value: 'atrasados', count: mantenimientosAtrasados.value.length }
])

const currentMantenimientos = computed(() => {
  let data = []
  switch (activeTab.value) {
    case 'hoy':
      data = mantenimientosHoy.value
      break
    case 'proximos':
      data = mantenimientosProximos.value
      break
    case 'atrasados':
      data = mantenimientosAtrasados.value
      break
    default:
      data = mantenimientos.value
  }

  // Aplicar filtros
  if (filters.value.search) {
    const search = filters.value.search.toLowerCase()
    data = data.filter(m =>
      m.actividad?.nombre?.toLowerCase().includes(search) ||
      m.actividad?.sede?.nombre?.toLowerCase().includes(search)
    )
  }

  if (filters.value.sede_id) {
    data = data.filter(m => m.actividad?.sede_id === filters.value.sede_id)
  }

  if (filters.value.estado_id) {
    data = data.filter(m => m.estado_id === filters.value.estado_id)
  }

  return data
})

const totalPages = computed(() => Math.ceil(currentMantenimientos.value.length / itemsPerPage))

const openEjecutarModal = (mantenimiento) => {
  selectedMantenimiento.value = mantenimiento
  showEjecutarModal.value = true
}

const openReprogramarModal = (mantenimiento) => {
  selectedMantenimiento.value = mantenimiento
  showReprogramarModal.value = true
}

const verDetalle = (mantenimiento) => {
  router.push({ name: 'MantenimientoDetalle', params: { id: mantenimiento.id } })
}

const handleEjecutado = () => {
  showEjecutarModal.value = false
  loadData()
}

const handleReprogramado = () => {
  showReprogramarModal.value = false
  loadData()
}

const applyFilters = () => {
  currentPage.value = 1
  loadData()
}

const clearFilters = () => {
  filters.value = {
    search: '',
    sede_id: null,
    estado_id: null
  }
  currentPage.value = 1
  loadData()
}

const previousPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}

const loadData = async () => {
  await Promise.all([
    mantenimientosStore.fetchMantenimientos(),
    mantenimientosStore.fetchMantenimientosHoy(),
    mantenimientosStore.fetchMantenimientosProximos(),
    mantenimientosStore.fetchMantenimientosAtrasados()
  ])
}

const loadCatalogos = async () => {
  try {
    const [sedesRes, estadosRes] = await Promise.all([
      api.get('/sedes'),
      api.get('/estados')
    ])
    sedes.value = sedesRes.data
    estados.value = estadosRes.data
  } catch (error) {
    console.error('Error al cargar catálogos:', error)
  }
}

watch(activeTab, () => {
  currentPage.value = 1
})

onMounted(() => {
  loadData()
  loadCatalogos()
})
</script>