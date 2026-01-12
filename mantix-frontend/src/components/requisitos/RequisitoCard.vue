<!-- ============================================ -->
<!-- src/components/requisitos/RequisitoCard.vue -->
<!-- ============================================ -->
<template>
  <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
    <div class="flex items-start justify-between">
      <div class="flex-1 min-w-0">
        <div class="flex items-center space-x-2 mb-2">
          <h3 class="text-sm font-semibold text-gray-900 truncate">
            {{ requisito.nombre }}
          </h3>
          <span
            v-if="!requisito.activo"
            class="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full"
          >
            Inactivo
          </span>
        </div>

        <p v-if="requisito.descripcion" class="text-xs text-gray-600 mb-3 line-clamp-2">
          {{ requisito.descripcion }}
        </p>

        <!-- Dependencia -->
        <div v-if="requisito.dependencia" class="flex items-center text-xs text-gray-500 mb-2">
          <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span class="font-medium">{{ requisito.dependencia.nombre }}</span>
        </div>

        <!-- Categorías asociadas -->
        <div v-if="requisito.categorias && requisito.categorias.length > 0" class="flex flex-wrap gap-1 mb-3">
          <span
            v-for="categoria in requisito.categorias.slice(0, 3)"
            :key="categoria.id"
            class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
            :style="{
              backgroundColor: categoria.color + '20',
              color: categoria.color
            }"
          >
            <span v-if="categoria.icono" class="mr-1">{{ categoria.icono }}</span>
            {{ categoria.nombre }}
          </span>
          <span
            v-if="requisito.categorias.length > 3"
            class="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full"
          >
            +{{ requisito.categorias.length - 3 }}
          </span>
        </div>

        <!-- Fecha -->
        <p class="text-xs text-gray-400">
          Creado: {{ formatDate(requisito.fecha_creacion) }}
        </p>
      </div>

      <!-- Acciones -->
      <div class="flex items-center space-x-2 ml-4">
        <button
          @click="$emit('editar', requisito)"
          class="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
          title="Editar"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>

        <button
          @click="$emit('eliminar', requisito)"
          class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

defineProps({
  requisito: {
    type: Object,
    required: true
  }
})

defineEmits(['editar', 'eliminar'])

const formatDate = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY')
}
</script>