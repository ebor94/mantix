<!-- src/components/equipos/EquipoCard.vue -->
<template>
  <div class="card hover:shadow-xl transition-all cursor-pointer" @click="$emit('ver-detalle', equipo)">
    <!-- Header con Estado -->
    <div class="flex items-start justify-between mb-4">
      <div class="flex-1">
        <div class="flex items-center space-x-2 mb-2">
          <span class="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {{ equipo.codigo }}
          </span>
          <Badge :color="getEstadoColor(equipo.estado)">
            {{ formatEstado(equipo.estado) }}
          </Badge>
        </div>
        <h3 class="text-lg font-bold text-gray-900 truncate">
          {{ equipo.nombre }}
        </h3>
      </div>
      
      <!-- Dropdown de Acciones -->
      <div class="relative" @click.stop>
        <button
          @click="showMenu = !showMenu"
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
        
        <div
          v-if="showMenu"
          v-click-outside="() => showMenu = false"
          class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10"
        >
          <button
            @click="handleVerDetalle"
            class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"
          >
            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Ver Detalle
          </button>
          <button
            @click="handleEditar"
            class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"
          >
            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar
          </button>
          <button
            @click="handleEliminar"
            class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center rounded-b-lg"
          >
            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eliminar
          </button>
        </div>
      </div>
    </div>

    <!-- Imagen del Equipo -->
    <div class="mb-4 bg-gray-100 rounded-lg h-40 flex items-center justify-center overflow-hidden">
      <img
        v-if="equipo.imagen"
        :src="equipo.imagen"
        :alt="equipo.nombre"
        class="w-full h-full object-cover"
      />
      <div v-else class="text-gray-400">
        <svg class="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
    </div>

    <!-- Información Principal -->
    <div class="space-y-3">
      <!-- Marca y Modelo -->
      <div class="flex items-center text-sm">
        <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span class="text-gray-600">
          <span class="font-semibold text-gray-900">{{ equipo.marca || 'N/A' }}</span>
          {{ equipo.modelo ? `- ${equipo.modelo}` : '' }}
        </span>
      </div>

      <!-- Categoría -->
      <div class="flex items-center text-sm">
        <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <span class="text-gray-600">{{ equipo.categoria?.nombre || 'Sin categoría' }}</span>
      </div>

      <!-- Sede -->
      <div class="flex items-center text-sm">
        <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <span class="text-gray-600">{{ equipo.sede?.nombre || 'Sin sede' }}</span>
      </div>

      <!-- Ubicación -->
      <div v-if="equipo.ubicacion_especifica" class="flex items-start text-sm">
        <svg class="h-4 w-4 mr-2 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span class="text-gray-600 line-clamp-2">{{ equipo.ubicacion_especifica }}</span>
      </div>

      <!-- Responsable -->
      <div v-if="equipo.responsable" class="flex items-center text-sm">
        <svg class="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span class="text-gray-600">
          {{ equipo.responsable.nombre }} {{ equipo.responsable.apellido }}
        </span>
      </div>
    </div>

    <!-- Footer con Fecha de Instalación -->
    <div v-if="equipo.fecha_instalacion" class="mt-4 pt-4 border-t border-gray-200">
      <div class="flex items-center justify-between text-xs text-gray-500">
        <span>Instalado:</span>
        <span class="font-medium">{{ formatDate(equipo.fecha_instalacion) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Badge from '@/components/common/Badge.vue'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

const props = defineProps({
  equipo: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['editar', 'ver-detalle', 'eliminar'])

const showMenu = ref(false)

const formatDate = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD MMM YYYY')
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

const handleVerDetalle = () => {
  showMenu.value = false
  emit('ver-detalle', props.equipo)
}

const handleEditar = () => {
  showMenu.value = false
  emit('editar', props.equipo)
}

const handleEliminar = () => {
  showMenu.value = false
  emit('eliminar', props.equipo)
}

// Directiva personalizada para cerrar el menú al hacer clic fuera
const vClickOutside = {
  mounted(el, binding) {
    el.clickOutsideEvent = (event) => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value()
      }
    }
    document.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el) {
    document.removeEventListener('click', el.clickOutsideEvent)
  }
}
</script>