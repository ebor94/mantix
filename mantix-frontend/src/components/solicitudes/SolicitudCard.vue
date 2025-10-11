<!-- src/components/solicitudes/SolicitudCard.vue -->
<template>
  <div class="card hover:shadow-lg transition-all">
    <div class="flex items-start justify-between">
      <!-- Info Principal -->
      <div class="flex-1">
        <div class="flex items-start space-x-4">
          <!-- Icono de Prioridad -->
          <div class="flex-shrink-0">
            <div :class="[
              'h-12 w-12 rounded-xl flex items-center justify-center',
              getPrioridadBgClass(solicitud.prioridad)
            ]">
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>

          <!-- Detalles -->
          <div class="flex-1">
            <div class="flex items-start justify-between mb-2">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">
                  Solicitud #{{ solicitud.id }}
                </h3>
                <p class="text-sm text-gray-600 mt-1">
                  {{ solicitud.descripcion }}
                </p>
              </div>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div class="flex items-center text-sm text-gray-600">
                <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{{ solicitud.solicitante.nombre || 'N/A' }} {{ solicitud.solicitante.apellido || 'N/A' }}</span>
              </div>

              <div class="flex items-center text-sm text-gray-600">
                <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>{{ solicitud.sede?.nombre || 'N/A' }}</span>
              </div>

              <div class="flex items-center text-sm text-gray-600">
                <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{{ formatDate(solicitud.fecha_solicitud) }}</span>
              </div>

              <div class="flex items-center text-sm text-gray-600">
                <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>{{ solicitud.area || 'N/A' }}</span>
              </div>
            </div>

            <!-- Asignado a -->
            <div v-if="solicitud.asignado_a" class="mt-3 flex items-center text-sm">
              <span class="text-gray-600 mr-2">Asignado a:</span>
              <span class="font-medium text-gray-900">{{ solicitud.asignado_a }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Badges y Acciones -->
      <div class="flex flex-col items-end space-y-3 ml-4">
        <div class="flex items-center space-x-2">
          <Badge :color="getPrioridadColor(solicitud.prioridad)">
            {{ solicitud.prioridad }}
          </Badge>
          <Badge :color="getEstadoColor(solicitud.estado?.nombre)">
            {{ solicitud.estado?.nombre }}
          </Badge>
        </div>

        <!-- Tiempo de respuesta -->
        <div v-if="!esCerrada" class="text-xs text-gray-500">
          {{ getTiempoTranscurrido() }}
        </div>

        <!-- Botones de acción -->
        <div class="flex items-center space-x-2">
          <button
            @click="$emit('ver-detalle', solicitud)"
            class="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            title="Ver detalle"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>

          <button
            v-if="puedeAprobar"
            @click="$emit('aprobar', solicitud)"
            class="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
            title="Aprobar"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          <button
            v-if="puedeAsignar"
            @click="$emit('asignar', solicitud)"
            class="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            title="Asignar"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>

          <button
            v-if="puedeCerrar"
            @click="$emit('cerrar', solicitud)"
            class="p-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors"
            title="Cerrar"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Badge from '@/components/common/Badge.vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/es'

dayjs.extend(relativeTime)
dayjs.locale('es')

const props = defineProps({
  solicitud: {
    type: Object,
    required: true
  }
})

defineEmits(['aprobar', 'asignar', 'cerrar', 'ver-detalle'])

const puedeAprobar = computed(() => {
  const estado = props.solicitud.estado?.nombre
  return estado === 'Pendiente' || estado === 'En Revisión'
})

const puedeAsignar = computed(() => {
  const estado = props.solicitud.estado?.nombre
  return estado === 'Aprobada'
})

const puedeCerrar = computed(() => {
  const estado = props.solicitud.estado?.nombre
  return estado === 'Asignada' || estado === 'En Proceso'
})

const esCerrada = computed(() => {
  const estado = props.solicitud.estado?.nombre
  return estado === 'Cerrada' || estado === 'Rechazada'
})

const formatDate = (date) => {
  if (!date) return 'Sin fecha'
  return dayjs(date).format('DD MMM YYYY')
}

const getTiempoTranscurrido = () => {
  if (!props.solicitud.fecha_solicitud) return ''
  return dayjs(props.solicitud.fecha_solicitud).fromNow()
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

const getPrioridadBgClass = (prioridad) => {
  const classes = {
    baja: 'bg-green-500',
    media: 'bg-yellow-500',
    alta: 'bg-orange-500',
    critica: 'bg-red-500'
  }
  return classes[prioridad?.toLowerCase()] || 'bg-gray-500'
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
</script>