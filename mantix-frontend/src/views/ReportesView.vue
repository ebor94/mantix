<!-- src/views/ReportesView.vue -->
<template>
  <MainLayout>
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Reportes y Análisis</h1>
        <p class="text-gray-500 mt-1">Genera y exporta reportes personalizados</p>
      </div>

      <!-- Filtros Globales -->
      <div class="card">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Filtros Globales</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Rango de Fechas
            </label>
            <div class="grid grid-cols-2 gap-2">
              <input
                v-model="filtros.fecha_inicio"
                type="date"
                class="input-field"
                placeholder="Fecha inicio"
              />
              <input
                v-model="filtros.fecha_fin"
                type="date"
                class="input-field"
                placeholder="Fecha fin"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Sede</label>
            <select v-model="filtros.sede_id" class="input-field">
              <option :value="null">Todas las sedes</option>
              <option v-for="sede in sedes" :key="sede.id" :value="sede.id">
                {{ sede.nombre }}
              </option>
            </select>
          </div>

          <div class="flex items-end">
            <button @click="aplicarFiltros" class="btn-primary w-full">
              <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Aplicar Filtros
            </button>
          </div>
        </div>
      </div>

      <!-- Tipos de Reportes -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReporteCard
          titulo="Cumplimiento"
          descripcion="Reporte de cumplimiento de mantenimientos por sede"
          icono="chart-bar"
          color="blue"
          @seleccionar="seleccionarReporte('cumplimiento')"
        />

        <ReporteCard
          titulo="Mantenimientos"
          descripcion="Listado detallado de mantenimientos realizados"
          icono="wrench"
          color="green"
          @seleccionar="seleccionarReporte('mantenimientos')"
        />

        <ReporteCard
          titulo="Solicitudes R-275"
          descripcion="Reporte de solicitudes de mantenimiento correctivo"
          icono="document"
          color="orange"
          @seleccionar="seleccionarReporte('solicitudes')"
        />

        <ReporteCard
          titulo="Inventario de Equipos"
          descripcion="Listado completo de equipos y su estado"
          icono="cube"
          color="purple"
          @seleccionar="seleccionarReporte('equipos')"
        />
      </div>

      <!-- Vista Previa del Reporte -->
      <div v-if="reporteSeleccionado" class="card">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h3 class="text-xl font-bold text-gray-900">
              {{ getTituloReporte(reporteSeleccionado) }}
            </h3>
            <p class="text-sm text-gray-500 mt-1">
              {{ datosReporte?.length || 0 }} registros encontrados
            </p>
          </div>
          <div class="flex items-center space-x-3">
            <button
              @click="exportarExcel"
              class="btn-secondary"
              :disabled="loading || !datosReporte?.length"
            >
              <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar a Excel
            </button>
            <button
              @click="exportarPDF"
              class="btn-primary"
              :disabled="loading || !datosReporte?.length"
            >
              <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Exportar a PDF
            </button>
          </div>
        </div>

        <!-- Loader -->
        <div v-if="loading" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <p class="text-gray-500 mt-4">Generando reporte...</p>
        </div>

        <!-- Tabla de datos -->
        <div v-else-if="datosReporte && datosReporte.length > 0" class="overflow-x-auto">
          <!-- Reporte de Cumplimiento -->
          <table v-if="reporteSeleccionado === 'cumplimiento'" class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sede</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Programados</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ejecutados</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cumplimiento</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="item in datosReporte" :key="item.sede_id">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ item.nombre || item.codigo }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ item.programados }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ item.ejecutados }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <span class="text-sm font-semibold" :class="getCumplimientoColor(item.cumplimiento)">
                      {{ item.cumplimiento }}%
                    </span>
                    <div class="ml-2 w-24 bg-gray-200 rounded-full h-2">
                      <div
                        class="h-2 rounded-full"
                        :class="getCumplimientoBarColor(item.cumplimiento)"
                        :style="{ width: item.cumplimiento + '%' }"
                      ></div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Reporte de Mantenimientos -->
          <table v-else-if="reporteSeleccionado === 'mantenimientos'" class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actividad</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sede</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Programada</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prioridad</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="item in datosReporte" :key="item.id">
                <td class="px-6 py-4 text-sm font-medium text-gray-900">
                  {{ item.actividad?.nombre || 'N/A' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ item.actividad?.sede?.nombre || 'N/A' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(item.fecha_programada) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <Badge :color="getEstadoColor(item.estado?.nombre)">
                    {{ item.estado?.nombre }}
                  </Badge>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <Badge :color="getPrioridadColor(item.prioridad)">
                    {{ item.prioridad }}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Reporte de Solicitudes -->
          <table v-else-if="reporteSeleccionado === 'solicitudes'" class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Solicitante</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sede</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prioridad</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="item in datosReporte" :key="item.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  #{{ item.id }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ item.solicitante }}
                </td>
                <td class="px-6 py-4 text-sm text-gray-500 max-w-md truncate">
                  {{ item.descripcion }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ item.sede?.nombre || 'N/A' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <Badge :color="getEstadoColor(item.estado?.nombre)">
                    {{ item.estado?.nombre }}
                  </Badge>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <Badge :color="getPrioridadColor(item.prioridad)">
                    {{ item.prioridad }}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Reporte de Equipos -->
          <table v-else-if="reporteSeleccionado === 'equipos'" class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sede</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsable</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="item in datosReporte" :key="item.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                  {{ item.codigo }}
                </td>
                <td class="px-6 py-4 text-sm font-medium text-gray-900">
                  {{ item.nombre }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ item.sede?.nombre || 'N/A' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ item.categoria?.nombre || 'N/A' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <Badge :color="getEstadoEquipoColor(item.estado)">
                    {{ formatEstadoEquipo(item.estado) }}
                  </Badge>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ item.responsable ? `${item.responsable.nombre} ${item.responsable.apellido}` : 'N/A' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <EmptyState
          v-else
          title="No hay datos"
          description="No se encontraron datos con los filtros aplicados"
          icon="document"
        />
      </div>

      <!-- Mensaje inicial -->
      <div v-else class="card">
        <div class="text-center py-12">
          <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-gray-900">Selecciona un tipo de reporte</h3>
          <p class="mt-2 text-sm text-gray-500">Elige una de las opciones arriba para generar un reporte</p>
        </div>
      </div>
    </div>

    <Loader :loading="loading" />
  </MainLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useReportesStore } from '@/stores/reportes'
import MainLayout from '@/components/common/MainLayout.vue'
import ReporteCard from '@/components/reportes/ReporteCard.vue'
import Badge from '@/components/common/Badge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Loader from '@/components/common/Loader.vue'
import api from '@/services/api'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const reportesStore = useReportesStore()
const { loading } = storeToRefs(reportesStore)

const reporteSeleccionado = ref(null)
const datosReporte = ref(null)
const sedes = ref([])

const filtros = ref({
  fecha_inicio: dayjs().startOf('month').format('YYYY-MM-DD'),
  fecha_fin: dayjs().endOf('month').format('YYYY-MM-DD'),
  sede_id: null
})

const getTituloReporte = (tipo) => {
  const titulos = {
    cumplimiento: 'Reporte de Cumplimiento',
    mantenimientos: 'Reporte de Mantenimientos',
    solicitudes: 'Reporte de Solicitudes R-275',
    equipos: 'Inventario de Equipos'
  }
  return titulos[tipo] || 'Reporte'
}

const seleccionarReporte = async (tipo) => {
  reporteSeleccionado.value = tipo
  await generarReporte()
}

const generarReporte = async () => {
  if (!reporteSeleccionado.value) return

  const metodos = {
    cumplimiento: reportesStore.generarReporteCumplimiento,
    mantenimientos: reportesStore.generarReporteMantenimientos,
    solicitudes: reportesStore.generarReporteSolicitudes,
    equipos: reportesStore.generarReporteEquipos
  }

  const data = await metodos[reporteSeleccionado.value](filtros.value)
  datosReporte.value = Array.isArray(data) ? data : []
}

const aplicarFiltros = () => {
  if (reporteSeleccionado.value) {
    generarReporte()
  }
}

const exportarExcel = () => {
  if (!datosReporte.value || datosReporte.value.length === 0) return

  const ws = XLSX.utils.json_to_sheet(prepararDatosParaExcel())
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, getTituloReporte(reporteSeleccionado.value))
  
  const filename = `${reporteSeleccionado.value}_${dayjs().format('YYYY-MM-DD')}.xlsx`
  XLSX.writeFile(wb, filename)
}

const exportarPDF = () => {
  if (!datosReporte.value || datosReporte.value.length === 0) return

  const doc = new jsPDF()
  
  // Título
  doc.setFontSize(18)
  doc.text(getTituloReporte(reporteSeleccionado.value), 14, 20)
  
  // Fecha del reporte
  doc.setFontSize(10)
  doc.text(`Generado el: ${dayjs().format('DD/MM/YYYY HH:mm')}`, 14, 28)
  
  // Tabla
  const columns = obtenerColumnasTabla()
  const rows = prepararDatosParaPDF()
  
  doc.autoTable({
    startY: 35,
    head: [columns],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 135, 92] }
  })
  
  const filename = `${reporteSeleccionado.value}_${dayjs().format('YYYY-MM-DD')}.pdf`
  doc.save(filename)
}

const prepararDatosParaExcel = () => {
  // Implementar según el tipo de reporte
  return datosReporte.value
}

const obtenerColumnasTabla = () => {
  const columnas = {
    cumplimiento: ['Sede', 'Programados', 'Ejecutados', 'Cumplimiento'],
    mantenimientos: ['Actividad', 'Sede', 'Fecha', 'Estado', 'Prioridad'],
    solicitudes: ['ID', 'Solicitante', 'Descripción', 'Sede', 'Estado'],
    equipos: ['Código', 'Nombre', 'Sede', 'Categoría', 'Estado']
  }
  return columnas[reporteSeleccionado.value] || []
}

const prepararDatosParaPDF = () => {
  // Implementar según el tipo de reporte
  return datosReporte.value.map(item => Object.values(item))
}

const formatDate = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY')
}

const getCumplimientoColor = (cumplimiento) => {
  if (cumplimiento >= 90) return 'text-green-600'
  if (cumplimiento >= 70) return 'text-yellow-600'
  return 'text-red-600'
}

const getCumplimientoBarColor = (cumplimiento) => {
  if (cumplimiento >= 90) return 'bg-green-500'
  if (cumplimiento >= 70) return 'bg-yellow-500'
  return 'bg-red-500'
}

const getEstadoColor = (estado) => {
  const colors = {
    'Programado': 'blue',
    'En Proceso': 'orange',
    'Ejecutado': 'green',
    'Atrasado': 'red',
    'Pendiente': 'yellow',
    'Aprobada': 'green',
    'Cerrada': 'gray'
  }
  return colors[estado] || 'gray'
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

const getEstadoEquipoColor = (estado) => {
  const colors = {
    operativo: 'green',
    en_mantenimiento: 'orange',
    fuera_servicio: 'red',
    dado_baja: 'gray'
  }
  return colors[estado] || 'gray'
}

const formatEstadoEquipo = (estado) => {
  const estados = {
    operativo: 'Operativo',
    en_mantenimiento: 'En Mantenimiento',
    fuera_servicio: 'Fuera de Servicio',
    dado_baja: 'Dado de Baja'
  }
  return estados[estado] || estado
}

const loadSedes = async () => {
  try {
    const response = await api.get('/sedes')
    sedes.value = Array.isArray(response) ? response : response.data || []
  } catch (error) {
    console.error('Error al cargar sedes:', error)
  }
}

onMounted(() => {
  loadSedes()
})
</script>