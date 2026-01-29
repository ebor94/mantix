<template>
  <MainLayout>
    <div class="space-y-6">

      <!-- ✅ NUEVO: Selector de Período y Sede -->
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-gray-900">Dashboard de Mantenimiento</h2>
            <p class="text-sm text-gray-500 mt-1">Indicadores y estadísticas en tiempo real</p>
          </div>

          <div class="flex items-center space-x-3">
            <!-- Selector de Período -->
            <select v-model="periodoSeleccionado" @change="handleCambioPeriodo" class="input text-sm">
              <option value="trimestral">Este Trimestre</option>
              <option value="semanal">Esta Semana</option>
              <option value="mensual">Este Mes</option>
              <option value="anual">Este Año</option>
            </select>

            <!-- Selector de Sede (opcional) -->
            <select v-model="sedeSeleccionada" @change="handleCambioSede" class="input text-sm">
              <option :value="null">Todas las Sedes</option>
              <option v-for="sede in sedes" :key="sede.id" :value="sede.id">
                {{ sede.nombre }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- ✅ ACTUALIZADO: KPI de Cumplimiento con validación -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard title="Cumplimiento" :value="parseFloat(indicadorGlobal?.porcentaje_cumplimiento || 0)" suffix="%"
          icon="ChartBarIcon" color="blue" :subtitle="subtituloCumplimiento" />

        <KPICard title="Mantenimientos Programados" :value="indicadorGlobal?.total_programados || 0" icon="CalendarIcon"
          color="green" :subtitle="`${indicadorGlobal?.total_ejecutados || 0} ejecutados`" />

    <!--     <KPICard title="En Proceso" :value="indicadorGlobal?.total_en_proceso || 0" icon="ClockIcon" color="orange"
          :subtitle="periodoLabel" /> -->

        <KPICard title="Atrasados" :value="indicadorGlobal?.total_atrasados || 0" icon="ExclamationTriangleIcon"
          color="red" :subtitle="periodoLabel" />
      </div>

      <!-- ✅ ACTUALIZADO: Gráficos con datos de indicadores -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Cumplimiento por Sede -->
        <ChartCard :title="`Cumplimiento por Sede - ${periodoLabel}`">
          <BarChart v-if="indicadoresPorSede && indicadoresPorSede.length > 0" :data="cumplimientoSedeChartData"
            :options="barChartOptions" />
          <EmptyState v-else title="No hay datos" description="No se encontraron datos de cumplimiento por sede"
            icon="chart" />
        </ChartCard>

        <!-- Cumplimiento por Categoría -->
        <ChartCard :title="`Cumplimiento por Categoría - ${periodoLabel}`">
          <DoughnutChart v-if="indicadoresPorCategoria && indicadoresPorCategoria.length > 0"
            :data="cumplimientoCategoriaChartData" :options="doughnutChartOptions" />
          <EmptyState v-else title="No hay datos" description="No se encontraron datos por categoría" icon="chart" />
        </ChartCard>
      </div>

      <!-- ✅ NUEVO: Tabla de Cumplimiento por Sede -->
      <div class="card">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          Detalle de Cumplimiento por Sede - {{ periodoLabel }}
        </h3>

        <div v-if="indicadoresPorSede && indicadoresPorSede.length > 0" class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sede
                </th>
                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Programados
                </th>
                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ejecutados
                </th>
                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Atrasados
                </th>
                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cumplimiento
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="sede in indicadoresPorSede" :key="sede.id" class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <div class="h-10 w-10 flex-shrink-0 bg-primary-100 rounded-lg flex items-center justify-center">
                      <span class="text-primary-600 font-bold text-sm">{{ sede.codigo_sede }}</span>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">{{ sede.nombre_sede }}</div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                  {{ sede.total_programados }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-green-600 font-semibold">
                  {{ sede.total_ejecutados }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-red-600">
                  {{ sede.total_atrasados }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                  <div class="flex items-center justify-center space-x-2">
                    <div class="w-full max-w-xs bg-gray-200 rounded-full h-2">
                      <div class="h-2 rounded-full transition-all"
                        :class="getProgressBarColor(sede.porcentaje_cumplimiento)"
                        :style="{ width: sede.porcentaje_cumplimiento + '%' }"></div>
                    </div>
                    <span class="text-sm font-bold" :class="getPercentageColor(sede.porcentaje_cumplimiento)">
                      {{ parseFloat(sede.porcentaje_cumplimiento).toFixed(1) }}%
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <EmptyState v-else title="No hay datos" description="No se encontraron datos de cumplimiento por sede"
          icon="building" />
      </div>

      <!-- Resto del contenido existente: Solicitudes, Actividad Reciente, Mantenimientos de Hoy -->
      <!-- ... (mantén todo lo que ya tienes) ... -->

    </div>



    <!-- Loader -->
    <Loader :loading="loading" />
    <MantenimientosFiltroFechas />
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import { useMantenimientosStore } from '@/stores/mantenimientos'
import api from '@/services/api'
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
import MantenimientosFiltroFechas from '../components/mantenimientos/MantenimientosFiltroFechas.vue'

// Registrar componentes de Chart.js
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement)

const dashboardStore = useDashboardStore()
const mantenimientosStore = useMantenimientosStore()

const {
  loading,
  indicadorGlobal,
  indicadoresPorSede,
  indicadoresPorCategoria,
  periodoSeleccionado: periodoStore,
  sedeSeleccionada: sedeStore
} = storeToRefs(dashboardStore)

const { mantenimientosHoy } = storeToRefs(mantenimientosStore)

// Estados locales
const periodoSeleccionado = ref('mensual')
const sedeSeleccionada = ref(null)
const sedes = ref([])

const subtituloCumplimiento = computed(() => {
  if (!indicadorGlobal.value) return 'Cargando...'
  const { total_ejecutados, total_programados } = indicadorGlobal.value
  return `${total_ejecutados || 0} de ${total_programados || 0} mantenimientos`
})

// ✅ Computed para label del período
const periodoLabel = computed(() => {
  const labels = {
    //diario: 'Hoy',
    semanal: 'Esta Semana',
    mensual: 'Este Mes',
    trimestral: 'Este Trimestre',
    anual: 'Este Año'
  }
  return labels[periodoSeleccionado.value] || 'Este Mes'
})

// ✅ Computed para datos del gráfico de barras (sedes)
const cumplimientoSedeChartData = computed(() => {
  if (!indicadoresPorSede.value || indicadoresPorSede.value.length === 0) {
    return { labels: [], datasets: [] }
  }

  // ✅ Eliminar duplicados: mantener solo el más reciente por sede_id
  const sedesUnicas = indicadoresPorSede.value.reduce((acc, sede) => {
    const existe = acc.find(s => s.sede_id === sede.sede_id)
    if (!existe) {
      acc.push(sede)
    } else {
      // Si ya existe, mantener el más reciente (mayor id)
      const index = acc.findIndex(s => s.sede_id === sede.sede_id)
      if (sede.id > acc[index].id) {
        acc[index] = sede
      }
    }
    return acc
  }, [])

  return {
    labels: sedesUnicas.map(s => s.codigo_sede || `Sede ${s.sede_id}`),
    datasets: [
      {
        label: 'Cumplimiento %',
        data: sedesUnicas.map(s => parseFloat(s.porcentaje_cumplimiento)),
        backgroundColor: sedesUnicas.map(s =>
          getChartBarColor(parseFloat(s.porcentaje_cumplimiento))
        ),
        borderColor: 'rgba(0, 135, 92, 1)',
        borderWidth: 2,
        borderRadius: 8
      }
    ]
  }
})

// ✅ Computed para datos del gráfico de dona (categorías)
const cumplimientoCategoriaChartData = computed(() => {
  if (!indicadoresPorCategoria.value || indicadoresPorCategoria.value.length === 0) {
    return { labels: [], datasets: [] }
  }

  // ✅ Eliminar duplicados por categoria_id
  const categoriasUnicas = indicadoresPorCategoria.value.reduce((acc, cat) => {
    const existe = acc.find(c => c.categoria_id === cat.categoria_id)
    if (!existe) {
      acc.push(cat)
    } else {
      const index = acc.findIndex(c => c.categoria_id === cat.categoria_id)
      if (cat.id > acc[index].id) {
        acc[index] = cat
      }
    }
    return acc
  }, [])

  return {
    labels: categoriasUnicas.map(c => c.nombre_categoria),
    datasets: [
      {
        data: categoriasUnicas.map(c => c.total_ejecutados),
        backgroundColor: [
          'rgba(0, 135, 92, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(14, 165, 233, 0.8)'
        ],
        borderWidth: 0
      }
    ]
  }
})

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
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          const label = context.label || ''
          const value = context.parsed || 0
          return `${label}: ${value} ejecutados`
        }
      }
    }
  }
}

// ✅ Funciones para colores
const getProgressBarColor = (porcentaje) => {
  const p = parseFloat(porcentaje)
  if (p >= 80) return 'bg-green-500'
  if (p >= 60) return 'bg-blue-500'
  if (p >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

const getPercentageColor = (porcentaje) => {
  const p = parseFloat(porcentaje)
  if (p >= 80) return 'text-green-600'
  if (p >= 60) return 'text-blue-600'
  if (p >= 40) return 'text-yellow-600'
  return 'text-red-600'
}

const getChartBarColor = (porcentaje) => {
  if (porcentaje >= 80) return 'rgba(34, 197, 94, 0.8)'
  if (porcentaje >= 60) return 'rgba(59, 130, 246, 0.8)'
  if (porcentaje >= 40) return 'rgba(251, 191, 36, 0.8)'
  return 'rgba(239, 68, 68, 0.8)'
}

// ✅ Handlers
const handleCambioPeriodo = async () => {
  await dashboardStore.cambiarPeriodo(periodoSeleccionado.value)
}

const handleCambioSede = async () => {
  await dashboardStore.cambiarSede(sedeSeleccionada.value)
}

// ✅ Cargar sedes
const cargarSedes = async () => {
  try {
    const response = await api.get('/sedes')
    sedes.value = response
  } catch (error) {
    console.error('Error al cargar sedes:', error)
  }
}

onMounted(async () => {
  await Promise.all([
    dashboardStore.loadDashboardData(),
    mantenimientosStore.fetchMantenimientosHoy(),
    cargarSedes()
  ])

  // ✅ DEBUG: Ver qué hay en el store después de cargar
  console.log('📊 Estado del store después de cargar:', {
    indicadorGlobal: indicadorGlobal.value,
    indicadoresPorSede: indicadoresPorSede.value,
    indicadoresPorCategoria: indicadoresPorCategoria.value
  })
})
</script>