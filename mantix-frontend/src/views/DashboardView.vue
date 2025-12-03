<!-- src/views/DashboardView.vue -->
<template>
  <MainLayout>
    <div class="space-y-6">
      
      <!-- KPIs Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Cumplimiento Mensual"
          :value="kpis?.cumplimiento_mensual || 0"
          suffix="%"
          icon="ChartBarIcon"
          color="blue"
          :trend="5.2"
          trend-label="vs mes anterior"
        />
        
        <KPICard
          title="Mantenimientos Programados"
          :value="kpis?.mantenimientos_programados || 0"
          icon="CalendarIcon"
          color="green"
          :subtitle="`${kpis?.mantenimientos_pendientes || 0} pendientes`"
        />
        
        <KPICard
          title="Solicitudes R-275"
          :value="kpis?.solicitudes_mes || 0"
          icon="DocumentTextIcon"
          color="orange"
          :subtitle="`${kpis?.solicitudes_pendientes || 0} pendientes`"
        />
        
        <KPICard
          title="Mantenimientos Atrasados"
          :value="kpis?.mantenimientos_atrasados || 0"
          icon="ExclamationTriangleIcon"
          color="red"
          :trend="kpis?.mantenimientos_atrasados > 5 ? 2 : -1"
          trend-label="más que ayer"
        />
      </div>

      <!-- Gráficos -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Cumplimiento por Sede -->
        <ChartCard title="Cumplimiento por Sede">
          <BarChart
            v-if="cumplimientoSede.length > 0"
            :data="cumplimientoSedeData"
            :options="barChartOptions"
          />
          <EmptyState
            v-else
            title="No hay datos"
            description="No se encontraron datos de cumplimiento"
            icon="chart"
          />
        </ChartCard>

        <!-- Cumplimiento por Categoría -->
        <ChartCard title="Cumplimiento por Categoría">
          <DoughnutChart
            v-if="cumplimientoCategoria.length > 0"
            :data="cumplimientoCategoriaData"
            :options="doughnutChartOptions"
          />
          <EmptyState
            v-else
            title="No hay datos"
            description="No se encontraron datos de categorías"
            icon="chart"
          />
        </ChartCard>
      </div>

      <!-- Solicitudes y Actividad -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Estadísticas de Solicitudes -->
        <div class="card">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Solicitudes por Estado</h3>
          <div class="space-y-3">
            <div
              v-for="estado in estadisticasSolicitudes?.por_estado || []"
              :key="estado.estado_id"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex items-center space-x-3">
                <div :class="['h-3 w-3 rounded-full', getEstadoBgColor(estado.estado_id)]"></div>
                <span class="text-sm font-medium text-gray-700">
                  {{ estado.estado?.nombre || 'Estado' }}
                </span>
              </div>
              <span class="text-sm font-bold text-gray-900">{{ estado.total }}</span>
            </div>
            
            <div v-if="!estadisticasSolicitudes?.por_estado?.length" class="text-center py-8 text-gray-500">
              No hay datos disponibles
            </div>
          </div>
          
          <div class="mt-4 pt-4 border-t border-gray-200">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600">Tiempo promedio de respuesta</span>
              <span class="text-lg font-bold text-primary-600">
                {{ formatTiempoRespuesta(estadisticasSolicitudes?.tiempo_promedio_respuesta) }} hrs
              </span>
            </div>
          </div>
        </div>

        <!-- Actividad Reciente -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">Actividad Reciente</h3>
            <select
              v-model="activityFilter"
              class="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Todas</option>
              <option value="mantenimientos">Mantenimientos</option>
              <option value="solicitudes">Solicitudes</option>
            </select>
          </div>
          
          <div class="space-y-3 max-h-96 overflow-y-auto">
            <div
              v-for="(activity, index) in filteredActivity"
              :key="index"
              class="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div :class="['flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center', activity.iconBg]">
                <component :is="activity.icon" class="h-5 w-5 text-white" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900">{{ activity.title }}</p>
                <p class="text-xs text-gray-500 mt-1">{{ activity.description }}</p>
                <p class="text-xs text-gray-400 mt-1">{{ formatRelativeTime(activity.date) }}</p>
              </div>
            </div>
            
            <EmptyState
              v-if="filteredActivity.length === 0"
              title="No hay actividad reciente"
              description="Aún no hay actividad registrada"
              icon="inbox"
            />
          </div>
        </div>
      </div>

      <!-- Mantenimientos de Hoy -->
      <div class="card">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Mantenimientos de Hoy</h3>
            <p class="text-sm text-gray-500 mt-1">{{ mantenimientosHoy.length }} mantenimientos programados</p>
          </div>
          <router-link
            to="/mantenimientos"
            class="btn-secondary text-sm"
          >
            Ver todos
          </router-link>
        </div>

        <div v-if="mantenimientosHoy.length > 0" class="space-y-3">
          <div
            v-for="mant in mantenimientosHoy"
            :key="mant.id"
            class="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-xl hover:shadow-md transition-all"
          >
            <div class="flex items-center space-x-4 flex-1">
              <div class="flex-shrink-0">
                <div class="h-12 w-12 bg-primary-100 rounded-xl flex items-center justify-center">
                  <svg class="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-gray-900 truncate">
                  {{ mant.actividad?.nombre || 'Mantenimiento' }}
                </p>
                <div class="flex items-center space-x-4 mt-1">
                  <span class="text-xs text-gray-500 flex items-center">
                    <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    {{ mant.actividad?.sede?.nombre || 'N/A' }}
                  </span>
                  <span class="text-xs text-gray-500 flex items-center">
                    <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {{ mant.hora_programada || 'Sin hora' }}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex items-center space-x-3">
              <Badge :color="getPrioridadColor(mant.prioridad)">
                {{ mant.prioridad }}
              </Badge>
              <Badge :color="getEstadoColorByName(mant.estado?.nombre)">
                {{ mant.estado?.nombre }}
              </Badge>
            </div>
          </div>
        </div>

        <EmptyState
          v-else
          title="No hay mantenimientos programados hoy"
          description="No tienes mantenimientos pendientes para el día de hoy"
          icon="calendar"
        />
      </div>
    </div>

    <!-- Loader -->
    <Loader :loading="loading" />
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import { useMantenimientosStore } from '@/stores/mantenimientos'
import MainLayout from '@/components/common/MainLayout.vue'
import KPICard from '@/components/dashboard/KPICard.vue'
import ChartCard from '@/components/dashboard/ChartCard.vue'
import Loader from '@/components/common/Loader.vue'
import Badge from '@/components/common/Badge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Bar as BarChart, Doughnut as DoughnutChart } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  ArcElement
} from 'chart.js'
import { formatRelativeTime } from '@/utils/formatters'
import {
  WrenchIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/vue/24/outline'

// Registrar componentes de Chart.js
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement)

const dashboardStore = useDashboardStore()
const mantenimientosStore = useMantenimientosStore()

const { kpis, cumplimientoSede, cumplimientoCategoria, estadisticasSolicitudes, actividadReciente, loading } = storeToRefs(dashboardStore)
const { mantenimientosHoy } = storeToRefs(mantenimientosStore)

const activityFilter = ref('all')
const formatTiempoRespuesta = (tiempo) => {
  if (!tiempo && tiempo !== 0) return '0.0';
  
  // Convertir a número si es string
  const tiempoNumero = typeof tiempo === 'string' ? parseFloat(tiempo) : tiempo;
  
  // Verificar que sea un número válido
  if (isNaN(tiempoNumero)) return '0.0';
  
  return tiempoNumero.toFixed(1);
};
// Datos del gráfico de barras
const cumplimientoSedeData = computed(() => ({
  labels: cumplimientoSede.value.map(s => s.codigo),
  datasets: [
    {
      label: 'Cumplimiento %',
      data: cumplimientoSede.value.map(s => s.cumplimiento),
      backgroundColor: 'rgba(0, 135, 92, 0.8)',
      borderColor: 'rgb(0, 135, 92)',
      borderWidth: 2,
      borderRadius: 8
    }
  ]
}))

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      padding: 12,
      borderRadius: 8
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 100,
      ticks: {
        callback: (value) => value + '%'
      }
    }
  }
}

// Datos del gráfico de dona
const cumplimientoCategoriaData = computed(() => ({
  labels: cumplimientoCategoria.value.map(c => c.categoria),
  datasets: [
    {
      data: cumplimientoCategoria.value.map(c => c.ejecutados),
      backgroundColor: [
        'rgba(0, 135, 92, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(251, 191, 36, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(168, 85, 247, 0.8)'
      ],
      borderWidth: 0
    }
  ]
}))

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        padding: 15,
        font: {
          size: 12
        }
      }
    }
  }
}

// Actividad reciente mock (reemplazar con datos reales)
const mockActivity = [
  {
    type: 'mantenimiento',
    title: 'Mantenimiento Completado',
    description: 'Aire Acondicionado - Sede Gran Colombia',
    date: new Date(Date.now() - 3600000),
    icon: CheckCircleIcon,
    iconBg: 'bg-green-500'
  },
  {
    type: 'solicitud',
    title: 'Nueva Solicitud R-275',
    description: 'Fuga en tubería - Área administrativa',
    date: new Date(Date.now() - 7200000),
    icon: DocumentTextIcon,
    iconBg: 'bg-orange-500'
  },
  {
    type: 'mantenimiento',
    title: 'Mantenimiento Iniciado',
    description: 'Revisión Extractores - Sede PC',
    date: new Date(Date.now() - 10800000),
    icon: WrenchIcon,
    iconBg: 'bg-blue-500'
  }
]

const filteredActivity = computed(() => {
  if (activityFilter.value === 'all') return mockActivity
  return mockActivity.filter(a => a.type === activityFilter.value.slice(0, -1))
})

const getPrioridadColor = (prioridad) => {
  const colors = {
    baja: 'green',
    media: 'yellow',
    alta: 'orange',
    critica: 'red'
  }
  return colors[prioridad] || 'gray'
}

const getEstadoColorByName = (estado) => {
  const colors = {
    'Programado': 'blue',
    'En Proceso': 'orange',
    'Ejecutado': 'green',
    'Atrasado': 'red'
  }
  return colors[estado] || 'gray'
}

const getEstadoBgColor = (estadoId) => {
  const colors = {
    7: 'bg-blue-500',
    8: 'bg-orange-500',
    9: 'bg-green-500',
    10: 'bg-blue-600',
    11: 'bg-orange-600',
    12: 'bg-green-600',
    13: 'bg-red-500',
    14: 'bg-gray-500'
  }
  return colors[estadoId] || 'bg-gray-500'
}

onMounted(async () => {
  await Promise.all([
    dashboardStore.loadDashboardData(),
    mantenimientosStore.fetchMantenimientosHoy()
  ])
})
</script>

<style scoped>
/* Estilos adicionales si son necesarios */
</style>