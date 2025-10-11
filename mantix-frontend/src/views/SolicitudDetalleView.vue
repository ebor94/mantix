<!-- src/views/SolicitudDetalleView.vue -->
<template>
  <MainLayout>
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        <p class="text-gray-500 mt-4">Cargando solicitud...</p>
      </div>
    </div>

    <div v-else-if="!solicitud" class="text-center py-12">
      <EmptyState
        title="Solicitud no encontrada"
        description="La solicitud que buscas no existe o fue eliminada"
        icon="document"
      />
      <router-link to="/solicitudes" class="btn-primary mt-4">
        Volver a Solicitudes
      </router-link>
    </div>

    <div v-else class="space-y-6">
      <!-- Header con Breadcrumb -->
      <div class="flex items-center justify-between">
        <div>
          <nav class="flex items-center space-x-2 text-sm text-gray-500 mb-2">
            <router-link to="/solicitudes" class="hover:text-primary-600">Solicitudes</router-link>
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-gray-900">Solicitud #{{ solicitud.id }}</span>
          </nav>
          <h1 class="text-3xl font-bold text-gray-900">Solicitud R-275 #{{ solicitud.id }}</h1>
        </div>
        
        <div class="flex items-center space-x-3">
          <Badge :color="getPrioridadColor(solicitud.prioridad)" size="lg">
            {{ solicitud.prioridad }}
          </Badge>
          <Badge :color="getEstadoColor(solicitud.estado?.nombre)" size="lg">
            {{ solicitud.estado?.nombre }}
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
                <label class="text-sm font-medium text-gray-600">Solicitante</label>
                <p class="text-gray-900 font-semibold mt-1">{{ solicitud.solicitante }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Área</label>
                <p class="text-gray-900 font-semibold mt-1">{{ solicitud.area }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Sede</label>
                <p class="text-gray-900 font-semibold mt-1">{{ solicitud.sede?.nombre }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Fecha de Solicitud</label>
                <p class="text-gray-900 font-semibold mt-1">{{ formatDate(solicitud.fecha_solicitud) }}</p>
              </div>
              
              <div v-if="solicitud.ubicacion" class="col-span-2">
                <label class="text-sm font-medium text-gray-600">Ubicación Específica</label>
                <p class="text-gray-900 font-semibold mt-1">{{ solicitud.ubicacion }}</p>
              </div>
            </div>
          </div>

          <!-- Descripción del Problema -->
          <div class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Descripción del Problema
            </h2>
            <p class="text-gray-700 leading-relaxed">{{ solicitud.descripcion }}</p>
          </div>

          <!-- Evidencias Fotográficas -->
          <div v-if="solicitud.evidencias && solicitud.evidencias.length > 0" class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Evidencias Fotográficas
            </h2>
            <div class="grid grid-cols-3 gap-4">
              <div
                v-for="(evidencia, index) in solicitud.evidencias"
                :key="index"
                class="relative group cursor-pointer"
                @click="openImageModal(evidencia)"
              >
                <img
                  :src="evidencia.url"
                  :alt="`Evidencia ${index + 1}`"
                  class="w-full h-32 object-cover rounded-lg"
                />
                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                  <svg class="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <!-- Trabajo Realizado (si está cerrada) -->
          <div v-if="solicitud.trabajo_realizado" class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Trabajo Realizado
            </h2>
            <p class="text-gray-700 leading-relaxed">{{ solicitud.trabajo_realizado }}</p>
            
            <div v-if="solicitud.tiempo_empleado" class="mt-4 flex items-center text-sm text-gray-600">
              <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Tiempo empleado: <span class="font-semibold ml-1">{{ solicitud.tiempo_empleado }} minutos</span>
            </div>

            <!-- Calificación -->
            <div v-if="solicitud.calificacion" class="mt-4 pt-4 border-t border-gray-200">
              <label class="text-sm font-medium text-gray-600">Calificación del Servicio</label>
              <div class="flex items-center mt-2">
                <div class="flex items-center space-x-1">
                  <svg
                    v-for="star in 5"
                    :key="star"
                    :class="[
                      'h-6 w-6',
                      star <= solicitud.calificacion ? 'text-yellow-400' : 'text-gray-300'
                    ]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                <span class="ml-2 text-sm text-gray-600">{{ solicitud.calificacion }} de 5</span>
              </div>
            </div>
          </div>

          <!-- Timeline de Estados -->
          <div class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Historial de Estados
            </h2>
            
            <div class="space-y-4">
              <div
                v-for="(historial, index) in solicitud.historial || []"
                :key="index"
                class="flex items-start space-x-4"
              >
                <div class="flex-shrink-0">
                  <div :class="[
                    'h-10 w-10 rounded-full flex items-center justify-center',
                    getEstadoBgClass(historial.estado)
                  ]">
                    <svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <div class="flex-1">
                  <p class="font-semibold text-gray-900">{{ historial.estado }}</p>
                  <p class="text-sm text-gray-600">{{ formatDateTime(historial.fecha) }}</p>
                  <p v-if="historial.usuario" class="text-xs text-gray-500 mt-1">Por: {{ historial.usuario }}</p>
                  <p v-if="historial.observaciones" class="text-sm text-gray-700 mt-2">{{ historial.observaciones }}</p>
                </div>
              </div>
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
                v-if="puedeAprobar"
                @click="openAprobarModal"
                class="w-full btn-primary bg-green-600 hover:bg-green-700"
              >
                <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Aprobar Solicitud
              </button>

              <button
                v-if="puedeAsignar"
                @click="openAsignarModal"
                class="w-full btn-primary"
              >
                <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Asignar Técnico
              </button>

              <button
                v-if="puedeCerrar"
                @click="openCerrarModal"
                class="w-full btn-primary bg-orange-600 hover:bg-orange-700"
              >
                <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                Cerrar Solicitud
              </button>

              <button
                @click="$router.push('/solicitudes')"
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
              <div v-if="solicitud.asignado_a">
                <label class="text-xs font-medium text-gray-600">Asignado a</label>
                <p class="text-sm font-semibold text-gray-900">{{ solicitud.asignado_a }}</p>
              </div>

              <div v-if="solicitud.fecha_atencion">
                <label class="text-xs font-medium text-gray-600">Fecha de Atención</label>
                <p class="text-sm font-semibold text-gray-900">{{ formatDate(solicitud.fecha_atencion) }}</p>
              </div>

              <div>
                <label class="text-xs font-medium text-gray-600">Tiempo transcurrido</label>
                <p class="text-sm font-semibold text-gray-900">{{ getTiempoTranscurrido() }}</p>
              </div>

              <div v-if="solicitud.created_at">
                <label class="text-xs font-medium text-gray-600">Creada el</label>
                <p class="text-sm text-gray-700">{{ formatDateTime(solicitud.created_at) }}</p>
              </div>

              <div v-if="solicitud.updated_at">
                <label class="text-xs font-medium text-gray-600">Última actualización</label>
                <p class="text-sm text-gray-700">{{ formatDateTime(solicitud.updated_at) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modales -->
    <AprobarSolicitudModal
      v-if="showAprobarModal"
      :solicitud="solicitud"
      @close="showAprobarModal = false"
      @success="handleSuccess"
    />

    <AsignarSolicitudModal
      v-if="showAsignarModal"
      :solicitud="solicitud"
      @close="showAsignarModal = false"
      @success="handleSuccess"
    />

    <CerrarSolicitudModal
      v-if="showCerrarModal"
      :solicitud="solicitud"
      @close="showCerrarModal = false"
      @success="handleSuccess"
    />
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSolicitudesStore } from '@/stores/solicitudes'
import { storeToRefs } from 'pinia'
import MainLayout from '@/components/common/MainLayout.vue'
import Badge from '@/components/common/Badge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AprobarSolicitudModal from '@/components/solicitudes/AprobarSolicitudModal.vue'
import AsignarSolicitudModal from '@/components/solicitudes/AsignarSolicitudModal.vue'
import CerrarSolicitudModal from '@/components/solicitudes/CerrarSolicitudModal.vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/es'

dayjs.extend(relativeTime)
dayjs.locale('es')

const route = useRoute()
const router = useRouter()
const solicitudesStore = useSolicitudesStore()

const { solicitudActual: solicitud, loading } = storeToRefs(solicitudesStore)

const showAprobarModal = ref(false)
const showAsignarModal = ref(false)
const showCerrarModal = ref(false)

const puedeAprobar = computed(() => {
  const estado = solicitud.value?.estado?.nombre
  return estado === 'Pendiente' || estado === 'En Revisión'
})

const puedeAsignar = computed(() => {
  const estado = solicitud.value?.estado?.nombre
  return estado === 'Aprobada'
})

const puedeCerrar = computed(() => {
  const estado = solicitud.value?.estado?.nombre
  return estado === 'Asignada' || estado === 'En Proceso'
})

const formatDate = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY')
}

const formatDateTime = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY HH:mm')
}

const getTiempoTranscurrido = () => {
  if (!solicitud.value?.fecha_solicitud) return 'N/A'
  return dayjs(solicitud.value.fecha_solicitud).fromNow()
}

const getPrioridadColor = (prioridad) => {
  const colors = {
    baja: 'green',
    media: 'yellow',
    alta: 'orange',
    critica: 'red'
  }
  return colors[prioridad?.toLowerCase()] || 'gray'
}

const getEstadoColor = (estado) => {
  const colors = {
    'Pendiente': 'blue',
    'En Revisión': 'yellow',
    'Aprobada': 'green',
    'Rechazada': 'red',
    'Asignada': 'purple',
    'En Proceso': 'orange',
    'Cerrada': 'gray'
  }
  return colors[estado] || 'gray'
}

const getEstadoBgClass = (estado) => {
  const classes = {
    'Pendiente': 'bg-blue-500',
    'En Revisión': 'bg-yellow-500',
    'Aprobada': 'bg-green-500',
    'Rechazada': 'bg-red-500',
    'Asignada': 'bg-purple-500',
    'En Proceso': 'bg-orange-500',
    'Cerrada': 'bg-gray-500'
  }
  return classes[estado] || 'bg-gray-500'
}

const openAprobarModal = () => {
  showAprobarModal.value = true
}

const openAsignarModal = () => {
  showAsignarModal.value = true
}

const openCerrarModal = () => {
  showCerrarModal.value = true
}

const openImageModal = (evidencia) => {
  window.open(evidencia.url, '_blank')
}

const handleSuccess = async () => {
  showAprobarModal.value = false
  showAsignarModal.value = false
  showCerrarModal.value = false
  await loadSolicitud()
}

const loadSolicitud = async () => {
  const id = route.params.id
  await solicitudesStore.fetchSolicitud(id)
}

onMounted(() => {
  loadSolicitud()
})
</script>