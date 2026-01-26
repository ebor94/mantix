<!-- ============================================ -->
<!-- src/views/PlanDetalleView.vue - ACTUALIZADO CON GESTIÓN DE GRUPOS -->
<!-- ============================================ -->
<template>
  <MainLayout>
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        <p class="text-gray-500 mt-4">Cargando plan...</p>
      </div>
    </div>

    <div v-else-if="!plan" class="text-center py-12">
      <EmptyState
        title="Plan no encontrado"
        description="El plan que buscas no existe o fue eliminado"
        icon="clipboard-list"
      />
      <router-link to="/planes" class="btn-primary mt-4">
        Volver a Planes
      </router-link>
    </div>

    <div v-else class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <nav class="flex items-center space-x-2 text-sm text-gray-500 mb-2">
            <router-link to="/planes" class="hover:text-primary-600">Planes</router-link>
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-gray-900">{{ plan.nombre }}</span>
          </nav>
          <h1 class="text-3xl font-bold text-gray-900">{{ plan.nombre }}</h1>
          <p class="text-gray-500 mt-1">Año {{ plan.anio }}</p>
        </div>
        
        <div class="flex items-center space-x-3">
          <Badge :color="plan.activo ? 'green' : 'gray'" size="lg">
            {{ plan.activo ? 'Activo' : 'Inactivo' }}
          </Badge>
          <button
            @click="mostrarModalEditar = true"
            class="btn-secondary"
          >
            <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar Plan
          </button>
        </div>
      </div>

      <!-- Información del Plan -->
      <div class="card">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label class="text-sm font-medium text-gray-600">Fecha de Inicio</label>
            <p class="text-lg font-semibold text-gray-900 mt-1">{{ formatDate(plan.fecha_inicio) }}</p>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-600">Fecha de Fin</label>
            <p class="text-lg font-semibold text-gray-900 mt-1">{{ formatDate(plan.fecha_fin) }}</p>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-600">Creado por</label>
            <p class="text-lg font-semibold text-gray-900 mt-1">
              {{ plan.usuario_creador ? `${plan.usuario_creador.nombre} ${plan.usuario_creador.apellido}` : 'N/A' }}
            </p>
          </div>
        </div>

        <div v-if="plan.descripcion" class="mt-6 pt-6 border-t">
          <label class="text-sm font-medium text-gray-600">Descripción</label>
          <p class="text-gray-900 mt-1">{{ plan.descripcion }}</p>
        </div>
      </div>

      <!-- Estadísticas -->
      <div v-if="estadisticas" class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div class="card bg-gradient-to-br from-blue-50 to-blue-100">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-blue-600 font-medium">Total Actividades</p>
              <p class="text-3xl font-bold text-blue-700 mt-1">{{ estadisticas.total_actividades }}</p>
            </div>
            <div class="bg-blue-200 p-3 rounded-lg">
              <svg class="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>

        <div class="card bg-gradient-to-br from-green-50 to-green-100">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-green-600 font-medium">Activas</p>
              <p class="text-3xl font-bold text-green-700 mt-1">{{ estadisticas.actividades_activas }}</p>
            </div>
            <div class="bg-green-200 p-3 rounded-lg">
              <svg class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="card bg-gradient-to-br from-gray-50 to-gray-100">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 font-medium">Inactivas</p>
              <p class="text-3xl font-bold text-gray-700 mt-1">{{ estadisticas.actividades_inactivas }}</p>
            </div>
            <div class="bg-gray-200 p-3 rounded-lg">
              <svg class="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
          </div>
        </div>

        <div class="card bg-gradient-to-br from-primary-50 to-primary-100">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-primary-600 font-medium">Costo Estimado</p>
              <p class="text-2xl font-bold text-primary-700 mt-1">
                {{ formatCurrency(estadisticas.costo_estimado_total) }}
              </p>
            </div>
            <div class="bg-primary-200 p-3 rounded-lg">
              <svg class="h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Actividades -->
      <div class="card">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-bold text-gray-900">Actividades del Plan</h2>
            <p class="text-gray-500 text-sm mt-1">
              {{ plan.actividades?.length || 0 }} actividad(es) registrada(s)
            </p>
          </div>
          <div class="flex items-center space-x-3">
            <button
              v-if="plan.actividades?.length > 0"
              @click="programarTodasActividades"
              class="btn-secondary"
              :disabled="loadingProgramar"
            >
              <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Programar Todas
            </button>
            <button
              @click="mostrarModalActividad = true"
              class="btn-primary"
            >
              <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Nueva Actividad
            </button>
          </div>
        </div>

        <!-- Lista de actividades -->
        <div v-if="plan.actividades && plan.actividades.length > 0" class="space-y-4">
          <ActividadCard
            v-for="actividad in plan.actividades"
            :key="actividad.id"
            :actividad="actividad"
            @editar="editarActividad"
            @eliminar="confirmarEliminarActividad"
            @toggle="toggleActividad"
            @programar="abrirModalProgramacion"
            @ver-grupo="handleVerGrupo"
            @editar-grupo="handleEditarGrupo"
            @eliminar-grupo="handleEliminarGrupo"
            @programar-grupo="handleProgramarGrupo"
          />
        </div>

        <!-- Empty state -->
        <div v-else class="text-center py-12">
          <EmptyState
            title="Sin actividades"
            description="Este plan no tiene actividades registradas"
            icon="clipboard-list"
          />
          <button
            @click="mostrarModalActividad = true"
            class="btn-primary mt-4"
          >
            Agregar primera actividad
          </button>
        </div>
      </div>
    </div>

    <!-- Modales Existentes -->
    <CrearPlanModal
      v-if="mostrarModalEditar"
      :plan="plan"
      @close="mostrarModalEditar = false"
      @success="handlePlanActualizado"
    />

    <ActividadModal
      v-if="mostrarModalActividad"
      :plan-id="plan?.id"
      :actividad="actividadEditar"
      @close="cerrarModalActividad"
      @success="handleActividadGuardada"
    />

    <ProgramarMantenimientoModal
      v-if="mostrarModalProgramacion"
      :actividad="actividadAProgramar"
      @close="cerrarModalProgramacion"
      @success="handleProgramacionExitosa"
    />

    <ConfirmModal
      v-if="mostrarConfirmEliminar"
      title="Eliminar Actividad"
      :message="`¿Estás seguro de que deseas eliminar la actividad '${actividadEliminar?.nombre}'?`"
      confirm-text="Eliminar"
      confirm-color="danger"
      @confirm="eliminarActividad"
      @cancel="mostrarConfirmEliminar = false"
    />

    <!-- ✅ NUEVOS MODALES PARA GRUPOS -->
    <VerGrupoModal
      v-if="mostrarVerGrupo"
      :grupo-masivo-id="grupoSeleccionado"
      @close="cerrarVerGrupo"
      @editar-grupo="handleEditarGrupoDesdeModal"
      @editar-individual="editarActividad"
    />

    <ConfirmModal
      v-if="mostrarConfirmEliminarGrupo"
      title="Eliminar Grupo Completo"
      :message="`¿Estás seguro de que deseas eliminar TODAS las actividades del grupo '${grupoSeleccionado}'? Esta acción no se puede deshacer.`"
      confirm-text="Eliminar Grupo"
      confirm-color="danger"
      @confirm="eliminarGrupo"
      @cancel="cerrarConfirmEliminarGrupo"
    />

<EditarGrupoModal
  :visible="mostrarEditarGrupo"
  :actividades="actividadesGrupo"
  :periodicidades="periodicidades"
  :proveedores="proveedores"
  :usuarios="usuarios"
  @cerrar="cerrarEditarGrupo"
  @guardar="guardarCambiosGrupo"
/>

<ProgramarGrupoModal
  v-if="mostrarProgramarGrupo"
  :grupo-masivo-id="grupoAProgramar"
  :plan="plan"
  @close="cerrarProgramarGrupo"
  @success="handleProgramacionGrupoExitosa"
/>
  </MainLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePlanesStore } from '@/stores/planes'
import { usePlanActividadesStore } from '@/stores/planActividades'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import api from '@/services/api'
import MainLayout from '@/components/common/MainLayout.vue'
import Badge from '@/components/common/Badge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import CrearPlanModal from '@/components/planes/CrearPlanModal.vue'
import ActividadCard from '@/components/planes/ActividadCard.vue'
import ActividadModal from '@/components/planes/ActividadModal.vue'
import ProgramarMantenimientoModal from '@/components/planes/ProgramarMantenimientoModal.vue'
import VerGrupoModal from '@/components/planes/VerGrupoModal.vue'
import EditarGrupoModal from '@/components/planes/EditarGrupoModal.vue'
import ConfirmModal from '@/components/common/ConfirmDialog.vue'
import ProgramarGrupoModal from '@/components/planes/ProgramarMasivoModal.vue'
import dayjs from 'dayjs'
import 'dayjs/locale/es'

dayjs.locale('es')

const route = useRoute()
const planesStore = usePlanesStore()
const actividadesStore = usePlanActividadesStore()
const toast = useToast()

const { planActual: plan, loading } = storeToRefs(planesStore)

// Estados existentes
const estadisticas = ref(null)
const mostrarModalEditar = ref(false)
const mostrarModalActividad = ref(false)
const actividadEditar = ref(null)
const mostrarConfirmEliminar = ref(false)
const actividadEliminar = ref(null)
const loadingProgramar = ref(false)
const mostrarModalProgramacion = ref(false)
const actividadAProgramar = ref(null)

// ✅ Estados para gestión de grupos
const mostrarVerGrupo = ref(false)
const mostrarEditarGrupo = ref(false) // ✅ AGREGADO
const grupoSeleccionado = ref(null)
const mostrarConfirmEliminarGrupo = ref(false)

// ✅ Estados para datos del formulario de editar grupo
const periodicidades = ref([])
const proveedores = ref([])
const usuarios = ref([])
const actividadesGrupo = ref([]) // ✅ AGREGADO: Para guardar las actividades del grupo

const mostrarProgramarGrupo = ref(false)
const grupoAProgramar = ref(null)

// Agregar handler
const handleProgramarGrupo = (grupoMasivoId) => {
  grupoAProgramar.value = grupoMasivoId
  mostrarProgramarGrupo.value = true
}

const cerrarProgramarGrupo = () => {
  mostrarProgramarGrupo.value = false
  grupoAProgramar.value = null
}

const handleProgramacionGrupoExitosa = async (resultado) => {
  cerrarProgramarGrupo()
  await planesStore.fetchPlan(route.params.id)
  await cargarEstadisticas()
}

const formatDate = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY')
}

const formatCurrency = (value) => {
  if (!value) return '$0'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(value)
}

const cargarEstadisticas = async () => {
  try {
    estadisticas.value = await planesStore.fetchEstadisticas(route.params.id)
  } catch (error) {
    // Error manejado en el store
  }
}

// ✅ NUEVA: Cargar datos para los formularios
const cargarDatosFormularios = async () => {
  try {
    // Cargar periodicidades
    const respPeriodicidades = await api.get('/periodicidades')
    periodicidades.value = respPeriodicidades.data

    // Cargar proveedores (asumiendo que tienes este endpoint)
    try {
      const respProveedores = await api.get('/proveedores')
      proveedores.value = respProveedores.data
    } catch (error) {
      console.warn('No se pudieron cargar proveedores:', error)
      proveedores.value = []
    }

    // Cargar usuarios (asumiendo que tienes este endpoint)
    try {
      const respUsuarios = await api.get('/usuarios')
      usuarios.value = respUsuarios.data
    } catch (error) {
      console.warn('No se pudieron cargar usuarios:', error)
      usuarios.value = []
    }
  } catch (error) {
    console.error('Error al cargar datos de formularios:', error)
    toast.error('Error al cargar datos necesarios para el formulario')
  }
}

const handlePlanActualizado = async () => {
  mostrarModalEditar.value = false
  await planesStore.fetchPlan(route.params.id)
}

const editarActividad = (actividad) => {
  actividadEditar.value = actividad
  mostrarModalActividad.value = true
}

const cerrarModalActividad = () => {
  mostrarModalActividad.value = false
  actividadEditar.value = null
}

const handleActividadGuardada = async () => {
  cerrarModalActividad()
  await planesStore.fetchPlan(route.params.id)
  await cargarEstadisticas()
}

const confirmarEliminarActividad = (actividad) => {
  actividadEliminar.value = actividad
  mostrarConfirmEliminar.value = true
}

const eliminarActividad = async () => {
  try {
    await actividadesStore.eliminarActividad(actividadEliminar.value.id)
    mostrarConfirmEliminar.value = false
    actividadEliminar.value = null
    await planesStore.fetchPlan(route.params.id)
    await cargarEstadisticas()
  } catch (error) {
    // Error manejado en el store
  }
}

const toggleActividad = async (actividad) => {
  try {
    await actividadesStore.toggleActivo(actividad.id)
    await planesStore.fetchPlan(route.params.id)
    await cargarEstadisticas()
  } catch (error) {
    // Error manejado en el store
  }
}

const abrirModalProgramacion = (actividad) => {
  actividadAProgramar.value = actividad
  mostrarModalProgramacion.value = true
}

const cerrarModalProgramacion = () => {
  mostrarModalProgramacion.value = false
  actividadAProgramar.value = null
}

const handleProgramacionExitosa = async (resultado) => {
  cerrarModalProgramacion()
  await planesStore.fetchPlan(route.params.id)
  await cargarEstadisticas()
}

const programarTodasActividades = async () => {
  loadingProgramar.value = true
  try {
    await actividadesStore.programarPlan(plan.value.id)
  } catch (error) {
    // Error manejado en el store
  } finally {
    loadingProgramar.value = false
  }
}

// ✅ GESTIÓN DE GRUPOS - FUNCIONES ACTUALIZADAS

const handleVerGrupo = (grupoMasivoId) => {
  grupoSeleccionado.value = grupoMasivoId
  mostrarVerGrupo.value = true
}

const cerrarVerGrupo = () => {
  mostrarVerGrupo.value = false
  grupoSeleccionado.value = null
}

const handleEditarGrupo = async (grupoMasivoId) => {
  try {
    // Cargar las actividades del grupo
    const response = await api.get(`/plan-actividades/grupo/${grupoMasivoId}`)
    actividadesGrupo.value = response.data
    grupoSeleccionado.value = grupoMasivoId
    mostrarEditarGrupo.value = true
  } catch (error) {
    console.error('Error al cargar actividades del grupo:', error)
    toast.error('Error al cargar las actividades del grupo')
  }
}

const handleEditarGrupoDesdeModal = (grupoMasivoId) => {
  cerrarVerGrupo()
  handleEditarGrupo(grupoMasivoId)
}

const cerrarEditarGrupo = () => {
  mostrarEditarGrupo.value = false
  grupoSeleccionado.value = null
  actividadesGrupo.value = []
}

const handleEliminarGrupo = (grupoMasivoId) => {
  grupoSeleccionado.value = grupoMasivoId
  mostrarConfirmEliminarGrupo.value = true
}

const cerrarConfirmEliminarGrupo = () => {
  mostrarConfirmEliminarGrupo.value = false
  grupoSeleccionado.value = null
}

// ✅ FUNCIÓN CORREGIDA: Guardar cambios del grupo
const guardarCambiosGrupo = async (datosActualizados) => {
  if (!grupoSeleccionado.value) return

  try {
    await api.put(`/plan-actividades/grupo/${grupoSeleccionado.value}`, datosActualizados)

    toast.success(`Grupo actualizado correctamente`)
    cerrarEditarGrupo()
    await planesStore.fetchPlan(route.params.id)
    await cargarEstadisticas()
  } catch (error) {
    console.error('Error al actualizar grupo:', error)
    toast.error(error.response?.data?.message || 'Error al actualizar el grupo')
  }
}

const eliminarGrupo = async () => {
  try {
    const response = await api.delete(`/plan-actividades/grupo/${grupoSeleccionado.value}`)
    
    toast.success(response.data?.message || `Grupo eliminado exitosamente`)
    
    cerrarConfirmEliminarGrupo()
    await planesStore.fetchPlan(route.params.id)
    await cargarEstadisticas()
  } catch (error) {
    console.error('Error al eliminar grupo:', error)
    
    if (error.response?.status === 409) {
      const bloqueadas = error.response.data.actividades_bloqueadas
      if (bloqueadas && bloqueadas.length > 0) {
        const lista = bloqueadas.map(a => `- ${a.nombre} (${a.mantenimientos} mantenimiento(s))`).join('\n')
        toast.error(
          `No se puede eliminar el grupo porque algunas actividades tienen mantenimientos programados:\n${lista}`,
          { timeout: 8000 }
        )
      } else {
        toast.error(error.response.data.message || 'No se puede eliminar el grupo')
      }
    } else {
      toast.error(error.response?.data?.message || 'Error al eliminar el grupo')
    }
  }
}

onMounted(async () => {
  await planesStore.fetchPlan(route.params.id)
  await cargarEstadisticas()
  await cargarDatosFormularios() // ✅ AGREGADO
})
</script>