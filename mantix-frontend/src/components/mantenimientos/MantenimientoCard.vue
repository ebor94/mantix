<!-- src/components/mantenimientos/MantenimientoCard.vue -->
<template>
  <div class="card hover:shadow-lg transition-all">
    <div class="flex items-start justify-between">
      <!-- Info Principal -->
      <div class="flex-1">
        <div class="flex items-start space-x-4">
          <!-- Icono -->
          <div class="flex-shrink-0">
            <div class="h-12 w-12 bg-primary-100 rounded-xl flex items-center justify-center">
              <svg class="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>

          <!-- Detalles -->
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">
              {{ mantenimiento.actividad?.nombre || 'Sin nombre' }}
            </h3>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div class="flex items-center text-sm text-gray-600">
                <span>{{ mantenimiento.codigo || 'N/A' }}</span>
              </div>
              <div class="flex items-center text-sm text-gray-600">
                <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>{{ mantenimiento.actividad?.sede?.nombre || 'N/A' }}</span>
              </div>

              <div class="flex items-center text-sm text-gray-600">
                <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{{ formatDate(mantenimiento.fecha_programada) }}</span>
              </div>

              <div class="flex items-center text-sm text-gray-600">
                <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    d="M9.878,18.122a3,3,0,0,0,4.244,0l3.211-3.211A1,1,0,0,0,15.919,13.5l-2.926,2.927L13,1a1,1,0,0,0-1-1h0a1,1,0,0,0-1,1l-.009,15.408L8.081,13.5a1,1,0,0,0-1.414,1.415Z" />
                  <path
                    d="M23,16h0a1,1,0,0,0-1,1v4a1,1,0,0,1-1,1H3a1,1,0,0,1-1-1V17a1,1,0,0,0-1-1H1a1,1,0,0,0-1,1v4a3,3,0,0,0,3,3H21a3,3,0,0,0,3-3V17A1,1,0,0,0,23,16Z" />
                </svg>

                <span>{{ mantenimiento.actividad?.equipo?.ubicacion_especifica || 'N/A' }}</span>
              </div>

              <div class="flex items-center text-sm text-gray-600">
                <router-link v-if="mantenimiento.actividad?.equipo?.id"
                  :to="`/equipos/${mantenimiento.actividad.equipo.id}`"
                  class="flex items-center text-sm text-gray-600 hover:text-primary-600 transition-colors group">
                  <svg class="h-4 w-4 mr-2 text-gray-400 group-hover:text-primary-600 transition-colors" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span class="group-hover:underline">{{ mantenimiento.actividad.equipo.nombre }}</span>

                  <!-- Icono de enlace externo -->
                  <svg class="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </router-link>
              </div>

              <div class="flex items-center text-sm text-gray-600">
                <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span>{{ mantenimiento.exigencias || 'N/A' }}</span>
              </div>

            </div>


            <p v-if="mantenimiento.observaciones" class="text-sm text-gray-500 mt-3">
              {{ mantenimiento.observaciones }}
            </p>
            <p v-if="mantenimiento.observaciones" class="text-sm text-gray-500 mt-3">
              {{ mantenimiento.actividad.observaciones }}
            </p>
          </div>
        </div>
      </div>

      <!-- Badges y Acciones -->
      <div class="flex flex-col items-end space-y-3 ml-4">
        <div class="flex items-center space-x-2">
          <Badge :color="getPrioridadColor(mantenimiento.prioridad)">
            {{ mantenimiento.prioridad }}
          </Badge>
          <Badge :color="getEstadoColor(mantenimiento.estado?.nombre)">
            {{ mantenimiento.estado?.nombre }}
          </Badge>
        </div>

        <div class="flex items-center space-x-2">
          <button @click="$emit('ver-detalle', mantenimiento)"
            class="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            title="Ver detalle">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>

          <button v-if="canReprogramar" @click="$emit('reprogramar', mantenimiento)"
            class="p-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors"
            title="Reprogramar">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <button v-if="canEjecutar" @click="$emit('ejecutar', mantenimiento)"
            class="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
            title="Ejecutar">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
import 'dayjs/locale/es'

dayjs.locale('es')

const props = defineProps({
  mantenimiento: {
    type: Object,
    required: true
  }
})

defineEmits(['ejecutar', 'reprogramar', 'ver-detalle'])

const canEjecutar = computed(() => {
  const estado = props.mantenimiento.estado?.nombre
  return estado === 'Programado' || estado === 'En Proceso'
})

const canReprogramar = computed(() => {
  const estado = props.mantenimiento.estado?.nombre
  return estado === 'Programado'
})

const formatDate = (date) => {
  if (!date) return 'Sin fecha'
  return dayjs(date).format('DD MMM YYYY')
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
    'Programado': 'blue',
    'En Proceso': 'orange',
    'Ejecutado': 'green',
    'Atrasado': 'red',
    'Cancelado': 'gray'
  }
  return colors[estado] || 'gray'
}
</script>