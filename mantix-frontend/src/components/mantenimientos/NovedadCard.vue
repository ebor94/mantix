<!-- src/components/mantenimientos/NovedadCard.vue -->
<template>
  <div class="border-l-4 rounded-lg p-4 hover:shadow-md transition-shadow"
       :class="getBorderColor(novedad.tipo_novedad)">
    <div class="flex items-start justify-between">
      <div class="flex items-start space-x-3 flex-1">
        <!-- Icono según tipo -->
        <div class="flex-shrink-0">
          <div :class="getIconBgColor(novedad.tipo_novedad)" 
               class="h-10 w-10 rounded-full flex items-center justify-center">
            <component :is="getIcon(novedad.tipo_novedad)" 
                       class="h-5 w-5" 
                       :class="getIconColor(novedad.tipo_novedad)" />
          </div>
        </div>

        <!-- Contenido -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center space-x-2">
            <p class="text-sm font-semibold text-gray-900">
              {{ getTipoLabel(novedad.tipo_novedad) }}
            </p>
            <Badge 
              v-if="novedad.es_visible_proveedor" 
              color="blue" 
              size="sm"
            >
              Visible proveedor
            </Badge>
          </div>
          
          <p class="text-sm text-gray-700 mt-1">{{ novedad.descripcion }}</p>
          
          <!-- Información adicional según tipo -->
          <div v-if="novedad.motivo" class="mt-2">
            <span class="text-xs font-medium text-gray-600">Motivo:</span>
            <span class="text-xs text-gray-700 ml-1">{{ novedad.motivo }}</span>
          </div>

          <!-- Cambios de fecha (reprogramación) -->
          <div v-if="novedad.tipo_novedad === 'reprogramacion' && novedad.fecha_nueva" 
               class="mt-2 flex items-center space-x-2 text-xs">
            <span class="text-gray-600">
              {{ formatDate(novedad.fecha_anterior) }}
              {{ novedad.hora_anterior }}
            </span>
            <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span class="text-primary-600 font-medium">
              {{ formatDate(novedad.fecha_nueva) }}
              {{ novedad.hora_nueva }}
            </span>
          </div>

          <!-- Cambios de estado -->
          <div v-if="novedad.tipo_novedad === 'cambio_estado'" 
               class="mt-2 flex items-center space-x-2">
            <Badge v-if="novedad.estado_anterior" size="sm" :color="getEstadoColor(novedad.estado_anterior.nombre)">
              {{ novedad.estado_anterior.nombre }}
            </Badge>
            <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <Badge v-if="novedad.estado_nuevo" size="sm" :color="getEstadoColor(novedad.estado_nuevo.nombre)">
              {{ novedad.estado_nuevo.nombre }}
            </Badge>
          </div>

          <!-- Adjuntos -->
          <div v-if="novedad.adjuntos && novedad.adjuntos.length > 0" class="mt-2">
            <div class="flex items-center space-x-2">
              <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span class="text-xs text-gray-600">{{ novedad.adjuntos.length }} adjunto(s)</span>
            </div>
          </div>

          <!-- Usuario y fecha -->
          <div class="mt-3 flex items-center justify-between text-xs text-gray-500">
            <div class="flex items-center space-x-1">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>{{ novedad.usuario_registro?.nombre }}</span>
            </div>
            <span>{{ formatDateTime(novedad.created_at) }}</span>
          </div>
        </div>
      </div>

      <!-- Acciones -->
      <div class="flex items-center space-x-2 ml-4">
        <button 
          v-if="puedeEditar"
          @click="$emit('editar', novedad)"
          class="p-1 text-gray-400 hover:text-primary-600 transition-colors"
          title="Editar"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        
        <button 
          v-if="puedeEliminar"
          @click="$emit('eliminar', novedad)"
          class="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="Eliminar"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import Badge from '@/components/common/Badge.vue'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

const props = defineProps({
  novedad: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['editar', 'eliminar'])

const authStore = useAuthStore()

const puedeEditar = computed(() => {
  // Solo el usuario que creó la novedad o un admin puede editarla
  return authStore.user?.id === props.novedad.usuario_registro_id || 
         authStore.user?.rol?.nombre === 'admin' ||
         authStore.user?.es_super_admin
})

const puedeEliminar = computed(() => {
  // Solo admins pueden eliminar
  return authStore.user?.rol?.nombre === 'admin' || authStore.user?.es_super_admin
})

const getTipoLabel = (tipo) => {
  const labels = {
    'reprogramacion': 'Reprogramación',
    'comunicacion_proveedor': 'Comunicación con Proveedor',
    'cambio_estado': 'Cambio de Estado',
    'suspension': 'Suspensión',
    'observacion_general': 'Observación',
    'cambio_prioridad': 'Cambio de Prioridad',
    'asignacion_personal': 'Asignación de Personal',
    'solicitud_requisitos': 'Solicitud de Requisitos',
    'aprobacion_requisitos': 'Aprobación de Requisitos',
    'rechazo_requisitos': 'Rechazo de Requisitos',
    'inicio_trabajo': 'Inicio de Trabajo',
    'finalizacion_trabajo': 'Finalización de Trabajo',
    'otro': 'Otro'
  }
  return labels[tipo] || tipo
}

const getBorderColor = (tipo) => {
  const colors = {
    'reprogramacion': 'border-yellow-500 bg-yellow-50',
    'comunicacion_proveedor': 'border-blue-500 bg-blue-50',
    'cambio_estado': 'border-purple-500 bg-purple-50',
    'suspension': 'border-red-500 bg-red-50',
    'observacion_general': 'border-gray-500 bg-gray-50',
    'cambio_prioridad': 'border-orange-500 bg-orange-50',
    'solicitud_requisitos': 'border-indigo-500 bg-indigo-50',
    'aprobacion_requisitos': 'border-green-500 bg-green-50',
    'rechazo_requisitos': 'border-red-500 bg-red-50',
    'inicio_trabajo': 'border-teal-500 bg-teal-50',
    'finalizacion_trabajo': 'border-green-500 bg-green-50'
  }
  return colors[tipo] || 'border-gray-300 bg-white'
}

const getIconBgColor = (tipo) => {
  const colors = {
    'reprogramacion': 'bg-yellow-100',
    'comunicacion_proveedor': 'bg-blue-100',
    'cambio_estado': 'bg-purple-100',
    'suspension': 'bg-red-100',
    'observacion_general': 'bg-gray-100',
    'cambio_prioridad': 'bg-orange-100',
    'solicitud_requisitos': 'bg-indigo-100',
    'aprobacion_requisitos': 'bg-green-100',
    'rechazo_requisitos': 'bg-red-100',
    'inicio_trabajo': 'bg-teal-100',
    'finalizacion_trabajo': 'bg-green-100'
  }
  return colors[tipo] || 'bg-gray-100'
}

const getIconColor = (tipo) => {
  const colors = {
    'reprogramacion': 'text-yellow-600',
    'comunicacion_proveedor': 'text-blue-600',
    'cambio_estado': 'text-purple-600',
    'suspension': 'text-red-600',
    'observacion_general': 'text-gray-600',
    'cambio_prioridad': 'text-orange-600',
    'solicitud_requisitos': 'text-indigo-600',
    'aprobacion_requisitos': 'text-green-600',
    'rechazo_requisitos': 'text-red-600',
    'inicio_trabajo': 'text-teal-600',
    'finalizacion_trabajo': 'text-green-600'
  }
  return colors[tipo] || 'text-gray-600'
}

const getIcon = (tipo) => {
  // Retornar el nombre del componente de icono
  const icons = {
    'reprogramacion': 'IconCalendar',
    'comunicacion_proveedor': 'IconMail',
    'cambio_estado': 'IconRefresh',
    'suspension': 'IconPause',
    'observacion_general': 'IconNote',
    'cambio_prioridad': 'IconFlag',
    'solicitud_requisitos': 'IconFile',
    'aprobacion_requisitos': 'IconCheck',
    'rechazo_requisitos': 'IconX',
    'inicio_trabajo': 'IconPlay',
    'finalizacion_trabajo': 'IconCheckCircle'
  }
  return icons[tipo] || 'IconCircle'
}

const getEstadoColor = (estado) => {
  const colors = {
    'Programado': 'blue',
    'En Proceso': 'yellow',
    'Ejecutado': 'green',
    'Atrasado': 'red',
    'Cancelado': 'gray'
  }
  return colors[estado] || 'gray'
}

const formatDate = (date) => {
  if (!date) return ''
  return dayjs(date).format('DD/MM/YYYY')
}

const formatDateTime = (date) => {
  if (!date) return ''
  return dayjs(date).format('DD/MM/YYYY HH:mm')
}
</script>