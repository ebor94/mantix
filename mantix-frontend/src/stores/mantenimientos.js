// ============================================
// src/stores/mantenimientos.js - Store de Mantenimientos ACTUALIZADO
// ============================================
import { defineStore } from 'pinia'
import api from '../services/api'
import { useToast } from 'vue-toastification'

const toast = useToast()

export const useMantenimientosStore = defineStore('mantenimientos', {
  state: () => ({
    mantenimientos: [],
    mantenimientosHoy: [],
    mantenimientosProximos: [],
    mantenimientosAtrasados: [],
    mantenimientoActual: null,
    loading: false,
  // ✅ NUEVO: Estados para consulta por rango de fechas
  mantenimientosConsulta: [], // Cambié el nombre para evitar conflicto
  fechaConsultaDesde: null,
  fechaConsultaHasta: null,
    filters: {
      sede_id: null,
      categoria_id: null,
      estado_id: null,
      fecha_inicio: null,
      fecha_fin: null,
      search: ''
    },
    pagination: {
      page: 1,
      limit: 20,
      total: 0
    }
  }),

  getters: {
    mantenimientosFiltrados: (state) => {
      let filtered = [...state.mantenimientos]

      if (state.filters.sede_id) {
        filtered = filtered.filter(m => m.actividad?.sede_id === state.filters.sede_id)
      }

      if (state.filters.categoria_id) {
        filtered = filtered.filter(m => m.actividad?.categoria_id === state.filters.categoria_id)
      }

      if (state.filters.estado_id) {
        filtered = filtered.filter(m => m.estado_id === state.filters.estado_id)
      }

      if (state.filters.search) {
        const search = state.filters.search.toLowerCase()
        filtered = filtered.filter(m =>
          m.actividad?.nombre?.toLowerCase().includes(search) ||
          m.actividad?.sede?.nombre?.toLowerCase().includes(search)
        )
      }

      return filtered
    },

    totalPages: (state) => {
      return Math.ceil(state.pagination.total / state.pagination.limit)
    }
  },

  actions: {
        async fetchMantenimiento(id) {
      this.loading = true
      try {
        const response = await api.get(`/mantenimientos/${id}`)
        this.mantenimientoActual = response.data // ✅ Guardar en mantenimientoActual
        console.log('Mantenimiento detalle cargado:', this.mantenimientoActual)
        return response.data
      } catch (error) {
        console.error('Error al cargar mantenimiento:', error)
        toast.error('Error al cargar el mantenimiento')
        this.mantenimientoActual = null
        return null
      } finally {
        this.loading = false
      }
    },
    // Obtener mantenimientos programados
    async fetchMantenimientos(params = { page: 1, limit: 100 }) {
      this.loading = true
      try {
        const response = await api.get('/mantenimientos?page=1&limit=1000')
        this.mantenimientos = response.data
        //console.log('Mantenimientos cargados:', this.mantenimientos)
        this.pagination.total = response.total || response.data.length
        return response.data
      } catch (error) {
       // console.error('Error al cargar mantenimientos:', error)
        toast.error('Error al cargar los mantenimientos')
        return []
      } finally {
        this.loading = false
      }
    },

    // Obtener mantenimientos de hoy
    async fetchMantenimientosHoy() {
      this.loading = true
      try {
        const response = await api.get('/mantenimientos/dia/hoy')
        this.mantenimientosHoy = response.data
        //console.log('Mantenimientos de hoy cargados:', this.mantenimientosHoy)
        return response.data
      } catch (error) {
        //console.error('Error al cargar mantenimientos de hoy:', error)
        this.mantenimientosHoy = []
        return []
      } finally {
        this.loading = false
      }
    },

    // Obtener mantenimientos próximos
    async fetchMantenimientosProximos() {
      this.loading = true
      try {
        const response = await api.get('/mantenimientos/proximos')
        this.mantenimientosProximos = response.data
        //console.log('Mantenimientos próximos cargados:', this.mantenimientosProximos)
        return response.data
      } catch (error) {
        //console.error('Error al cargar mantenimientos próximos:', error)
        this.mantenimientosProximos = []
        return []
      } finally {
        this.loading = false
      }
    },

    // Obtener mantenimientos atrasados
    async fetchMantenimientosAtrasados() {
      this.loading = true
      try {
        const response = await api.get('/mantenimientos/atrasados')
        this.mantenimientosAtrasados = response.data
        //console.log('Mantenimientos atrasados cargados:', this.mantenimientosAtrasados)
        return response.data
      } catch (error) {
        //console.error('Error al cargar mantenimientos atrasados:', error)
        this.mantenimientosAtrasados = []
        return []
      } finally {
        this.loading = false
      }
    },



    // ✅ ACTUALIZADO: Registrar ejecución de mantenimiento
    async ejecutarMantenimiento(id, formData) {
      this.loading = true
      try {
        const horaInicio = formData.get('hora_ejecucion')
        const tiempoEmpleado = parseInt(formData.get('tiempo_empleado'))

        // Calcular hora_fin correctamente
        const [hora, minuto] = horaInicio.split(':')
        const fechaInicio = new Date()
        fechaInicio.setHours(parseInt(hora), parseInt(minuto), 0, 0)
        const fechaFin = new Date(fechaInicio.getTime() + (tiempoEmpleado * 60 * 1000)) // Agregar milisegundos
        const horaFin = fechaFin.getHours().toString().padStart(2, '0') + ':' +
          fechaFin.getMinutes().toString().padStart(2, '0')


        // Preparar checklist
        const checklist = JSON.parse(formData.get('checklist')).map((item, index) => ({
          actividad: item.actividad,
          completada: item.completado,
          observacion: '',
          orden: index + 1
        }))

        // Preparar materiales
        const materialesRaw = JSON.parse(formData.get('materiales'))
        const materiales = materialesRaw
          .filter(m => m.nombre && m.cantidad)
          .map(m => ({
            descripcion: m.nombre,
            cantidad: m.cantidad,
            unidad: 'unidad',
            costo_unitario: 0,
            observacion: ''
          }))

        // Datos de ejecución
        const ejecucionData = {
          fecha_ejecucion: formData.get('fecha_ejecucion'),
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          trabajo_realizado: formData.get('observaciones') || 'Mantenimiento ejecutado',
          observaciones: formData.get('observaciones'),
          nombre_recibe: formData.get('ejecutado_por'),
          checklist: checklist,
          materiales: materiales
        }

        console.log('Enviando datos de ejecución:', ejecucionData)

        // PASO 2: Registrar ejecución principal (incluye checklist y materiales)
        const response = await api.post(`/mantenimientos/${id}/ejecucion`, ejecucionData)

        if (!response.success) {
          throw new Error(response.message || 'Error al registrar la ejecución')
        }

        const mantenimientoEjecutadoId = response.data.id

        console.log('Ejecución registrada. ID:', mantenimientoEjecutadoId)

        // PASO 3: Subir evidencias fotográficas
        const evidenciasFiles = formData.getAll('evidencias')

        if (evidenciasFiles && evidenciasFiles.length > 0) {
          console.log(`Subiendo ${evidenciasFiles.length} evidencias...`)

          for (let i = 0; i < evidenciasFiles.length; i++) {
            const file = evidenciasFiles[i]

            // Determinar tipo según orden (primeras = antes, últimas = después)
            let tipo = 'durante'
            if (i === 0) tipo = 'antes'
            if (i === evidenciasFiles.length - 1) tipo = 'despues'

            const evidenciaFormData = new FormData()
            evidenciaFormData.append('mantenimiento_ejecutado_id', mantenimientoEjecutadoId)
            evidenciaFormData.append('tipo', tipo)
            evidenciaFormData.append('descripcion', `Evidencia ${tipo} del mantenimiento`)
            evidenciaFormData.append('file', file)

            try {
              // Usar fetch directo para multipart/form-data
              const token = localStorage.getItem('token')
              const uploadResponse = await fetch(
                `${import.meta.env.VITE_API_URL || 'http://localhost:3020/api'}/ejecucion-evidencias`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  },
                  body: evidenciaFormData
                }
              )

              if (!uploadResponse.ok) {
                console.error(`Error al subir evidencia ${i + 1}`)
              } else {
                console.log(`Evidencia ${i + 1} subida exitosamente`)
              }
            } catch (uploadError) {
              console.error(`Error al subir evidencia ${i + 1}:`, uploadError)
            }
          }
        }

        toast.success('Mantenimiento ejecutado correctamente')

        // Actualizar listas
        await this.fetchMantenimientos()
        await this.fetchMantenimientosHoy()

        return response.data

      } catch (error) {
        console.error('Error al ejecutar mantenimiento:', error)
        toast.error(error.response?.data?.message || 'Error al ejecutar el mantenimiento')
        throw error
      } finally {
        this.loading = false
      }
    },

    // Reprogramar mantenimiento
    async reprogramarMantenimiento(id, data) {
      this.loading = true
      try {
        const response = await api.put(`/mantenimientos/${id}/reprogramar`, data)
        toast.success('Mantenimiento reprogramado correctamente')

        // Actualizar lista
        await this.fetchMantenimientos()

        return response.data
      } catch (error) {
        console.error('Error al reprogramar mantenimiento:', error)
        toast.error('Error al reprogramar el mantenimiento')
        return null
      } finally {
        this.loading = false
      }
    },

    // Actualizar filtros
    updateFilters(filters) {
      this.filters = { ...this.filters, ...filters }
    },

    // Limpiar filtros
    clearFilters() {
      this.filters = {
        sede_id: null,
        categoria_id: null,
        estado_id: null,
        fecha_inicio: null,
        fecha_fin: null,
        search: ''
      }
    },

    // Actualizar paginación
    updatePagination(page) {
      this.pagination.page = page
      this.fetchMantenimientos({
        page: this.pagination.page,
        limit: this.pagination.limit,
        ...this.filters
      })
    },

// ✅ NUEVO: Buscar mantenimientos por rango de fechas
async fetchMantenimientosPorFechas(fechaDesde, fechaHasta) {
  this.loading = true
  try {
    //console.log('🔍 Buscando mantenimientos por fechas:', { fechaDesde, fechaHasta })
    
    const response = await api.get('/mantenimientos', {
      params: {
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        limit: 1000
      }
    })

    //console.log('✅ Respuesta del servidor:', response)

    // Manejar diferentes formatos de respuesta
    let datos = []
    if (Array.isArray(response)) {
      datos = response
    } else if (response.data && Array.isArray(response.data)) {
      datos = response.data
    } else if (response.success && Array.isArray(response.data)) {
      datos = response.data
    }
    
    // Guardar en estado específico para consultas
    this.mantenimientosConsulta = datos
    this.fechaConsultaDesde = fechaDesde
    this.fechaConsultaHasta = fechaHasta
    
    toast.success(`Se encontraron ${datos.length} mantenimiento${datos.length !== 1 ? 's' : ''}`)
    
    return datos
    
  } catch (error) {
    console.error('❌ Error al buscar mantenimientos por fechas:', error)
    toast.error(error.response?.data?.message || 'Error al buscar mantenimientos')
    this.mantenimientosConsulta = []
    return []
  } finally {
    this.loading = false
  }
},

// ✅ NUEVO: Limpiar consulta de fechas
limpiarConsultaFechas() {
  this.mantenimientosConsulta = []
  this.fechaConsultaDesde = null
  this.fechaConsultaHasta = null
}
  }
})