<!-- src/components/solicitudes/CrearSolicitudModal.vue -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Nueva Solicitud R-275</h2>
          <p class="text-sm text-gray-500 mt-1">Solicitud de mantenimiento correctivo</p>
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
        <!-- Información del Solicitante -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Solicitante <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.solicitante"
              type="text"
              required
              placeholder="Nombre del solicitante"
              class="input-field"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Área <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.area"
              type="text"
              required
              placeholder="Área o departamento"
              class="input-field"
            />
          </div>
        </div>

        <!-- Sede y Prioridad -->
        <div class="grid grid-cols-2 gap-4">
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

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Prioridad <span class="text-red-500">*</span>
            </label>
            <select v-model="form.prioridad" required class="input-field">
              <option value="">Seleccionar prioridad</option>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
          </div>
        </div>

        <!-- Descripción del Problema -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Descripción del Problema <span class="text-red-500">*</span>
          </label>
          <textarea
            v-model="form.descripcion"
            rows="5"
            required
            placeholder="Describe detalladamente el problema o necesidad de mantenimiento..."
            class="input-field resize-none"
          ></textarea>
          <p class="text-xs text-gray-500 mt-1">
            {{ form.descripcion.length }}/500 caracteres
          </p>
        </div>

        <!-- Ubicación Específica -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Ubicación Específica
          </label>
          <input
            v-model="form.ubicacion"
            type="text"
            placeholder="Ej: Sala de espera, segundo piso, oficina 201..."
            class="input-field"
          />
        </div>

        <!-- Evidencias Fotográficas -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Evidencias Fotográficas (Opcional)
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
              <span class="block text-sm">Click para subir imágenes del problema</span>
              <span class="block text-xs text-gray-500 mt-1">PNG, JPG hasta 5MB cada una</span>
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

        <!-- Información Adicional -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex items-start space-x-3">
            <svg class="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="text-sm text-blue-800">
              <p class="font-medium mb-1">Importante:</p>
              <ul class="list-disc list-inside space-y-1 text-xs">
                <li>Las solicitudes con prioridad CRÍTICA serán atendidas en menos de 2 horas</li>
                <li>Las solicitudes con prioridad ALTA serán atendidas en menos de 24 horas</li>
                <li>Recibirás notificaciones sobre el estado de tu solicitud</li>
              </ul>
            </div>
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
            {{ loading ? 'Enviando...' : 'Enviar Solicitud' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSolicitudesStore } from '@/stores/solicitudes'
import api from '@/services/api'

const emit = defineEmits(['close', 'success'])

const solicitudesStore = useSolicitudesStore()
const loading = ref(false)
const fileInput = ref(null)
const sedes = ref([])

const form = ref({
  solicitante: '',
  area: '',
  sede_id: '',
  prioridad: '',
  descripcion: '',
  ubicacion: '',
  evidencias: []
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

const handleSubmit = async () => {
  if (form.value.descripcion.length > 500) {
    alert('La descripción no puede exceder los 500 caracteres')
    return
  }

  loading.value = true
  try {
    const formData = new FormData()
    
    formData.append('solicitante', form.value.solicitante)
    formData.append('area', form.value.area)
    formData.append('sede_id', form.value.sede_id)
    formData.append('prioridad', form.value.prioridad)
    formData.append('descripcion', form.value.descripcion)
    formData.append('ubicacion', form.value.ubicacion)
    
    form.value.evidencias.forEach((img) => {
      formData.append('evidencias', img.file)
    })

    await solicitudesStore.crearSolicitud(formData)
    emit('success')
  } catch (error) {
    console.error('Error al crear solicitud:', error)
  } finally {
    loading.value = false
  }
}

const loadSedes = async () => {
  try {
    const response = await api.get('/sedes')
    sedes.value = response
  } catch (error) {
    console.error('Error al cargar sedes:', error)
  }
}

onMounted(() => {
  loadSedes()
})
</script>