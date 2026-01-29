<!-- src/views/EquiposView.vue -->
<template>
  <MainLayout>
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Inventario de Equipos</h1>
          <p class="text-gray-500 mt-1">Gestión de equipos, maquinaria y activos</p>
        </div>
        <button @click="showCrearModal = true" class="btn-primary">
          <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Equipo
        </button>
      </div>

      <!-- Estadísticas Rápidas -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-green-600">Operativos</p>
              <p class="text-2xl font-bold text-green-900">{{ equiposOperativos.length }}</p>
            </div>
            <div class="h-12 w-12 bg-green-500 rounded-xl flex items-center justify-center">
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

<!--         <div class="card bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-orange-600">En Mantenimiento</p>
              <p class="text-2xl font-bold text-orange-900">{{ equiposEnMantenimiento.length }}</p>
            </div>
            <div class="h-12 w-12 bg-orange-500 rounded-xl flex items-center justify-center">
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              </svg>
            </div>
          </div>
        </div> -->

        <div class="card bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-red-600">Fuera de Servicio</p>
              <p class="text-2xl font-bold text-red-900">{{ equiposFueraServicio.length }}</p>
            </div>
            <div class="h-12 w-12 bg-red-500 rounded-xl flex items-center justify-center">
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="card bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Total Equipos</p>
              <p class="text-2xl font-bold text-gray-900">{{ equipos.length }}</p>
            </div>
            <div class="h-12 w-12 bg-gray-500 rounded-xl flex items-center justify-center">
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
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
              <input v-model="filters.search" type="text" placeholder="Buscar por nombre, código, marca o modelo..."
                class="input-field pl-10" />
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Sede</label>
            <select v-model="filters.sede_id" class="input-field">
              <option :value="null">Todas las sedes</option>
              <option v-for="sede in sedes" :key="sede.id" :value="sede.id">
                {{ sede.nombre }}
              </option>
            </select>
          </div>

          <!-- Categoría -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
            <select v-model="filters.categoria_id" class="input-field">
              <option :value="null">Todas las categorías</option>
              <option v-for="cat in categorias" :key="cat.id" :value="cat.id">
                {{ cat.nombre }}
              </option>
            </select>
          </div>

          <!-- Estado -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Estado</label>
            <select v-model="filters.estado" class="input-field">
              <option :value="null">Todos los estados</option>
              <option value="operativo">Operativo</option>
              <option value="en_mantenimiento">En Mantenimiento</option>
              <option value="fuera_servicio">Fuera de Servicio</option>
              <option value="dado_baja">Dado de Baja</option>
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
          <button v-for="tab in tabs" :key="tab.value" @click="activeTab = tab.value" :class="[
            'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
            activeTab === tab.value
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]">
            {{ tab.label }}
            <span v-if="tab.count !== undefined" :class="[
              'ml-2 py-0.5 px-2 rounded-full text-xs',
              activeTab === tab.value ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'
            ]">
              {{ tab.count }}
            </span>
          </button>
        </nav>
      </div>

      <!-- Lista de Equipos -->
      <div v-if="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        <p class="text-gray-500 mt-4">Cargando equipos...</p>
      </div>

      <div v-else-if="currentEquipos.length === 0" class="text-center py-12">
        <EmptyState title="No hay equipos" description="No se encontraron equipos con los filtros aplicados"
          icon="cube" />
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <EquipoCard v-for="equipo in currentEquipos" :key="equipo.id" :equipo="equipo" @editar="openEditarModal"
          @ver-detalle="verDetalle" @eliminar="confirmarEliminar" />
      </div>

      <!-- Paginación -->
      <div v-if="totalPages > 1" class="flex items-center justify-center space-x-2 mt-6">
        <button @click="previousPage" :disabled="currentPage === 1"
          class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
          Anterior
        </button>
        <span class="px-4 py-2 text-sm text-gray-700">
          Página {{ currentPage }} de {{ totalPages }}
        </span>
        <button @click="nextPage" :disabled="currentPage === totalPages"
          class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
          Siguiente
        </button>
      </div>
    </div>

    <!-- Modales -->
    <CrearEquipoModal v-if="showCrearModal" @close="showCrearModal = false" @success="handleEquipoCreado" />

    <EditarEquipoModal v-if="showEditarModal" :equipo="selectedEquipo" @close="showEditarModal = false"
      @success="handleEquipoActualizado" />

    <Loader :loading="loading" />
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useEquiposStore } from '@/stores/equipos'
import MainLayout from '@/components/common/MainLayout.vue'
import EquipoCard from '@/components/equipos/EquipoCard.vue'
import CrearEquipoModal from '@/components/equipos/CrearEquipoModal.vue'
import EditarEquipoModal from '@/components/equipos/EditarEquipoModal.vue'
import Loader from '@/components/common/Loader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Badge from '@/components/common/Badge.vue'
import api from '@/services/api'
import Swal from 'sweetalert2'

const router = useRouter()
const equiposStore = useEquiposStore()

const {
  equipos,
  equiposOperativos,
  equiposEnMantenimiento,
  equiposFueraServicio,
  loading
} = storeToRefs(equiposStore)

console.log('EquiposView cargado')
console.log('Equipos en store:', equipos.value)

const activeTab = ref('todos')

// ✅ Agregar sede_id al objeto de filtros
const filters = ref({
  search: '',
  sede_id: null,      // ✅ NUEVO
  categoria_id: null,
  estado: null
})

const sedes = ref([])       // ✅ NUEVO
const categorias = ref([])
const selectedEquipo = ref(null)
const showCrearModal = ref(false)
const showEditarModal = ref(false)
const currentPage = ref(1)
const itemsPerPage = 20

const tabs = computed(() => [
  { label: 'Todos', value: 'todos', count: equipos.value.length },
  { label: 'Operativos', value: 'operativos', count: equiposOperativos.value.length },
 // { label: 'En Mantenimiento', value: 'mantenimiento', count: equiposEnMantenimiento.value.length },
  { label: 'Fuera de Servicio', value: 'fuera_servicio', count: equiposFueraServicio.value.length }
])

// ✅ Actualizar currentEquipos para incluir filtro por sede
const currentEquipos = computed(() => {
  let data = []
  switch (activeTab.value) {
    case 'operativos':
      data = equiposOperativos.value
      break
    case 'mantenimiento':
      data = equiposEnMantenimiento.value
      break
    case 'fuera_servicio':
      data = equiposFueraServicio.value
      break
    default:
      data = equipos.value
  }

  // Aplicar filtro de búsqueda
  if (filters.value.search) {
    const search = filters.value.search.toLowerCase()
    data = data.filter(e =>
      e.nombre?.toLowerCase().includes(search) ||
      e.codigo?.toLowerCase().includes(search) ||
      e.marca?.toLowerCase().includes(search) ||
      e.modelo?.toLowerCase().includes(search)
    )
  }

  // ✅ NUEVO: Aplicar filtro por sede
  if (filters.value.sede_id) {
    data = data.filter(e => e.sede_id === filters.value.sede_id)
  }

  // Aplicar filtro por categoría
  if (filters.value.categoria_id) {
    data = data.filter(e => e.categoria_id === filters.value.categoria_id)
  }

  // Aplicar filtro por estado
  if (filters.value.estado) {
    data = data.filter(e => e.estado === filters.value.estado)
  }

  return data
})

const totalPages = computed(() => Math.ceil(currentEquipos.value.length / itemsPerPage))

const openEditarModal = (equipo) => {
  selectedEquipo.value = equipo
  showEditarModal.value = true
}

const verDetalle = (equipo) => {
  router.push({ name: 'EquipoDetalle', params: { id: equipo.id } })
}

const confirmarEliminar = async (equipo) => {
  const result = await Swal.fire({
    title: '¿Eliminar equipo?',
    text: `¿Estás seguro de eliminar el equipo "${equipo.nombre}"? Esta acción no se puede deshacer.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  })

  if (result.isConfirmed) {
    const success = await equiposStore.eliminarEquipo(equipo.id)
    if (success) {
      Swal.fire('¡Eliminado!', 'El equipo ha sido eliminado correctamente', 'success')
    }
  }
}

const handleEquipoCreado = () => {
  showCrearModal.value = false
  loadData()
}

const handleEquipoActualizado = () => {
  showEditarModal.value = false
  loadData()
}

const applyFilters = () => {
  currentPage.value = 1
  // Los filtros se aplican automáticamente por el computed
}

// ✅ Actualizar clearFilters para incluir sede_id
const clearFilters = () => {
  filters.value = {
    search: '',
    sede_id: null,      // ✅ NUEVO
    categoria_id: null,
    estado: null
  }
  currentPage.value = 1
}

const previousPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}

const loadData = async () => {
  console.log('Cargando equipos...')
  try {
    const result = await equiposStore.fetchEquipos()
    console.log('Equipos cargados:', result)
    console.log('Total equipos:', result?.length || 0)
  } catch (error) {
    console.error('Error en loadData:', error)
  }
}

// ✅ Actualizar loadCatalogos para incluir sedes
const loadCatalogos = async () => {
  console.log('Cargando catálogos...')
  try {
    const [sedesRes, categoriasRes] = await Promise.all([
      api.get('/sedes'),                              // ✅ NUEVO
      api.get('/categorias-mantenimiento?activo=true')
    ])
    
    console.log('Catálogos cargados:', { sedes: sedesRes, categorias: categoriasRes })
    
    // ✅ Sedes
    sedes.value = sedesRes.data || sedesRes
    console.log('Sedes cargadas:', sedes.value)
    
    // ✅ Categorías
    categorias.value = categoriasRes.data || categoriasRes
    console.log('Categorías cargadas:', categorias.value)
    
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
