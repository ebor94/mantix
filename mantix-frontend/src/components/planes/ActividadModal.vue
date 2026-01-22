<!-- ============================================ -->
<!-- src/components/planes/ActividadModal.vue - ACTUALIZADO -->
<!-- ============================================ -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
      
      <div class="flex-shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
        <h2 class="text-2xl font-bold text-gray-900">
          {{ modoEdicion ? 'Editar Actividad' : 'Nueva Actividad' }}
        </h2>
        <button
          @click="$emit('close')"
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Cerrar modal"
        >
          <svg class="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="overflow-y-auto p-6">
        <form 
          id="actividadForm" 
          @submit.prevent="guardar" 
          class="space-y-6 divide-y divide-gray-200"
        >
          
          <div class="space-y-4 pt-6 first:pt-0">
            <h3 class="text-lg font-semibold text-gray-900">Información Básica</h3>

            <div>
              <label for="act_nombre" class="block text-sm font-medium text-gray-700 mb-1">
                Nombre de la Actividad <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.nombre"
                id="act_nombre"
                type="text"
                required
                placeholder="Ej: Inspección de sistema eléctrico"
                class="input"
                maxlength="200"
              />
            </div>

            <div>
              <label for="act_descripcion" class="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                v-model="form.descripcion"
                id="act_descripcion"
                rows="3"
                placeholder="Describe la actividad de mantenimiento..."
                class="w-full"
              ></textarea>
              <p class="text-xs text-gray-500 mt-1">Opcional. Breve resumen de la tarea a realizar.</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="act_categoria" class="block text-sm font-medium text-gray-700 mb-1">
                  Categoría <span class="text-red-500">*</span>
                </label>
                <select 
                  v-model="form.categoria_id" 
                  id="act_categoria" 
                  required 
                  class="input"
                  @change="cargarRequisitosPorCategoria"
                >
                  <option value="">Seleccione categoría</option>
                  <option v-for="cat in categorias" :key="cat.id" :value="cat.id">
                    {{ cat.nombre }}
                  </option>
                </select>
              </div>

              <div>
                <label for="act_tipo_mantenimiento" class="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Mantenimiento <span class="text-red-500">*</span>
                </label>
                <select v-model="form.tipo_mantenimiento_id" id="act_tipo_mantenimiento" required class="input">
                  <option value="">Seleccione tipo</option>
                  <option v-for="tipo in tiposMantenimiento" :key="tipo.id" :value="tipo.id">
                    {{ tipo.nombre }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- ✅ NUEVA SECCIÓN: REQUISITOS -->
          <div v-if="requisitosCategoria.length > 0" class="space-y-4 pt-6">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-gray-900">
                Requisitos de la Categoría
              </h3>
              <span class="px-3 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                {{ requisitosCategoria.length }} requisito{{ requisitosCategoria.length !== 1 ? 's' : '' }}
              </span>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="flex items-start">
                <svg class="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div class="flex-1">
                  <h4 class="text-sm font-medium text-blue-900 mb-1">
                    Documentación Requerida
                  </h4>
                  <p class="text-xs text-blue-700">
                    Los siguientes requisitos deben cumplirse antes de ejecutar esta actividad de mantenimiento.
                  </p>
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <div
                v-for="requisito in requisitosCategoria"
                :key="requisito.id"
                class="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:bg-primary-50 transition-all"
              >
                <div class="flex items-start space-x-3">
                  <div class="flex-shrink-0 mt-1">
                    <div class="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <svg class="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                  
                  <div class="flex-1 min-w-0">
                    <h5 class="text-sm font-semibold text-gray-900">
                      {{ requisito.nombre }}
                    </h5>
                    
                    <p v-if="requisito.descripcion" class="text-xs text-gray-600 mt-1">
                      {{ requisito.descripcion }}
                    </p>
                    
                    <div v-if="requisito.dependencia" class="mt-2 flex items-center text-xs text-gray-500">
                      <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span class="font-medium">{{ requisito.dependencia.nombre }}</span>
                      <span v-if="requisito.dependencia.descripcion" class="ml-1">
                        - {{ requisito.dependencia.descripcion }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div class="flex items-start">
                <svg class="h-5 w-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p class="text-xs text-yellow-800">
                  <strong>Importante:</strong> Estos requisitos serán validados antes de la ejecución del mantenimiento.
                </p>
              </div>
            </div>
          </div>

          <!-- ✅ MENSAJE SI NO HAY REQUISITOS -->
          <div v-else-if="form.categoria_id && cargandoRequisitos === false" class="space-y-4 pt-6">
            <h3 class="text-lg font-semibold text-gray-900">
              Requisitos de la Categoría
            </h3>
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <svg class="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p class="text-sm text-gray-600">
                Esta categoría no tiene requisitos configurados
              </p>
            </div>
          </div>

          <!-- ✅ LOADER DE REQUISITOS -->
          <div v-if="cargandoRequisitos" class="space-y-4 pt-6">
            <h3 class="text-lg font-semibold text-gray-900">
              Requisitos de la Categoría
            </h3>
            <div class="flex items-center justify-center py-8">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              <span class="ml-3 text-sm text-gray-600">Cargando requisitos...</span>
            </div>
          </div>

          <div class="space-y-4 pt-6">
            <h3 class="text-lg font-semibold text-gray-900">Ubicación</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="act_sede" class="block text-sm font-medium text-gray-700 mb-1">
                  Sede <span class="text-red-500">*</span>
                </label>
                <select v-model="form.sede_id" id="act_sede" required class="input" @change="cargarEquiposPorSede">
                  <option value="">Seleccione sede</option>
                  <option v-for="sede in sedes" :key="sede.id" :value="sede.id">
                    {{ sede.nombre }}
                  </option>
                </select>
              </div>

              <div>
                <label for="act_equipo" class="block text-sm font-medium text-gray-700 mb-1">
                  Equipo
                </label>
                <select v-model="form.equipo_id" id="act_equipo" class="input" :disabled="!form.sede_id">
                  <option value="">Seleccione equipo</option>
                  <option v-for="equipo in equiposFiltrados" :key="equipo.id" :value="equipo.id">
                    {{ equipo.codigo }} - {{ equipo.nombre }}
                  </option>
                </select>
                <p v-if="!form.sede_id" class="text-xs text-gray-500 mt-1">
                  Seleccione primero una sede
                </p>
              </div>
            </div>
          </div>

          <div class="space-y-4 pt-6">
            <h3 class="text-lg font-semibold text-gray-900">Programación</h3>

            <div>
              <label for="act_periodicidad" class="block text-sm font-medium text-gray-700 mb-1">
                Periodicidad <span class="text-red-500">*</span>
              </label>
              <select v-model="form.periodicidad_id" id="act_periodicidad" required class="input">
                <option value="">Seleccione periodicidad</option>
                <option v-for="per in periodicidades" :key="per.id" :value="per.id">
                  {{ per.nombre }} (cada {{ per.dias }} días)
                </option>
              </select>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="act_duracion" class="block text-sm font-medium text-gray-700 mb-1">
                  Duración Estimada (horas)
                </label>
                <input
                  v-model.number="form.duracion_estimada_horas"
                  id="act_duracion"
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Ej: 2.5"
                  class="input"
                />
              </div>

              <div>
                <label for="act_costo" class="block text-sm font-medium text-gray-700 mb-1">
                  Costo Estimado
                </label>
                <input
                  v-model.number="form.costo_estimado"
                  id="act_costo"
                  type="number"
                  step="1000"
                  min="0"
                  placeholder="Ej: 150000"
                  class="input"
                />
              </div>
            </div>
          </div>

          <div class="space-y-4 pt-6">
            <h3 class="text-lg font-semibold text-gray-900">Responsable</h3>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Responsable <span class="text-red-500">*</span>
              </label>
              <div class="flex space-x-4 pt-1">
                <label for="act_resp_interno" class="flex items-center cursor-pointer">
                  <input
                    v-model="form.responsable_tipo"
                    id="act_resp_interno"
                    type="radio"
                    value="interno"
                    class="form-radio h-4 w-4 text-primary-600"
                  />
                  <span class="ml-2 text-sm text-gray-700">Interno</span>
                </label>
                <label for="act_resp_externo" class="flex items-center cursor-pointer">
                  <input
                    v-model="form.responsable_tipo"
                    id="act_resp_externo"
                    type="radio"
                    value="externo"
                    class="form-radio h-4 w-4 text-primary-600"
                  />
                  <span class="ml-2 text-sm text-gray-700">Proveedor</span>
                </label>
              </div>
            </div>

            <div v-if="form.responsable_tipo === 'interno'">
              <label for="act_resp_usuario" class="block text-sm font-medium text-gray-700 mb-1">
                Usuario Responsable <span class="text-red-500">*</span>
              </label>
              <select v-model="form.responsable_usuario_id" id="act_resp_usuario" required class="input">
                <option value="">Seleccione usuario</option>
                <option v-for="usuario in usuarios" :key="usuario.id" :value="usuario.id">
                  {{ usuario.nombre }} {{ usuario.apellido }}
                </option>
              </select>
            </div>

            <div v-if="form.responsable_tipo === 'externo'">
              <label for="act_resp_proveedor" class="block text-sm font-medium text-gray-700 mb-1">
                Proveedor <span class="text-red-500">*</span>
              </label>
              <select v-model="form.responsable_proveedor_id" id="act_resp_proveedor" required class="input">
                <option value="">Seleccione proveedor</option>
                <option v-for="proveedor in proveedores" :key="proveedor.id" :value="proveedor.id">
                  {{ proveedor.nombre }}
                </option>
              </select>
            </div>
          </div>

          <div class="space-y-2 pt-6">
            <label for="act_observaciones" class="block text-sm font-medium text-gray-700 mb-1">
              Observaciones
            </label>
            <textarea
              v-model="form.observaciones"
              id="act_observaciones"
              rows="3"
              placeholder="Notas adicionales sobre la actividad..."
              class="w-full"
            ></textarea>
            <p class="text-xs text-gray-500 mt-1">Opcional. Cualquier nota adicional, advertencia o consideración especial.</p>
          </div>

          <div v-if="modoEdicion" class="pt-6">
            <div class="bg-gray-50 rounded-lg p-4">
              <label for="act_activo" class="flex items-center cursor-pointer">
                <input
                  v-model="form.activo"
                  id="act_activo"
                  type="checkbox"
                  class="form-checkbox h-5 w-5 text-primary-600 rounded focus:ring-primary-500"
                />
                <span class="ml-3 text-sm font-medium text-gray-900">
                  Actividad activa
                </span>
              </label>
              <p class="text-xs text-gray-500 mt-2">
                Las actividades inactivas no generan mantenimientos programados
              </p>
            </div>
          </div>

        </form>
      </div>

      <div class="flex-shrink-0 bg-white border-t px-6 py-4 flex items-center justify-end space-x-3 z-10">
        <button
          type="button"
          @click="$emit('close')"
          class="btn-secondary"
          :disabled="loading"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="actividadForm"  
          class="btn-primary"
          :disabled="loading || !formularioValido"
        >
          <span v-if="loading" class="flex items-center">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Guardando...
          </span>
          <span v-else>
            {{ modoEdicion ? 'Actualizar Actividad' : 'Crear Actividad' }}
          </span>
        </button>
      </div>
      
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { usePlanActividadesStore } from '@/stores/planActividades'
import api from '@/services/api'
import { useToast } from 'vue-toastification'

const props = defineProps({
  planId: {
    type: Number,
    required: true
  },
  actividad: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const toast = useToast()
const actividadesStore = usePlanActividadesStore()

const loading = ref(false)
const modoEdicion = computed(() => !!props.actividad)

// Catálogos
const categorias = ref([])
const tiposMantenimiento = ref([])
const sedes = ref([])
const equipos = ref([])
const equiposFiltrados = ref([])
const periodicidades = ref([])
const usuarios = ref([])
const proveedores = ref([])

// ✅ NUEVO: Requisitos
const requisitosCategoria = ref([])
const cargandoRequisitos = ref(false)

// Formulario
const form = ref({
  plan_id: props.planId,
  nombre: '',
  descripcion: '',
  categoria_id: '',
  tipo_mantenimiento_id: '',
  sede_id: '',
  equipo_id: '',
  periodicidad_id: '',
  responsable_tipo: 'interno',
  responsable_usuario_id: '',
  responsable_proveedor_id: '',
  duracion_estimada_horas: null,
  costo_estimado: null,
  observaciones: '',
  activo: true
})

// Validación
const formularioValido = computed(() => {
  const basico = form.value.nombre && 
                 form.value.categoria_id && 
                 form.value.tipo_mantenimiento_id &&
                 form.value.sede_id &&
                 form.value.periodicidad_id

  const responsable = form.value.responsable_tipo === 'interno' 
    ? form.value.responsable_usuario_id 
    : form.value.responsable_proveedor_id

  return basico && responsable
})

// Métodos
const cargarCatalogos = async () => {
  try {
    const [catRes, tiposRes, sedesRes, equiposRes, perRes, usuariosRes, provRes] = await Promise.all([
      api.get('/categorias-mantenimiento?activo=true'),
      api.get('/tipos-mantenimiento'),
      api.get('/sedes'),
      api.get('/equipos'),
      api.get('/periodicidades'),
      api.get('/usuarios'),
      api.get('/proveedores')
    ])

    categorias.value = catRes.data || catRes
    tiposMantenimiento.value = tiposRes.data || tiposRes
    sedes.value = sedesRes || sedesRes.data
    equipos.value = equiposRes || equiposRes.data
    periodicidades.value = perRes.data || perRes
    usuarios.value = usuariosRes || usuariosRes.data
    proveedores.value = provRes || provRes

  } catch (error) {
    console.error('Error al cargar catálogos:', error)
    toast.error('Error al cargar los catálogos')
  }
}

// ✅ NUEVO: Cargar requisitos por categoría
const cargarRequisitosPorCategoria = async () => {
  if (!form.value.categoria_id) {
    requisitosCategoria.value = []
    return
  }

  cargandoRequisitos.value = true
  try {
    const response = await api.get(`/requisitos/categoria/${form.value.categoria_id}?activo=true`)
    requisitosCategoria.value = response.data || response
    
    if (requisitosCategoria.value.length > 0) {
      toast.info(`Se encontraron ${requisitosCategoria.value.length} requisito(s) para esta categoría`)
    }
  } catch (error) {
    console.error('Error al cargar requisitos:', error)
    toast.error('Error al cargar los requisitos de la categoría')
    requisitosCategoria.value = []
  } finally {
    cargandoRequisitos.value = false
  }
}

const cargarEquiposPorSede = () => {
  if (form.value.sede_id) {
   equiposFiltrados.value = equipos.value.filter(e => 
  e.sede_id === form.value.sede_id && 
  e.categoria_id === form.value.categoria_id
)
  } else {
    equiposFiltrados.value = []
  }
  
  if (form.value.equipo_id && !equiposFiltrados.value.find(e => e.id === form.value.equipo_id)) {
    form.value.equipo_id = ''
  }
}

const guardar = async () => {
  console.log('Guardando actividad con datos:', form.value)
  if (!formularioValido.value) return

  loading.value = true
  try {
    const datos = { ...form.value }
    if (datos.responsable_tipo === 'interno') {
      datos.responsable_proveedor_id = null
    } else {
      datos.responsable_usuario_id = null
    }

    if (modoEdicion.value) {
      await actividadesStore.actualizarActividad(props.actividad.id, datos)
    } else {
      await actividadesStore.crearActividad(datos)
    }
    emit('success')
  } catch (error) {
    // Error manejado en el store
  } finally {
    loading.value = false
  }
}

// Inicializar
onMounted(async () => {
  await cargarCatalogos()

  if (modoEdicion.value) {
    form.value = {
      plan_id: props.planId,
      nombre: props.actividad.nombre,
      descripcion: props.actividad.descripcion || '',
      categoria_id: props.actividad.categoria_id,
      tipo_mantenimiento_id: props.actividad.tipo_mantenimiento_id,
      sede_id: props.actividad.sede_id,
      equipo_id: props.actividad.equipo_id || '',
      periodicidad_id: props.actividad.periodicidad_id,
      responsable_tipo: props.actividad.responsable_tipo,
      responsable_usuario_id: props.actividad.responsable_usuario_id || '',
      responsable_proveedor_id: props.actividad.responsable_proveedor_id || '',
      duracion_estimada_horas: props.actividad.duracion_estimada_horas,
      costo_estimado: props.actividad.costo_estimado,
      observaciones: props.actividad.observaciones || '',
      activo: props.actividad.activo
    }
    
    if (form.value.sede_id) {
      cargarEquiposPorSede()
    }

    // ✅ Cargar requisitos si hay categoría
    if (form.value.categoria_id) {
      await cargarRequisitosPorCategoria()
    }
  }
})
</script>