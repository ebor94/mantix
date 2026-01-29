<template>
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-4">
            <div>
                <h3 class="text-lg font-semibold text-gray-900">Consultar Mantenimientos</h3>
                <p class="text-sm text-gray-500 mt-1">Filtrar por rango de fechas y criterios</p>
            </div>

            <!-- Badge con total -->
            <div class="flex items-center gap-2">
                <Badge v-if="mantenimientosFiltradosLocal.length > 0" color="blue">
                    {{ mantenimientosFiltradosLocal.length }} de {{ mantenimientosConsulta.length }} registros
                </Badge>
                
                <!-- Botón limpiar todos los filtros -->
                <button
                    v-if="hayFiltrosActivos"
                    @click="limpiarTodosFiltros"
                    class="text-xs text-gray-600 hover:text-gray-900 underline"
                >
                    Limpiar filtros
                </button>
            </div>
        </div>

        <!-- Formulario de búsqueda por fechas -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Fecha Desde
                </label>
                <input v-model="fechaDesde" type="date"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    :max="fechaHasta || undefined" />
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Fecha Hasta
                </label>
                <input v-model="fechaHasta" type="date"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    :min="fechaDesde || undefined" />
            </div>

            <div class="flex items-end gap-2">
                <button @click="buscar" :disabled="!fechaDesde || !fechaHasta || loading"
                    class="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center">
                    <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg"
                        fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4">
                        </circle>
                        <path class="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                        </path>
                    </svg>
                    <span v-if="!loading">Buscar</span>
                    <span v-else>Buscando...</span>
                </button>

                <button @click="limpiar" :disabled="loading"
                    class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Limpiar
                </button>
            </div>
        </div>

        <!-- ✅ NUEVO: Filtros por columna -->
        <div v-if="mantenimientosConsulta.length > 0" class="mb-4 p-4 bg-gray-50 rounded-lg">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <!-- Filtro por Código -->
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                        Buscar por Código
                    </label>
                    <input
                        v-model="filtros.codigo"
                        type="text"
                        placeholder="Ej: MTTO-001"
                        class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                </div>

                <!-- Filtro por Equipo -->
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                        Buscar por Equipo
                    </label>
                    <input
                        v-model="filtros.equipo"
                        type="text"
                        placeholder="Nombre del equipo"
                        class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                </div>

                <!-- Filtro por Sede -->
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                        Filtrar por Sede
                    </label>
                    <select
                        v-model="filtros.sede"
                        class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="">Todas las sedes</option>
                        <option v-for="sede in sedesUnicas" :key="sede" :value="sede">
                            {{ sede }}
                        </option>
                    </select>
                </div>

                <!-- Filtro por Estado -->
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                        Filtrar por Estado
                    </label>
                    <select
                        v-model="filtros.estado"
                        class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="">Todos los estados</option>
                        <option v-for="estado in estadosUnicos" :key="estado" :value="estado">
                            {{ estado }}
                        </option>
                    </select>
                </div>

                <!-- Filtro por Categoría -->
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                        Filtrar por Categoría
                    </label>
                    <select
                        v-model="filtros.categoria"
                        class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="">Todas las categorías</option>
                        <option v-for="cat in categoriasUnicas" :key="cat" :value="cat">
                            {{ cat }}
                        </option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Tabla de resultados -->
        <div v-if="mantenimientosFiltradosLocal.length > 0" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Código
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Equipo
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sede
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Fecha Programada
                        </th>
                        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Estado
                        </th>
                        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Categoría
                        </th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-for="mtto in mantenimientosFiltradosLocal" :key="mtto.id"
                        class="hover:bg-gray-50 transition-colors cursor-pointer" @click="verDetalle(mtto)">
                        <td class="px-6 py-4 whitespace-nowrap">
                            <span class="text-sm font-medium text-primary-600">
                                {{ mtto.codigo || 'N/A' }}
                            </span>
                        </td>
                        <td class="px-6 py-4">
                            <div class="text-sm text-gray-900">
                                {{ mtto.actividad?.equipo?.nombre || 'N/A' }}
                            </div>
                            <div class="text-xs text-gray-500">
                                {{ mtto.actividad?.nombre || '' }}
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="flex items-center">
                                <div
                                    class="h-8 w-8 flex-shrink-0 bg-primary-100 rounded-lg flex items-center justify-center mr-3">
                                    <span class="text-primary-600 font-bold text-xs">
                                        {{ mtto.actividad?.sede?.codigo || 'N/A' }}
                                    </span>
                                </div>
                                <span class="text-sm text-gray-900">
                                    {{ mtto.actividad?.sede?.nombre || 'N/A' }}
                                </span>
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {{ formatearFecha(mtto.fecha_programada) }}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-center">
                            <Badge :color="getEstadoColor(mtto.estado?.nombre)">
                                {{ mtto.estado?.nombre || 'N/A' }}
                            </Badge>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                            {{ mtto.actividad?.categoria?.nombre || 'N/A' }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Estado vacío cuando hay filtros pero no resultados -->
        <EmptyState 
            v-else-if="mantenimientosConsulta.length > 0 && mantenimientosFiltradosLocal.length === 0" 
            title="No se encontraron resultados"
            description="Intenta ajustar los filtros para ver más resultados"
            icon="search" 
        />

        <!-- Estado vacío inicial -->
        <EmptyState v-else-if="!loading" title="Sin resultados"
            description="Selecciona un rango de fechas y presiona 'Buscar' para consultar mantenimientos"
            icon="calendar" />

        <!-- Loading -->
        <div v-if="loading" class="flex justify-center items-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMantenimientosStore } from '@/stores/mantenimientos'
import { useRouter } from 'vue-router'
import Badge from '@/components/common/Badge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import dayjs from 'dayjs'

const router = useRouter()
const mantenimientosStore = useMantenimientosStore()

// Estados del store
const {
    mantenimientosConsulta,
    fechaConsultaDesde,
    fechaConsultaHasta,
    loading
} = storeToRefs(mantenimientosStore)

// Estados locales para los inputs de fecha
const fechaDesde = ref('')
const fechaHasta = ref('')

// ✅ NUEVO: Estados para filtros por columna
const filtros = ref({
    codigo: '',
    equipo: '',
    sede: '',
    estado: '',
    categoria: ''
})

// ✅ NUEVO: Computed para obtener valores únicos de cada columna
const sedesUnicas = computed(() => {
    const sedes = mantenimientosConsulta.value
        .map(m => m.actividad?.sede?.nombre)
        .filter(Boolean)
    return [...new Set(sedes)].sort()
})

const estadosUnicos = computed(() => {
    const estados = mantenimientosConsulta.value
        .map(m => m.estado?.nombre)
        .filter(Boolean)
    return [...new Set(estados)].sort()
})

const categoriasUnicas = computed(() => {
    const categorias = mantenimientosConsulta.value
        .map(m => m.actividad?.categoria?.nombre)
        .filter(Boolean)
    return [...new Set(categorias)].sort()
})

// ✅ NUEVO: Computed para aplicar filtros locales
const mantenimientosFiltradosLocal = computed(() => {
    let resultado = [...mantenimientosConsulta.value]

    // Filtro por código
    if (filtros.value.codigo) {
        const busqueda = filtros.value.codigo.toLowerCase()
        resultado = resultado.filter(m => 
            m.codigo?.toLowerCase().includes(busqueda)
        )
    }

    // Filtro por equipo
    if (filtros.value.equipo) {
        const busqueda = filtros.value.equipo.toLowerCase()
        resultado = resultado.filter(m => 
            m.actividad?.equipo?.nombre?.toLowerCase().includes(busqueda) ||
            m.actividad?.nombre?.toLowerCase().includes(busqueda)
        )
    }

    // Filtro por sede
    if (filtros.value.sede) {
        resultado = resultado.filter(m => 
            m.actividad?.sede?.nombre === filtros.value.sede
        )
    }

    // Filtro por estado
    if (filtros.value.estado) {
        resultado = resultado.filter(m => 
            m.estado?.nombre === filtros.value.estado
        )
    }

    // Filtro por categoría
    if (filtros.value.categoria) {
        resultado = resultado.filter(m => 
            m.actividad?.categoria?.nombre === filtros.value.categoria
        )
    }

    return resultado
})

// ✅ NUEVO: Computed para verificar si hay filtros activos
const hayFiltrosActivos = computed(() => {
    return filtros.value.codigo || 
           filtros.value.equipo || 
           filtros.value.sede || 
           filtros.value.estado || 
           filtros.value.categoria
})

// Métodos
const buscar = async () => {
    if (!fechaDesde.value || !fechaHasta.value) {
        return
    }

    console.log('🔍 Buscando mantenimientos:', { fechaDesde: fechaDesde.value, fechaHasta: fechaHasta.value })

    await mantenimientosStore.fetchMantenimientosPorFechas(
        fechaDesde.value,
        fechaHasta.value
    )
    
    // Limpiar filtros locales al hacer nueva búsqueda
    limpiarFiltrosLocales()
}

const limpiar = () => {
    fechaDesde.value = ''
    fechaHasta.value = ''
    mantenimientosStore.limpiarConsultaFechas()
    limpiarFiltrosLocales()
}

// ✅ NUEVO: Limpiar solo los filtros locales
const limpiarFiltrosLocales = () => {
    filtros.value = {
        codigo: '',
        equipo: '',
        sede: '',
        estado: '',
        categoria: ''
    }
}

// ✅ NUEVO: Limpiar todos los filtros (fechas + locales)
const limpiarTodosFiltros = () => {
    limpiarFiltrosLocales()
}

const verDetalle = (mantenimiento) => {
    router.push(`/mantenimientos/${mantenimiento.id}`)
}

const formatearFecha = (fecha) => {
    return dayjs(fecha).format('DD/MM/YYYY')
}

const getEstadoColor = (estado) => {
    const colors = {
        'Programado': 'blue',
        'En Proceso': 'yellow',
        'Ejecutado': 'green',
        'Cancelado': 'red'
    }
    return colors[estado] || 'gray'
}

const exportarExcel = () => {
    console.log('📊 Exportando a Excel:', mantenimientosFiltradosLocal.value)
    // TODO: Implementar exportación a Excel
}
</script>