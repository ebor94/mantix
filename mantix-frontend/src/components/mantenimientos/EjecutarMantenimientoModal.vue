<!-- src/components/mantenimientos/EjecutarMantenimientoModal.vue -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Ejecutar Mantenimiento</h2>
          <p class="text-sm text-gray-500 mt-1">{{ mantenimiento.actividad?.nombre }}</p>
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
        <!-- Información del Mantenimiento -->
        <div class="bg-gray-50 rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Sede:</span>
            <span class="text-sm font-semibold text-gray-900">{{ mantenimiento.actividad?.sede?.nombre }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Categoría:</span>
            <span class="text-sm font-semibold text-gray-900">{{ mantenimiento.actividad?.categoria?.nombre }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Fecha Programada:</span>
            <span class="text-sm font-semibold text-gray-900">{{ formatDate(mantenimiento.fecha_programada) }}</span>
          </div>
        </div>

        <!-- Fecha y Hora de Ejecución -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Fecha de Ejecución <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.fecha_ejecucion"
              type="date"
              required
              class="input-field"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Hora de Ejecución <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.hora_ejecucion"
              type="time"
              required
              class="input-field"
            />
          </div>
        </div>

        <!-- Responsable -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Ejecutado por <span class="text-red-500">*</span>
          </label>
          <input
            v-model="form.ejecutado_por"
            type="text"
            required
            placeholder="Nombre del técnico o responsable"
            class="input-field"
          />
        </div>

        <!-- Tiempo Empleado -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Tiempo Empleado (minutos) <span class="text-red-500">*</span>
          </label>
          <input
            v-model.number="form.tiempo_empleado"
            type="number"
            min="1"
            required
            placeholder="120"
            class="input-field"
          />
        </div>

        <!-- Checklist de Actividades -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-3">
            Actividades Realizadas
          </label>
          <div class="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4">
            <div
              v-for="(item, index) in form.checklist"
              :key="index"
              class="flex items-center space-x-3"
            >
              <input
                v-model="item.completado"
                type="checkbox"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label class="text-sm text-gray-700 flex-1">{{ item.actividad }}</label>
            </div>
            <button
              type="button"
              @click="agregarActividad"
              class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center"
            >
              <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Agregar actividad
            </button>
          </div>
        </div>

        <!-- Observaciones -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Observaciones
          </label>
          <textarea
            v-model="form.observaciones"
            rows="4"
            placeholder="Describe el trabajo realizado, hallazgos, recomendaciones..."
            class="input-field resize-none"
          ></textarea>
        </div>

        <!-- Evidencias Fotográficas -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Evidencias Fotográficas
          </label>
          <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors cursor-pointer">
            <input
              type="file"
              ref="fileInput"
              @change="handleFileUpload"
              accept="image/*"
              multiple
              class="hidden"
            />
            <button
              type="button"
              @click="$refs.fileInput.click()"
              class="text-primary-600 hover:text-primary-700 font-medium"
            >
              <svg class="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span class="block text-sm">Click para subir imágenes</span>
              <span class="block text-xs text-gray-500 mt-1">PNG, JPG hasta 5MB cada una</span>
            </button>
          </div>

          <!-- Preview de imágenes -->
          <div v-if="form.evidencias.length > 0" class="grid grid-cols-3 gap-4 mt-4">
            <div
              v-for="(img, index) in form.evidencias"
              :key="index"
              class="relative group"
            >
              <img :src="img.preview" class="h-24 w-full object-cover rounded-lg" />
              <button
                type="button"
                @click="removeImage(index)"
                class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Materiales Utilizados -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Materiales y Repuestos Utilizados
          </label>
          <div class="space-y-2">
            <div
              v-for="(material, index) in form.materiales"
              :key="index"
              class="flex items-center space-x-2"
            >
              <input
                v-model="material.nombre"
                type="text"
                placeholder="Nombre del material"
                class="input-field flex-1"
              />
              <input
                v-model.number="material.cantidad"
                type="number"
                min="1"
                placeholder="Cant"
                class="input-field w-20"
              />
              <button
                type="button"
                @click="form.materiales.splice(index, 1)"
                class="text-red-500 hover:text-red-700"
              >
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              @click="form.materiales.push({ nombre: '', cantidad: 1 })"
              class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center"
            >
              <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Agregar material
            </button>
          </div>
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
            {{ loading ? 'Guardando...' : 'Registrar Ejecución' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useMantenimientosStore } from '@/stores/mantenimientos'
import dayjs from 'dayjs'

const props = defineProps({
  mantenimiento: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

const mantenimientosStore = useMantenimientosStore()
const loading = ref(false)
const fileInput = ref(null)

const form = ref({
  fecha_ejecucion: dayjs().format('YYYY-MM-DD'),
  hora_ejecucion: dayjs().format('HH:mm'),
  ejecutado_por: '',
  tiempo_empleado: null,
  observaciones: '',
  checklist: [
    { actividad: 'Revisión general del equipo', completado: false },
    { actividad: 'Limpieza y lubricación', completado: false },
    { actividad: 'Verificación de funcionamiento', completado: false }
  ],
  evidencias: [],
  materiales: []
})

const formatDate = (date) => {
  return dayjs(date).format('DD/MM/YYYY')
}

const agregarActividad = () => {
  const actividad = prompt('Nombre de la actividad:')
  if (actividad) {
    form.value.checklist.push({ actividad, completado: false })
  }
}

const handleFileUpload = (event) => {
  const files = Array.from(event.target.files)
  files.forEach(file => {
    if (file.size > 5 * 1024 * 1024) {
      alert('El archivo ' + file.name + ' es muy grande. Máximo 5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      form.value.evidencias.push({
        file,
        preview: e.target.result
      })
    }
    reader.readAsDataURL(file)
  })
}

const removeImage = (index) => {
  form.value.evidencias.splice(index, 1)
}

const handleSubmit = async () => {
  loading.value = true
  try {
    const formData = new FormData()
    
    formData.append('fecha_ejecucion', form.value.fecha_ejecucion)
    formData.append('hora_ejecucion', form.value.hora_ejecucion)
    formData.append('ejecutado_por', form.value.ejecutado_por)
    formData.append('tiempo_empleado', form.value.tiempo_empleado)
    formData.append('observaciones', form.value.observaciones || '')
    formData.append('checklist', JSON.stringify(form.value.checklist))
    formData.append('materiales', JSON.stringify(form.value.materiales))
    
    // Agregar evidencias
    form.value.evidencias.forEach((img) => {
      formData.append('evidencias', img.file)
    })

    await mantenimientosStore.ejecutarMantenimiento(props.mantenimiento.id, formData)
    
    emit('close')
    emit('success')
  } catch (error) {
    console.error('Error al ejecutar mantenimiento:', error)
    // El toast ya se muestra en el store
  } finally {
    loading.value = false
  }
}
</script>