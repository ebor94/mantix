<!-- ============================================ -->
<!-- src/components/dashboard/QuickActions.vue -->
<!-- ============================================ -->
<template>
  <div class="card">
    <h3 class="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
    <div class="grid grid-cols-2 gap-3">
      <button
        v-for="action in actions"
        :key="action.id"
        @click="action.onClick"
        class="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-all group"
      >
        <component
          :is="action.icon"
          class="h-8 w-8 text-gray-400 group-hover:text-primary-600 mb-2 transition-colors"
        />
        <span class="text-sm font-medium text-gray-700 group-hover:text-primary-700 text-center">
          {{ action.label }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import {
  PlusCircleIcon,
  WrenchIcon,
  DocumentPlusIcon,
  ChartBarIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()

const actions = [
  {
    id: 1,
    label: 'Nuevo Mantenimiento',
    icon: PlusCircleIcon,
    onClick: () => router.push('/mantenimientos/nuevo')
  },
  {
    id: 2,
    label: 'Registrar Ejecución',
    icon: WrenchIcon,
    onClick: () => router.push('/mantenimientos?tab=ejecucion')
  },
  {
    id: 3,
    label: 'Nueva Solicitud',
    icon: DocumentPlusIcon,
    onClick: () => router.push('/solicitudes/nueva')
  },
  {
    id: 4,
    label: 'Ver Reportes',
    icon: ChartBarIcon,
    onClick: () => router.push('/reportes')
  }
]
</script>