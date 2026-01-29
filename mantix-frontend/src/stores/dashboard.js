import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

export const useDashboardStore = defineStore('dashboard', () => {
  const toast = useToast()
  
  // Estados existentes
  const kpis = ref(null)
  const cumplimientoSede = ref([])
  const cumplimientoCategoria = ref([])
  const estadisticasSolicitudes = ref(null)
  const actividadReciente = ref([])
  const loading = ref(false)

  // ✅ NUEVOS: Estados para indicadores de cumplimiento
  const indicadorGlobal = ref(null)
  const indicadoresPorSede = ref([])
  const indicadoresPorCategoria = ref([])
  const periodoSeleccionado = ref('mensual')
  const sedeSeleccionada = ref(null)


  // ✅ NUEVO: Cargar indicador de cumplimiento
// ✅ CORREGIDO: Cargar indicador de cumplimiento
const fetchIndicadorCumplimiento = async (params = {}) => {
  try {
    const { periodo = 'mensual', sede_id, categoria_id } = params
    
    //console.log('🔍 Llamando a /dashboard/cumplimiento con:', { periodo, sede_id, categoria_id })
    
    const response = await api.get('/dashboard/cumplimiento', {
      params: { periodo, sede_id, categoria_id }
    })
    
    //console.log('✅ Respuesta de cumplimiento:', response.data)
    
    // ✅ Verificar si response.data tiene data o es el dato directo
    return response.data.data || response.data
  } catch (error) {
    console.error('❌ Error al cargar indicador de cumplimiento:', error)
    console.error('❌ Detalles:', error.response?.data)
    toast.error('Error al cargar indicador de cumplimiento')
    return null
  }
}

// ✅ CORREGIDO: Cargar múltiples indicadores
const fetchIndicadoresMultiples = async (params = {}) => {
  try {
    const { periodo = 'mensual', tipo = 'sede' } = params
    
   // console.log(`🔍 Llamando a /dashboard/cumplimiento/multiple con:`, { periodo, tipo })
    
    const response = await api.get('/dashboard/cumplimiento/multiple', {
      params: { periodo, tipo }
    })
    
    //console.log(`✅ Respuesta completa de cumplimiento ${tipo}:`, response)
    //console.log(`✅ Respuesta data de cumplimiento ${tipo}:`, response.data)
    
    // ✅ Verificar diferentes formatos de respuesta
    let datos = []
    
    // Caso 1: response.data es un array directamente
    if (Array.isArray(response.data)) {
      datos = response.data
    //  console.log(`📦 Formato: Array directo (${datos.length} items)`)
    } 
    // Caso 2: response.data.data contiene el array
    else if (response.data && Array.isArray(response.data.data)) {
      datos = response.data.data
    //  console.log(`📦 Formato: Objeto con data (${datos.length} items)`)
    }
    // Caso 3: response es directamente el array (sin .data)
    else if (Array.isArray(response)) {
      datos = response
    //  console.log(`📦 Formato: Response directo es array (${datos.length} items)`)
    }
    // Caso 4: Formato inesperado
    else {
      console.warn('⚠️ Formato de respuesta inesperado:', {
        response,
        responseData: response.data,
        typeOfResponse: typeof response,
        typeOfResponseData: typeof response.data
      })
      datos = []
    }
    
    // Eliminar duplicados por sede_id o categoria_id
    const datosUnicos = datos.reduce((acc, item) => {
      const key = tipo === 'sede' ? item.sede_id : item.categoria_id
      const existe = acc.find(x => {
        const xKey = tipo === 'sede' ? x.sede_id : x.categoria_id
        return xKey === key
      })
      
      if (!existe) {
        acc.push(item)
      } else {
        // Si existe, mantener el más reciente (mayor id)
        const index = acc.findIndex(x => {
          const xKey = tipo === 'sede' ? x.sede_id : x.categoria_id
          return xKey === key
        })
        if (item.id > acc[index].id) {
          acc[index] = item
        }
      }
      return acc
    }, [])
    
    //console.log(`✅ Datos únicos: ${datosUnicos.length} registros`)
    
    return datosUnicos
    
  } catch (error) {
    console.error(`❌ Error al cargar indicadores ${tipo}:`, error)
    console.error('❌ Detalles del error:')
    console.error('  - Mensaje:', error.message)
    console.error('  - Response status:', error.response?.status)
    console.error('  - Response data:', error.response?.data)
    console.error('  - Stack:', error.stack)
    
    toast.error(`Error al cargar indicadores por ${tipo}`)
    return []
  }
}


// ✅ ACTUALIZADO: Cargar todos los datos del dashboard
const loadDashboardData = async () => {
  loading.value = true
  try {
    // Cargar datos existentes en paralelo
    const [kpisData, sedeData, categoriaData, solicitudesData] = await Promise.all([
      fetchKPIs(),
      fetchCumplimientoSede(),
      fetchCumplimientoCategoria(),
      fetchEstadisticasSolicitudes()
    ])

    // ✅ NUEVO: Cargar indicadores de cumplimiento DESPUÉS
    try {
      indicadorGlobal.value = await fetchIndicadorCumplimiento({ 
        periodo: periodoSeleccionado.value 
      })
    } catch (error) {
      console.error('Error al cargar indicador global:', error)
      indicadorGlobal.value = null
    }
    
    try {
      indicadoresPorSede.value = await fetchIndicadoresMultiples({ 
        periodo: periodoSeleccionado.value, 
        tipo: 'sede' 
      })
    } catch (error) {
      console.error('Error al cargar indicadores por sede:', error)
      indicadoresPorSede.value = []
    }
    
    try {
      indicadoresPorCategoria.value = await fetchIndicadoresMultiples({ 
        periodo: periodoSeleccionado.value, 
        tipo: 'categoria' 
      })
    } catch (error) {
      console.error('Error al cargar indicadores por categoría:', error)
      indicadoresPorCategoria.value = []
    }

  } catch (error) {
    console.error('Error al cargar datos del dashboard:', error)
    toast.error('Error al cargar datos del dashboard')
  } finally {
    loading.value = false
  }
}
  // ✅ NUEVO: Cambiar período y recargar indicadores
const cambiarPeriodo = async (nuevoPeriodo) => {
  periodoSeleccionado.value = nuevoPeriodo
  
  indicadorGlobal.value = await fetchIndicadorCumplimiento({ 
    periodo: nuevoPeriodo,
    sede_id: sedeSeleccionada.value 
  })
  
  indicadoresPorSede.value = await fetchIndicadoresMultiples({ 
    periodo: nuevoPeriodo, 
    tipo: 'sede' 
  })
  
  indicadoresPorCategoria.value = await fetchIndicadoresMultiples({ 
    periodo: nuevoPeriodo, 
    tipo: 'categoria' 
  })
}

  // ✅ NUEVO: Cambiar sede y recargar indicador
  const cambiarSede = async (sedeId) => {
    sedeSeleccionada.value = sedeId
    
    indicadorGlobal.value = await fetchIndicadorCumplimiento({ 
      periodo: periodoSeleccionado.value,
      sede_id: sedeId 
    })
  }

  // Funciones existentes (fetchKPIs, fetchCumplimientoSede, etc.)
  const fetchKPIs = async () => {
    try {
      const response = await api.get('/dashboard/kpis')
      kpis.value = response.data
    } catch (error) {
      console.error('Error al cargar KPIs:', error)
    }
  }

  const fetchCumplimientoSede = async () => {
    try {
      const response = await api.get('/dashboard/cumplimiento-sede')
      cumplimientoSede.value = response.data
    } catch (error) {
      console.error('Error al cargar cumplimiento por sede:', error)
    }
  }

  const fetchCumplimientoCategoria = async () => {
    try {
      const response = await api.get('/dashboard/cumplimiento-categoria')
      cumplimientoCategoria.value = response.data
    } catch (error) {
      console.error('Error al cargar cumplimiento por categoría:', error)
    }
  }

  const fetchEstadisticasSolicitudes = async () => {
    try {
      const response = await api.get('/dashboard/estadisticas-solicitudes')
      estadisticasSolicitudes.value = response.data
    } catch (error) {
      console.error('Error al cargar estadísticas de solicitudes:', error)
    }
  }

  return {
    // Estados existentes
    kpis,
    cumplimientoSede,
    cumplimientoCategoria,
    estadisticasSolicitudes,
    actividadReciente,
    loading,
    
    // ✅ NUEVOS: Estados de indicadores
    indicadorGlobal,
    indicadoresPorSede,
    indicadoresPorCategoria,
    periodoSeleccionado,
    sedeSeleccionada,
    
    // Funciones
    loadDashboardData,
    fetchKPIs,
    fetchCumplimientoSede,
    fetchCumplimientoCategoria,
    fetchEstadisticasSolicitudes,
    
    // ✅ NUEVAS: Funciones de indicadores
    fetchIndicadorCumplimiento,
    fetchIndicadoresMultiples,
    cambiarPeriodo,
    cambiarSede
  }
})