<!-- ============================================ -->
<!-- src/views/PlanesView.vue -->
<!-- ============================================ -->
<template>
  <MainLayout>
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Planes de Mantenimiento</h1>
          <p class="text-gray-500 mt-1">Gestiona los planes anuales de mantenimiento</p>
        </div>
        
        <button
          @click="mostrarModalCrear = true"
          class="btn-primary"
        >
          <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Plan
        </button>
      </div>

      <!-- Filtros -->
      <div class="card">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <!-- Buscar -->
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <input
              v-model="filtros.buscar"
              type="text"
              placeholder="Buscar por nombre o descripción..."
              class="input"
              @input="debounceSearch"
            />
          </div>

          <!-- Año -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Año</label>
            <select v-model="filtros.anio" @change="aplicarFiltros" class="input">
              <option :value="null">Todos los años</option>
              <option v-for="anio in aniosDisponibles" :key="anio" :value="anio">
                {{ anio }}
              </option>
            </select>
          </div>

          <!-- Estado -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select v-model="filtros.activo" @change="aplicarFiltros" class="input">
              <option :value="null">Todos</option>
              <option :value="true">Activos</option>
              <option :value="false">Inactivos</option>
            </select>
          </div>
        </div>

        <!-- Botones de acción -->
        <div class="flex items-center justify-between mt-4 pt-4 border-t">
          <button
            @click="limpiarFiltros"
            class="btn-secondary text-sm"
          >
            Limpiar filtros
          </button>

          <div class="text-sm text-gray-600">
            {{ pagination.total }} plan(es) encontrado(s)
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>

      <!-- Lista de planes -->
      <div v-else-if="planes.length > 0" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlanCard
          v-for="plan in planes"
          :key="plan.id"
          :plan="plan"
          @editar="editarPlan"
          @eliminar="confirmarEliminar"
          @duplicar="duplicarPlan"
          @toggle="toggleActivo"
          @ver="verDetalle"
        />
      </div>

      <!-- Empty state -->
      <div v-else class="text-center py-12">
        <EmptyState
          title="No hay planes"
          description="No se encontraron planes de mantenimiento"
          icon="clipboard-list"
        />
        <button
          @click="mostrarModalCrear = true"
          class="btn-primary mt-4"
        >
          Crear primer plan
        </button>
      </div>

      <!-- Paginación -->
      <Pagination
        v-if="pagination.totalPages > 1"
        :current-page="pagination.page"
        :total-pages="pagination.totalPages"
        :total="pagination.total"
        @change="cambiarPagina"
      />
    </div>

    <!-- Modal Crear/Editar -->
    <CrearPlanModal
      v-if="mostrarModalCrear"
      :plan="planEditar"
      @close="cerrarModal"
      @success="handleSuccess"
    />

    <!-- Modal Confirmar Eliminación
    <ConfirmModal
      v-if="mostrarConfirmEliminar"
      title="Eliminar Plan"
      :message="`¿Estás seguro de que deseas eliminar el plan '${planEliminar?.nombre}'?`"
      confirm-text="Eliminar"
      confirm-color="danger"
      @confirm="eliminarPlan"
      @cancel="mostrarConfirmEliminar = false"
    /> -->
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlanesStore } from '@/stores/planes'
import { storeToRefs } from 'pinia'
import MainLayout from '@/components/common/MainLayout.vue'
import PlanCard from '@/components/planes/PlanCard.vue'
import CrearPlanModal from '@/components/planes/CrearPlanModal.vue'
import EmptyState from '@/components/common/EmptyState.vue'
//import ConfirmModal from '@/components/common/ConfirmModal.vue'
import Pagination from '@/components/common/Pagination.vue'

const router = useRouter()
const planesStore = usePlanesStore()

const { planes, loading, pagination, filtros } = storeToRefs(planesStore)

const mostrarModalCrear = ref(false)
const planEditar = ref(null)
const mostrarConfirmEliminar = ref(false)
const planEliminar = ref(null)

let searchTimeout = null

// Años disponibles (últimos 5 años + próximos 2)
const aniosDisponibles = computed(() => {
  const anioActual = new Date().getFullYear()
  const anios = []
  for (let i = anioActual - 5; i <= anioActual + 2; i++) {
    anios.push(i)
  }
  return anios.reverse()
})

// Métodos
const aplicarFiltros = () => {
  planesStore.aplicarFiltros(filtros.value)
}

const limpiarFiltros = () => {
  planesStore.limpiarFiltros()
}

const debounceSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    aplicarFiltros()
  }, 500)
}

const cambiarPagina = (page) => {
  planesStore.cambiarPagina(page)
}

const editarPlan = (plan) => {
  planEditar.value = plan
  mostrarModalCrear.value = true
}

const confirmarEliminar = (plan) => {
  planEliminar.value = plan
  mostrarConfirmEliminar.value = true
}

const eliminarPlan = async () => {
  try {
    await planesStore.eliminarPlan(planEliminar.value.id)
    mostrarConfirmEliminar.value = false
    planEliminar.value = null
  } catch (error) {
    // Error ya manejado en el store
  }
}

const duplicarPlan = async (plan) => {
  const anioActual = new Date().getFullYear()
  const datos = {
    nombre: `${plan.nombre} (Copia)`,
    anio: anioActual,
    fecha_inicio: `${anioActual}-01-01`,
    fecha_fin: `${anioActual}-12-31`
  }
  
  try {
    await planesStore.duplicarPlan(plan.id, datos)
  } catch (error) {
    // Error ya manejado en el store
  }
}

const toggleActivo = async (plan) => {
  try {
    await planesStore.toggleActivo(plan.id)
  } catch (error) {
    // Error ya manejado en el store
  }
}

const verDetalle = (plan) => {
  router.push({ name: 'PlanDetalle', params: { id: plan.id } })
}

const cerrarModal = () => {
  mostrarModalCrear.value = false
  planEditar.value = null
}

const handleSuccess = () => {
  cerrarModal()
  planesStore.fetchPlanes()
}

onMounted(() => {
  planesStore.fetchPlanes()
})
</script>