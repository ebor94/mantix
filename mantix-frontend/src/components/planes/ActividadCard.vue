<!-- ============================================ -->
<!-- src/components/planes/ActividadCard.vue - CORREGIDO -->
<!-- ============================================ -->
<template>
  <div class="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
    <div class="flex items-start justify-between">
      <!-- Contenido principal -->
      <div class="flex-1">
        <div class="flex items-center space-x-3 mb-2">
          <h3 class="text-lg font-semibold text-gray-900">{{ actividad.nombre }}</h3>
          <Badge :color="actividad.activo ? 'green' : 'gray'" size="sm">
            {{ actividad.activo ? 'Activa' : 'Inactiva' }}
          </Badge>
          <Badge v-if="actividad.categoria" :color="getCategoryColor(actividad.categoria.color)">
            {{ actividad.categoria.nombre }}
          </Badge>
          
          <!-- ✅ NUEVO: Badge de grupo masivo -->
          <Badge 
            v-if="actividad.grupo_masivo_id" 
            color="blue"
            size="sm"
            :title="`Grupo: ${actividad.grupo_masivo_id}`"
          >
            <svg class="inline h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Grupo
          </Badge>
        </div>

        <p v-if="actividad.descripcion" class="text-gray-600 text-sm mb-3 line-clamp-2">
          {{ actividad.descripcion }}
        </p>

        <!-- Info grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span class="text-gray-500">Sede:</span>
            <p class="font-medium text-gray-900">{{ actividad.sede?.nombre || 'N/A' }}</p>
          </div>
          <div>
            <span class="text-gray-500">Equipo:</span>
            <p class="font-medium text-gray-900">{{ equipoNombre }}</p>
          </div>
          <div>
            <span class="text-gray-500">Responsable:</span>
            <p class="font-medium text-gray-900">{{ responsable }}</p>
          </div>
          <div>
            <span class="text-gray-500">Costo estimado:</span>
            <p class="font-medium text-primary-600">
              {{ formatCurrency(actividad.costo_estimado) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Menú de acciones -->
      <div class="relative ml-4" ref="menuContainer">
        <button
          @click.stop="toggleMenu"
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="h-5 w-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        <!-- Dropdown menu -->
        <Transition
          enter-active-class="transition ease-out duration-100"
          enter-from-class="transform opacity-0 scale-95"
          enter-to-class="transform opacity-100 scale-100"
          leave-active-class="transition ease-in duration-75"
          leave-from-class="transform opacity-100 scale-100"
          leave-to-class="transform opacity-0 scale-95"
        >
          <div
            v-if="mostrarMenu"
            class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-10"
          >
            <!-- ✅ NUEVO: Opciones para grupos masivos -->
            <template v-if="actividad.grupo_masivo_id">
              <button
                @click="handleVerGrupo"
                class="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center"
              >
                <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Ver actividades del grupo
              </button>

              <button
                @click="handleEditarGrupo"
                class="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center"
              >
                <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar grupo completo
              </button>

              <hr class="my-1">
            </template>

            <!-- Opciones individuales -->
            <button
              @click="handleEditar"
              class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
            >
              <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar actividad
            </button>

            <button
              @click="handleToggle"
              class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
            >
              <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              {{ actividad.activo ? 'Desactivar' : 'Activar' }}
            </button>

            <button
              @click="handleProgramar"
              class="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center"
            >
              <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Programar Mantenimientos
            </button>

            <hr class="my-1">

            <!-- ✅ Eliminar individual o grupo -->
            <button
              v-if="actividad.grupo_masivo_id"
              @click="handleEliminarGrupo"
              class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
            >
              <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Eliminar grupo completo
            </button>

            <button
              @click="handleEliminar"
              class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
            >
              <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Eliminar solo esta actividad
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Badge from '@/components/common/Badge.vue'
import { useEquiposStore } from '@/stores/equipos'
import { useProveedoresStore } from '@/stores/proveedores'

const equiposStore = useEquiposStore()
const proveedorStore = useProveedoresStore()

const props = defineProps({
  actividad: {
    type: Object,
    required: true
  }
})

const emit = defineEmits([
  'editar', 
  'eliminar', 
  'toggle', 
  'programar',
  'ver-grupo',
  'editar-grupo',
  'eliminar-grupo'
])

const equipoNombre = ref('Cargando...')
const responsableNombre = ref('Cargando...')
const mostrarMenu = ref(false)
const menuContainer = ref(null)

// ✅ Computed para responsable
const responsable = computed(() => responsableNombre.value)

// ✅ Handlers de acciones
const toggleMenu = () => {
  mostrarMenu.value = !mostrarMenu.value
}

const cerrarMenu = () => {
  mostrarMenu.value = false
}

const handleEditar = () => {
  emit('editar', props.actividad)
  cerrarMenu()
}

const handleToggle = () => {
  emit('toggle', props.actividad)
  cerrarMenu()
}

const handleProgramar = () => {
  emit('programar', props.actividad)
  cerrarMenu()
}

const handleEliminar = () => {
  emit('eliminar', props.actividad)
  cerrarMenu()
}

// ✅ NUEVOS: Handlers para grupos
const handleVerGrupo = () => {
  emit('ver-grupo', props.actividad.grupo_masivo_id)
  cerrarMenu()
}

const handleEditarGrupo = () => {
  emit('editar-grupo', props.actividad.grupo_masivo_id)
  cerrarMenu()
}

const handleEliminarGrupo = () => {
  emit('eliminar-grupo', props.actividad.grupo_masivo_id)
  cerrarMenu()
}

// ✅ Click outside handler
const handleClickOutside = (event) => {
  if (menuContainer.value && !menuContainer.value.contains(event.target)) {
    cerrarMenu()
  }
}

const getCategoryColor = (color) => {
  const colorMap = {
    '#4299e1': 'blue',
    '#48bb78': 'green',
    '#ed8936': 'orange',
    '#9f7aea': 'purple',
    '#f56565': 'red',
    '#ecc94b': 'yellow'
  }
  return colorMap[color] || 'gray'
}

// ✅ Cargar nombre del equipo
const cargarNombreEquipo = async () => {
  const id = props.actividad.equipo_id
  
  if (!id) {
    equipoNombre.value = 'Sin equipo'
    return
  }

  try {
    const equipo = await equiposStore.fetchEquipo(id)
    equipoNombre.value = equipo?.nombre || 'N/A'
  } catch (e) {
    console.error("Error al cargar el nombre del equipo:", e)
    equipoNombre.value = 'Error de carga'
  }
}

// ✅ Cargar responsable (corregido)
const cargarResponsable = async () => {
  try {
    // Si es responsable externo (proveedor)
    if (props.actividad.responsable_tipo === 'externo' && props.actividad.responsable_proveedor_id) {
      const proveedor = await proveedorStore.fetchProveedor(props.actividad.responsable_proveedor_id)
      responsableNombre.value = proveedor?.nombre || 'Sin asignar'
      return
    }
    
    // Si es responsable interno (usuario)
    if (props.actividad.responsable_tipo === 'interno' && props.actividad.responsable_usuario) {
      const { nombre, apellido } = props.actividad.responsable_usuario
      responsableNombre.value = `${nombre} ${apellido || ''}`.trim()
      return
    }

    // Si tiene responsable_usuario_id pero no está cargado en la relación
    if (props.actividad.responsable_usuario_id && !props.actividad.responsable_usuario) {
      responsableNombre.value = 'Cargando...'
      return
    }

    responsableNombre.value = 'Sin asignar'
  } catch (error) {
    console.error("Error al cargar responsable:", error)
    responsableNombre.value = 'Error al cargar'
  }
}

const formatCurrency = (value) => {
  if (!value) return '$0'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(value)
}

// ✅ Lifecycle hooks
onMounted(async () => {
  // Cargar datos en paralelo
  await Promise.all([
    cargarNombreEquipo(),
    cargarResponsable()
  ])
  
  // Agregar listener global para cerrar menú al hacer click fuera
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  // Limpiar listener al desmontar componente
  document.removeEventListener('click', handleClickOutside)
})
</script>