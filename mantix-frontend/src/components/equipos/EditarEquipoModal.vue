<!-- src/components/equipos/EditarEquipoModal.vue -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Editar Equipo</h2>
          <p class="text-sm text-gray-500 mt-1">{{ equipo.codigo }} - {{ equipo.nombre }}</p>
        </div>
        <button
          @click="$emit('close')"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <form @submit.prevent="handleSubmit" class="p-6 space-y-6">
        <!-- Información Básica -->
        <div>
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Información Básica</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Código <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.codigo"
                type="text"
                required
                class="input-field"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Nombre <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.nombre"
                type="text"
                required
                class="input-field"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Categoría <span class="text-red-500">*</span>
              </label>
              <select v-model="form.categoria_id" required class="input-field">
                <option value="">Seleccionar categoría</option>
                <option v-for="cat in categorias" :key="cat.id" :value="cat.id">
                  {{ cat.nombre }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Sede <span class="text-red-500">*</span>
              </label>
              <select v-model="form.sede_id" required class="input-field">
                <option value="">Seleccionar sede</option>
                <option v-for="sede in sedes" :key="sede.id" :value="sede.id">
                  {{ sede.nombre }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- Especificaciones Técnicas -->
        <div>
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Especificaciones Técnicas</h3>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Marca</label>
              <input
                v-model="form.marca"
                type="text"
                class="input-field"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Modelo</label>
              <input
                v-model="form.modelo"
                type="text"
                class="input-field"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Número de Serie</label>
              <input
                v-model="form.numero_serie"
                type="text"
                class="input-field"
              />
            </div>
          </div>
        </div>

        <!-- Ubicación -->
        <div>
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Ubicación</h3>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Ubicación Específica
            </label>
            <input
              v-model="form.ubicacion_especifica"
              type="text"
              class="input-field"
            />
          </div>
        </div>

        <!-- Fechas y Valores -->
        <div>
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Información Comercial</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Compra
              </label>
              <input
                v-model="form.fecha_compra"
                type="date"
                class="input-field"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Instalación
              </label>
              <input
                v-model="form.fecha_instalacion"
                type="date"
                class="input-field"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Valor de Compra ($)
              </label>
              <input
                v-model.number="form.valor_compra"
                type="number"
                min="0"
                step="0.01"
                class="input-field"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Vida Útil (años)
              </label>
              <input
                v-model.number="form.vida_util_anos"
                type="number"
                min="1"
                class="input-field"
              />
            </div>
          </div>
        </div>

        <!-- Responsable y Estado -->
        <div>
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Asignación</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Responsable
              </label>
              <select v-model="form.responsable_id" class="input-field">
                <option value="">Sin asignar</option>
                <option v-for="resp in responsables" :key="resp.id" :value="resp.id">
                  {{ resp.nombre }} {{ resp.apellido }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Estado <span class="text-red-500">*</span>
              </label>
              <select v-model="form.estado" required class="input-field">
                <option value="operativo">Operativo</option>
                <option value="en_mantenimiento">En Mantenimiento</option>
                <option value="fuera_servicio">Fuera de Servicio</option>
                <option value="dado_baja">Dado de Baja</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Observaciones -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Observaciones
          </label>
          <textarea
            v-model="form.observaciones"
            rows="3"
            class="input-field resize-none"
          ></textarea>
        </div>

        <!-- Botones -->
        <div class="flex items-center justify-end space-x-3 pt-6 border-t">
          <button
            type="button"
            @click="$emit('close')"
            class="btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="btn-primary"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ loading ? 'Actualizando...' : 'Actualizar Equipo' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useEquiposStore } from '@/stores/equipos'
import api from '@/services/api'
import dayjs from 'dayjs'

const props = defineProps({
  equipo: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

const equiposStore = useEquiposStore()
const loading = ref(false)

const categorias = ref([])
const sedes = ref([])
const responsables = ref([])

const form = ref({
  codigo: '',
  nombre: '',
  categoria_id: '',
  sede_id: '',
  marca: '',
  modelo: '',
  numero_serie: '',
  ubicacion_especifica: '',
  fecha_compra: '',
  fecha_instalacion: '',
  valor_compra: null,
  vida_util_anos: null,
  responsable_id: '',
  estado: 'operativo',
  observaciones: ''
})

const loadFormData = () => {
  form.value = {
    codigo: props.equipo.codigo || '',
    nombre: props.equipo.nombre || '',
    categoria_id: props.equipo.categoria_id || '',
    sede_id: props.equipo.sede_id || '',
    marca: props.equipo.marca || '',
    modelo: props.equipo.modelo || '',
    numero_serie: props.equipo.numero_serie || '',
    ubicacion_especifica: props.equipo.ubicacion_especifica || '',
    fecha_compra: props.equipo.fecha_compra ? dayjs(props.equipo.fecha_compra).format('YYYY-MM-DD') : '',
    fecha_instalacion: props.equipo.fecha_instalacion ? dayjs(props.equipo.fecha_instalacion).format('YYYY-MM-DD') : '',
    valor_compra: props.equipo.valor_compra || null,
    vida_util_anos: props.equipo.vida_util_anos || null,
    responsable_id: props.equipo.responsable_id || '',
    estado: props.equipo.estado || 'operativo',
    observaciones: props.equipo.observaciones || ''
  }
}

const handleSubmit = async () => {
  loading.value = true
  try {
    await equiposStore.actualizarEquipo(props.equipo.id, form.value)
    emit('success')
  } catch (error) {
    console.error('Error al actualizar equipo:', error)
  } finally {
    loading.value = false
  }
}

const loadCatalogos = async () => {
  try {
    const [catRes, sedesRes, respRes] = await Promise.all([
      api.get('/categorias-mantenimiento?activo=true'),
      api.get('/sedes'),
      api.get('/usuarios?rol=tecnico')
    ])
   categorias.value = catRes.data || []
    sedes.value = sedesRes || []
    responsables.value = respRes || []
  } catch (error) {
    console.error('Error al cargar catálogos:', error)
  }
}

watch(() => props.equipo, () => {
  loadFormData()
}, { immediate: true })

onMounted(() => {
  loadCatalogos()
  loadFormData()
})
</script>