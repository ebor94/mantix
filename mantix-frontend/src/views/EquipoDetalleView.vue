<!-- src/views/EquipoDetalleView.vue -->
<template>
  <MainLayout>
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        <p class="text-gray-500 mt-4">Cargando equipo...</p>
      </div>
    </div>

    <div v-else-if="!equipo" class="text-center py-12">
      <EmptyState
        title="Equipo no encontrado"
        description="El equipo que buscas no existe o fue eliminado"
        icon="cube"
      />
      <router-link to="/equipos" class="btn-primary mt-4">
        Volver a Equipos
      </router-link>
    </div>

    <div v-else class="space-y-6">
      <!-- Header con Breadcrumb -->
      <div class="flex items-center justify-between">
        <div>
          <nav class="flex items-center space-x-2 text-sm text-gray-500 mb-2">
            <router-link to="/equipos" class="hover:text-primary-600">Equipos</router-link>
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-gray-900">{{ equipo.codigo }}</span>
          </nav>
          <h1 class="text-3xl font-bold text-gray-900">{{ equipo.nombre }}</h1>
          <p class="text-gray-500 mt-1">{{ equipo.codigo }}</p>
        </div>
        
        <div class="flex items-center space-x-3">
          <Badge :color="getEstadoColor(equipo.estado)" size="lg">
            {{ formatEstado(equipo.estado) }}
          </Badge>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Columna Principal -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Información General -->
          <div class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Información General
            </h2>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-600">Código</label>
                <p class="text-gray-900 font-semibold mt-1">{{ equipo.codigo }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Categoría</label>
                <p class="text-gray-900 font-semibold mt-1">{{ equipo.categoria?.nombre || 'N/A' }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Sede</label>
                <p class="text-gray-900 font-semibold mt-1">{{ equipo.sede?.nombre || 'N/A' }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Ubicación</label>
                <p class="text-gray-900 font-semibold mt-1">{{ equipo.ubicacion_especifica || 'N/A' }}</p>
              </div>
            </div>
          </div>

          <!-- Especificaciones Técnicas -->
          <div class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Especificaciones Técnicas
            </h2>
            
            <div class="grid grid-cols-3 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-600">Marca</label>
                <p class="text-gray-900 font-semibold mt-1">{{ equipo.marca || 'N/A' }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Modelo</label>
                <p class="text-gray-900 font-semibold mt-1">{{ equipo.modelo || 'N/A' }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Número de Serie</label>
                <p class="text-gray-900 font-semibold mt-1">{{ equipo.numero_serie || 'N/A' }}</p>
              </div>
            </div>
          </div>

          <!-- Información Comercial -->
          <div class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Información Comercial
            </h2>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-600">Fecha de Compra</label>
                <p class="text-gray-900 font-semibold mt-1">{{ formatDate(equipo.fecha_compra) }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Fecha de Instalación</label>
                <p class="text-gray-900 font-semibold mt-1">{{ formatDate(equipo.fecha_instalacion) }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Valor de Compra</label>
                <p class="text-gray-900 font-semibold mt-1">{{ formatCurrency(equipo.valor_compra) }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Vida Útil</label>
                <p class="text-gray-900 font-semibold mt-1">{{ equipo.vida_util_anos ? `${equipo.vida_util_anos} años` : 'N/A' }}</p>
              </div>
            </div>
          </div>

          <!-- Observaciones -->
          <div v-if="equipo.observaciones" class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Observaciones
            </h2>
            <p class="text-gray-700 leading-relaxed">{{ equipo.observaciones }}</p>
          </div>

          <!-- Historial de Mantenimientos -->
          <div class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Historial de Mantenimientos
            </h2>
            
            <div class="text-center py-8 text-gray-500">
              <p class="text-sm">Próximamente: Historial completo de mantenimientos</p>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="lg:col-span-1 space-y-6">
          <!-- Acciones Rápidas -->
          <div class="card">
            <h3 class="text-lg font-bold text-gray-900 mb-4">Acciones</h3>
            <div class="space-y-3">
              <button
                @click="openEditarModal"
                class="w-full btn-primary"
              >
                <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar Equipo
              </button>

              <button
                @click="$router.push('/equipos')"
                class="w-full btn-secondary"
              >
                <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Volver
              </button>
            </div>
          </div>

          <!-- Información Adicional -->
          <div class="card">
            <h3 class="text-lg font-bold text-gray-900 mb-4">Detalles</h3>
            <div class="space-y-3">
              <div v-if="equipo.responsable">
                <label class="text-xs font-medium text-gray-600">Responsable</label>
                <p class="text-sm font-semibold text-gray-900">
                  {{ equipo.responsable.nombre }} {{ equipo.responsable.apellido }}
                </p>
              </div>

              <div v-if="equipo.created_at">
                <label class="text-xs font-medium text-gray-600">Creado el</label>
                <p class="text-sm text-gray-700">{{ formatDateTime(equipo.created_at) }}</p>
              </div>

              <div v-if="equipo.updated_at">
                <label class="text-xs font-medium text-gray-600">Última actualización</label>
                <p class="text-sm text-gray-700">{{ formatDateTime(equipo.updated_at) }}</p>
              </div>
            </div>
          </div>

          <!-- Estadísticas -->
          <div class="card bg-gradient-to-br from-primary-50 to-primary-100">
            <h3 class="text-lg font-bold text-gray-900 mb-4">Estadísticas</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Mantenimientos</span>
                <span class="text-lg font-bold text-primary-600">0</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Último mantenimiento</span>
                <span class="text-sm font-medium text-gray-900">N/A</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Próximo mantenimiento</span>
                <span class="text-sm font-medium text-gray-900">N/A</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Editar -->
    <EditarEquipoModal
      v-if="showEditarModal"
      :equipo="equipo"
      @close="showEditarModal = false"
      @success="handleSuccess"
    />
  </MainLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEquiposStore } from '@/stores/equipos'
import { storeToRefs } from 'pinia'
import MainLayout from '@/components/common/MainLayout.vue'
import Badge from '@/components/common/Badge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import EditarEquipoModal from '@/components/equipos/EditarEquipoModal.vue'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

const route = useRoute()
const router = useRouter()
const equiposStore = useEquiposStore()

const { equipoActual: equipo, loading } = storeToRefs(equiposStore)

const showEditarModal = ref(false)

const formatDate = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY')
}

const formatDateTime = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY HH:mm')
}

const formatCurrency = (value) => {
  if (!value) return 'N/A'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(value)
}

const formatEstado = (estado) => {
  const estados = {
    operativo: 'Operativo',
    fuera_servicio: 'Fuera de Servicio',
    en_mantenimiento: 'En Mantenimiento',
    dado_baja: 'Dado de Baja'
  }
  return estados[estado] || estado
}

const getEstadoColor = (estado) => {
  const colors = {
    operativo: 'green',
    en_mantenimiento: 'orange',
    fuera_servicio: 'red',
    dado_baja: 'gray'
  }
  return colors[estado] || 'gray'
}

const openEditarModal = () => {
  showEditarModal.value = true
}

const handleSuccess = async () => {
  showEditarModal.value = false
  await loadEquipo()
}

const loadEquipo = async () => {
  const id = route.params.id
  console.log('Cargando equipo con ID:', id)
  const result = await equiposStore.fetchEquipo(id)
  console.log('Resultado de fetchEquipo:', result)
  console.log('equipoActual en store:', equipo.value)
}

onMounted(() => {
  console.log('EquipoDetalleView montado')
  console.log('Parámetro ID:', route.params.id)
  loadEquipo()
})
</script>