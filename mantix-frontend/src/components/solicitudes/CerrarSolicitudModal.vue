<!-- src/components/solicitudes/CerrarSolicitudModal.vue -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-orange-50 border-b border-orange-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-gray-900">Cerrar Solicitud</h2>
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
      <form @submit.prevent="handleCerrar" class="p-6 space-y-6">
        <!-- Información de la Solicitud -->
        <div class="bg-gray-50 rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Solicitud:</span>
            <span class="text-sm font-semibold text-gray-900">#{{ solicitud.id }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Solicitante:</span>
            <span class="text-sm font-semibold text-gray-900">{{ solicitud.solicitante }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Asignado a:</span>
            <span class="text-sm font-semibold text-gray-900">{{ solicitud.asignado_a || 'N/A' }}</span>
          </div>
        </div>

        <!-- Fecha y Hora de Atención -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Fecha de Atención <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.fecha_atencion"
              type="date"
              required
              class="input-field"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Hora de Atención <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.hora_atencion"
              type="time"
              required
              class="input-field"
            />
          </div>
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
            placeholder="60"
            class="input-field"
          />
        </div>

        <!-- Trabajo Realizado -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Trabajo Realizado <span class="text-red-500">*</span>
          </label>
          <textarea
            v-model="form.trabajo_realizado"
            rows="5"
            required
            placeholder="Describe detalladamente el trabajo realizado, reparaciones, ajustes, etc..."
            class="input-field resize-none"
          ></textarea>
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
              <input
                v-model.number="material.costo"
                type="number"
                min="0"
                step="0.01"
                placeholder="Costo"
                class="input-field w-28"
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
              @click="form.materiales.push({ nombre: '', cantidad: 1, costo: 0 })"
              class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center"
            >
              <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Agregar material
            </button>
          </div>
        </div>

        <!-- Evidencias Fotográficas -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Evidencias Fotográficas del Trabajo
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
              <span class="block text-xs text-gray-500 mt-1">PNG, JPG hasta 5MB</span>
            </button>
          </div>

          <!-- Preview de imágenes -->
          <div v-if="form.evidencias.length > 0" class="grid grid-cols-4 gap-4 mt-4">
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

        <!-- Evaluación del Servicio -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-3">
            Evaluación del Servicio <span class="text-red-500">*</span>
          </label>
          <div class="flex items-center space-x-2">
            <button
              v-for="star in 5"
              :key="star"
              type="button"
              @click="form.calificacion = star"
              :class="[
                'text-3xl transition-colors',
                star <= form.calificacion ? 'text-yellow-400' : 'text-gray-300'
              ]"
            >
              ★
            </button>
            <span v-if="form.calificacion > 0" class="text-sm text-gray-600 ml-2">
              {{ form.calificacion }} de 5 estrellas
            </span>
          </div>
        </div>

        <!-- Observaciones Finales -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Observaciones Finales
          </label>
          <textarea
            v-model="form.observaciones"
            rows="3"
            placeholder="Comentarios adicionales, recomendaciones, seguimiento necesario..."
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
            :disabled="loading || form.calificacion === 0"
            class="btn-primary bg-orange-600 hover:bg-orange-700"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ loading ? 'Cerrando...' : 'Cerrar Solicitud' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSolicitudesStore } from '@/stores/solicitudes'
import dayjs from 'dayjs'

const props = defineProps({
  solicitud: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'success'])

const solicitudesStore = useSolicitudesStore()
const loading = ref(false)
const fileInput = ref(null)

const form = ref({
  fecha_atencion: dayjs().format('YYYY-MM-DD'),
  hora_atencion: dayjs().format('HH:mm'),
  tiempo_empleado: null,
  trabajo_realizado: '',
  materiales: [],
  evidencias: [],
  calificacion: 0,
  observaciones: ''
})

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

const handleCerrar = async () => {
  loading.value = true
  try {
    const formData = new FormData()
    
    formData.append('fecha_atencion', form.value.fecha_atencion)
    formData.append('hora_atencion', form.value.hora_atencion)
    formData.append('tiempo_empleado', form.value.tiempo_empleado)
    formData.append('trabajo_realizado', form.value.trabajo_realizado)
    formData.append('materiales', JSON.stringify(form.value.materiales))
    formData.append('calificacion', form.value.calificacion)
    formData.append('observaciones', form.value.observaciones)
    
    form.value.evidencias.forEach((img) => {
      formData.append('evidencias', img.file)
    })

    await solicitudesStore.cerrarSolicitud(props.solicitud.id, formData)
    emit('success')
  } catch (error) {
    console.error('Error al cerrar solicitud:', error)
  } finally {
    loading.value = false
  }
}
</script>