<!-- src/views/SolicitudesView.vue -->
<template>
  <MainLayout>
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Solicitudes R-275</h1>
          <p class="text-gray-500 mt-1">Gestión de solicitudes de mantenimiento correctivo</p>
        </div>
        <button @click="showCrearModal = true" class="btn-primary">
          <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Nueva Solicitud
        </button>
      </div>

      <!-- Estadísticas Rápidas -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-blue-600">Pendientes</p>
              <p class="text-2xl font-bold text-blue-900">{{ solicitudesPendientes.length }}</p>
            </div>
            <div class="h-12 w-12 bg-blue-500 rounded-xl flex items-center justify-center">
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-green-600">Aprobadas</p>
              <p class="text-2xl font-bold text-green-900">{{ solicitudesAprobadas.length }}</p>
            </div>
            <div class="h-12 w-12 bg-green-500 rounded-xl flex items-center justify-center">
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="card bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-orange-600">Asignadas</p>
              <p class="text-2xl font-bold text-orange-900">{{ solicitudesAsignadas.length }}</p>
            </div>
            <div class="h-12 w-12 bg-orange-500 rounded-xl flex items-center justify-center">
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="card bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Cerradas</p>
              <p class="text-2xl font-bold text-gray-900">{{ solicitudesCerradas.length }}</p>
            </div>
            <div class="h-12 w-12 bg-gray-500 rounded-xl flex items-center justify-center">
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
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
                placeholder="Buscar por descripción, solicitante o área..."
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

          <!-- Prioridad -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Prioridad</label>
            <select v-model="filters.prioridad" class="input-field">
              <option :value="null">Todas</option>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
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

      <!-- Lista de Solicitudes -->
      <div v-if="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        <p class="text-gray-500 mt-4">Cargando solicitudes...</p>
      </div>

      <div v-else-if="currentSolicitudes.length === 0" class="text-center py-12">
        <EmptyState
          title="No hay solicitudes"
          description="No se encontraron solicitudes con los filtros aplicados"
          icon="document"
        />
      </div>

      <div v-else class="space-y-4">
        <SolicitudCard
          v-for="solicitud in currentSolicitudes"
          :key="solicitud.id"
          :solicitud="solicitud"
          @aprobar="openAprobarModal"
          @asignar="openAsignarModal"
          @cerrar="openCerrarModal"
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

    <!-- Modales -->
    <CrearSolicitudModal
      v-if="showCrearModal"
      @close="showCrearModal = false"
      @success="handleSolicitudCreada"
    />

    <AprobarSolicitudModal
      v-if="showAprobarModal"
      :solicitud="selectedSolicitud"
      @close="showAprobarModal = false"
      @success="handleSolicitudAprobada"
    />

    <AsignarSolicitudModal
      v-if="showAsignarModal"
      :solicitud="selectedSolicitud"
      @close="showAsignarModal = false"
      @success="handleSolicitudAsignada"
    />

    <CerrarSolicitudModal
      v-if="showCerrarModal"
      :solicitud="selectedSolicitud"
      @close="showCerrarModal = false"
      @success="handleSolicitudCerrada"
    />

    <Loader :loading="loading" />
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSolicitudesStore } from '@/stores/solicitudes'
import MainLayout from '@/components/common/MainLayout.vue'
import SolicitudCard from '@/components/solicitudes/SolicitudCard.vue'
import CrearSolicitudModal from '@/components/solicitudes/CrearSolicitudModal.vue'
import AprobarSolicitudModal from '@/components/solicitudes/AprobarSolicitudModal.vue'
import AsignarSolicitudModal from '@/components/solicitudes/AsignarSolicitudModal.vue'
import CerrarSolicitudModal from '@/components/solicitudes/CerrarSolicitudModal.vue'
import Loader from '@/components/common/Loader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import api from '@/services/api'

const router = useRouter()
const solicitudesStore = useSolicitudesStore()

const {
  solicitudes,
  solicitudesPendientes,
  solicitudesAprobadas,
  solicitudesAsignadas,
  solicitudesCerradas,
  loading
} = storeToRefs(solicitudesStore)

const activeTab = ref('todas')
const filters = ref({
  search: '',
  sede_id: null,
  prioridad: null
})

const sedes = ref([])
const selectedSolicitud = ref(null)
const showCrearModal = ref(false)
const showAprobarModal = ref(false)
const showAsignarModal = ref(false)
const showCerrarModal = ref(false)
const currentPage = ref(1)
const itemsPerPage = 20

const tabs = computed(() => [
  { label: 'Todas', value: 'todas', count: solicitudes.value.length },
  { label: 'Pendientes', value: 'pendientes', count: solicitudesPendientes.value.length },
  { label: 'Aprobadas', value: 'aprobadas', count: solicitudesAprobadas.value.length },
  { label: 'Asignadas', value: 'asignadas', count: solicitudesAsignadas.value.length },
  { label: 'Cerradas', value: 'cerradas', count: solicitudesCerradas.value.length }
])

const currentSolicitudes = computed(() => {
  let data = []
  switch (activeTab.value) {
    case 'pendientes':
      data = solicitudesPendientes.value
      break
    case 'aprobadas':
      data = solicitudesAprobadas.value
      break
    case 'asignadas':
      data = solicitudesAsignadas.value
      break
    case 'cerradas':
      data = solicitudesCerradas.value
      break
    default:
      data = solicitudes.value
  }

  // Aplicar filtros
  if (filters.value.search) {
    const search = filters.value.search.toLowerCase()
    data = data.filter(s =>
      s.descripcion?.toLowerCase().includes(search) ||
      s.solicitante?.toLowerCase().includes(search) ||
      s.area?.toLowerCase().includes(search)
    )
  }

  if (filters.value.sede_id) {
    data = data.filter(s => s.sede_id === filters.value.sede_id)
  }

  if (filters.value.prioridad) {
    data = data.filter(s => s.prioridad === filters.value.prioridad)
  }

  return data
})

const totalPages = computed(() => Math.ceil(currentSolicitudes.value.length / itemsPerPage))

const openAprobarModal = (solicitud) => {
  selectedSolicitud.value = solicitud
  showAprobarModal.value = true
}

const openAsignarModal = (solicitud) => {
  selectedSolicitud.value = solicitud
  showAsignarModal.value = true
}

const openCerrarModal = (solicitud) => {
  selectedSolicitud.value = solicitud
  showCerrarModal.value = true
}

const verDetalle = (solicitud) => {
  router.push({ name: 'SolicitudDetalle', params: { id: solicitud.id } })
}

const handleSolicitudCreada = () => {
  showCrearModal.value = false
  loadData()
}

const handleSolicitudAprobada = () => {
  showAprobarModal.value = false
  loadData()
}

const handleSolicitudAsignada = () => {
  showAsignarModal.value = false
  loadData()
}

const handleSolicitudCerrada = () => {
  showCerrarModal.value = false
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
    prioridad: null
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
  await solicitudesStore.fetchSolicitudes()
}

const loadCatalogos = async () => {
  try {
    const sedesRes = await api.get('/sedes')
    sedes.value = sedesRes.data
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