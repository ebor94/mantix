<!-- ============================================ -->
<!-- src/components/equipos/MantenimientoHistorialCard.vue -->
<!-- ============================================ -->
<template>
  <div class="border-l-4 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
       :class="getBorderColor(mantenimiento.estado.nombre)">
    <div class="flex items-start justify-between">
      <div class="flex-1 min-w-0">
        <!-- Header con código y estado -->
        <div class="flex items-center space-x-3 mb-2">
          <h4 class="text-sm font-bold text-gray-900">
            {{ mantenimiento.codigo }}
          </h4>
          <Badge :color="getEstadoBadgeColor(mantenimiento.estado.nombre)" size="sm">
            {{ mantenimiento.estado.nombre }}
          </Badge>
          <span v-if="mantenimiento.reprogramaciones > 0" 
                class="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
            {{ mantenimiento.reprogramaciones }} reprog.
          </span>
        </div>

        <!-- Nombre de la actividad -->
        <p class="text-sm font-medium text-gray-700 mb-2">
          {{ mantenimiento.actividad.nombre }}
        </p>

        <!-- Información principal -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
          <!-- Fecha programada -->
          <div>
            <span class="text-gray-500">Programado:</span>
            <p class="font-semibold text-gray-900">
              {{ formatDate(mantenimiento.fecha_programada) }}
              <span class="text-gray-600">{{ mantenimiento.hora_programada?.substring(0, 5) }}</span>
            </p>
          </div>

          <!-- Responsable -->
          <div>
            <span class="text-gray-500">Responsable:</span>
            <p class="font-semibold text-gray-900">
              {{ getResponsable(mantenimiento.actividad) }}
            </p>
          </div>

          <!-- Prioridad -->
          <div>
            <span class="text-gray-500">Prioridad:</span>
            <Badge :color="getPrioridadColor(mantenimiento.prioridad)" size="sm">
              {{ mantenimiento.prioridad }}
            </Badge>
          </div>

          <!-- Duración estimada -->
          <div>
            <span class="text-gray-500">Duración est.:</span>
            <p class="font-semibold text-gray-900">
              {{ mantenimiento.actividad.duracion_estimada_horas || 'N/A' }}h
            </p>
          </div>
        </div>

        <!-- Información de ejecución si existe -->
        <div v-if="mantenimiento.ejecucion" 
             class="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
          <div class="flex items-start space-x-2">
            <svg class="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-green-900 mb-1">Ejecutado</p>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span class="text-green-700">Fecha:</span>
                  <span class="font-medium text-green-900 ml-1">
                    {{ formatDate(mantenimiento.ejecucion.fecha_ejecucion) }}
                  </span>
                </div>
                <div>
                  <span class="text-green-700">Recibido por:</span>
                  <span class="font-medium text-green-900 ml-1">
                    {{ mantenimiento.ejecucion.nombre_recibe }}
                  </span>
                </div>
                <div>
                  <span class="text-green-700">Hora inicio:</span>
                  <span class="font-medium text-green-900 ml-1">
                    {{ mantenimiento.ejecucion.hora_inicio?.substring(0, 5) }}
                  </span>
                </div>
                <div>
                  <span class="text-green-700">Hora fin:</span>
                  <span class="font-medium text-green-900 ml-1">
                    {{ mantenimiento.ejecucion.hora_fin?.substring(0, 5) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Observaciones -->
        <div v-if="mantenimiento.observaciones" class="text-xs text-gray-600 mt-2">
          <span class="font-medium">Observaciones:</span>
          <p class="mt-1">{{ mantenimiento.observaciones }}</p>
        </div>
      </div>

      <!-- Botón de ver detalle -->
      <div class="ml-4 flex-shrink-0">
        <button
          @click="$emit('ver-detalle', mantenimiento)"
          class="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
          title="Ver detalle"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Badge from '@/components/common/Badge.vue'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

const props = defineProps({
  mantenimiento: {
    type: Object,
    required: true
  }
})

defineEmits(['ver-detalle'])

const formatDate = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY')
}

const getBorderColor = (estado) => {
  const colors = {
    'Programado': 'border-blue-500',
    'En Proceso': 'border-yellow-500',
    'Ejecutado': 'border-green-500',
    'Atrasado': 'border-red-500',
    'Reprogramado': 'border-orange-500',
    'Cancelado': 'border-gray-500'
  }
  return colors[estado] || 'border-gray-300'
}

const getEstadoBadgeColor = (estado) => {
  const colors = {
    'Programado': 'blue',
    'En Proceso': 'yellow',
    'Ejecutado': 'green',
    'Atrasado': 'red',
    'Reprogramado': 'orange',
    'Cancelado': 'gray'
  }
  return colors[estado] || 'gray'
}

const getPrioridadColor = (prioridad) => {
  const colors = {
    'baja': 'gray',
    'media': 'blue',
    'alta': 'orange',
    'critica': 'red'
  }
  return colors[prioridad] || 'gray'
}

const getResponsable = (actividad) => {
  if (actividad.responsable_tipo === 'interno') {
    return actividad.responsable_usuario?.nombre || 'Usuario interno'
  } else {
    return actividad.responsable_proveedor?.nombre || 'Proveedor externo'
  }
}
</script>