<!-- ============================================ -->
<!-- src/components/proveedores/ProveedorModal.vue -->
<!-- Modal para crear/editar proveedores con sus contactos -->
<!-- ============================================ -->
<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
      
      <!-- Header -->
      <div class="flex-shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">
          {{ modoEdicion ? 'Editar Proveedor' : 'Nuevo Proveedor' }}
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

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6">
        <form @submit.prevent="guardar" class="space-y-6">
          
          <!-- Información del Proveedor -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold text-gray-900 border-b pb-2">
              Información del Proveedor
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="prov_nombre" class="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Comercial <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="form.nombre"
                  id="prov_nombre"
                  type="text"
                  required
                  maxlength="150"
                  placeholder="Ej: Mantenimientos XYZ"
                  class="input"
                />
              </div>

              <div>
                <label for="prov_nit" class="block text-sm font-medium text-gray-700 mb-1">
                  NIT/RUC <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="form.nit"
                  id="prov_nit"
                  type="text"
                  required
                  maxlength="50"
                  placeholder="Ej: 900123456-1"
                  class="input"
                />
              </div>
            </div>

            <div>
              <label for="prov_razon_social" class="block text-sm font-medium text-gray-700 mb-1">
                Razón Social <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.razon_social"
                id="prov_razon_social"
                type="text"
                required
                maxlength="200"
                placeholder="Ej: Mantenimientos XYZ S.A.S."
                class="input"
              />
            </div>

            <div>
              <label for="prov_especialidad" class="block text-sm font-medium text-gray-700 mb-1">
                Especialidad
              </label>
              <textarea
                v-model="form.especialidad"
                id="prov_especialidad"
                rows="3"
                placeholder="Ej: Mantenimiento eléctrico, mecánico e industrial"
                class="input"
              ></textarea>
            </div>

            <div>
              <label for="prov_periodicidad" class="block text-sm font-medium text-gray-700 mb-1">
                Periodicidad Contractual
              </label>
              <select v-model="form.periodicidad_contractual" id="prov_periodicidad" class="input">
                <option value="">Seleccione periodicidad</option>
                <option value="Mensual">Mensual</option>
                <option value="Trimestral">Trimestral</option>
                <option value="Semestral">Semestral</option>
                <option value="Anual">Anual</option>
                <option value="Por Evento">Por Evento</option>
                <option value="Contrato Indefinido">Contrato Indefinido</option>
              </select>
            </div>

            <div>
              <label for="prov_observaciones" class="block text-sm font-medium text-gray-700 mb-1">
                Observaciones
              </label>
              <textarea
                v-model="form.observaciones"
                id="prov_observaciones"
                rows="3"
                placeholder="Notas adicionales sobre el proveedor..."
                class="input"
              ></textarea>
            </div>
          </div>

          <!-- Contactos -->
          <div class="space-y-4">
            <div class="flex items-center justify-between border-b pb-2">
              <h3 class="text-lg font-semibold text-gray-900">
                Contactos
              </h3>
              <button
                type="button"
                @click="agregarContacto"
                class="btn-secondary text-sm flex items-center gap-1"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Agregar Contacto
              </button>
            </div>

            <div v-if="form.contactos.length === 0" class="text-center py-8 bg-gray-50 rounded-lg">
              <p class="text-gray-600">No hay contactos agregados</p>
              <p class="text-sm text-gray-500 mt-1">Haz clic en "Agregar Contacto" para añadir uno</p>
            </div>

            <div v-else class="space-y-4">
              <div
                v-for="(contacto, index) in form.contactos"
                :key="index"
                class="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50"
              >
                <div class="flex items-center justify-between">
                  <h4 class="font-medium text-gray-900">Contacto {{ index + 1 }}</h4>
                  <button
                    type="button"
                    @click="eliminarContacto(index)"
                    class="text-red-600 hover:text-red-900"
                    title="Eliminar contacto"
                  >
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                      Nombre <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model="contacto.nombre"
                      type="text"
                      required
                      maxlength="100"
                      placeholder="Nombre completo"
                      class="input"
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                      Cargo
                    </label>
                    <input
                      v-model="contacto.cargo"
                      type="text"
                      maxlength="100"
                      placeholder="Ej: Gerente de Operaciones"
                      class="input"
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono
                    </label>
                    <input
                      v-model="contacto.telefono"
                      type="text"
                      maxlength="50"
                      placeholder="Ej: +57 300 123 4567"
                      class="input"
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      v-model="contacto.email"
                      type="email"
                      maxlength="100"
                      placeholder="correo@ejemplo.com"
                      class="input"
                    />
                  </div>
                </div>

                <div>
                  <label class="flex items-center cursor-pointer">
                    <input
                      v-model="contacto.es_principal"
                      type="checkbox"
                      class="form-checkbox h-4 w-4 text-primary-600 rounded"
                    />
                    <span class="ml-2 text-sm text-gray-700">Contacto principal</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

        </form>
      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 bg-gray-50 border-t px-6 py-4 flex items-center justify-end space-x-3">
        <button
          type="button"
          @click="$emit('close')"
          class="btn-secondary"
          :disabled="loading"
        >
          Cancelar
        </button>
        <button
          @click="guardar"
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
            {{ modoEdicion ? 'Actualizar' : 'Crear Proveedor' }}
          </span>
        </button>
      </div>
      
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProveedoresStore } from '@/stores/proveedores'

const props = defineProps({
  proveedor: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'success'])

const proveedoresStore = useProveedoresStore()

const loading = ref(false)
const modoEdicion = computed(() => !!props.proveedor)

// Formulario
const form = ref({
  nombre: '',
  razon_social: '',
  nit: '',
  especialidad: '',
  periodicidad_contractual: '',
  observaciones: '',
  contactos: []
})

// Validaciones
const formularioValido = computed(() => {
  return form.value.nombre.trim() && 
         form.value.razon_social.trim() && 
         form.value.nit.trim()
})

// Métodos
const agregarContacto = () => {
  form.value.contactos.push({
    nombre: '',
    cargo: '',
    telefono: '',
    email: '',
    es_principal: form.value.contactos.length === 0, // Primer contacto es principal por defecto
    activo: true
  })
}

const eliminarContacto = (index) => {
  form.value.contactos.splice(index, 1)
}

const guardar = async () => {
  if (!formularioValido.value) return

  loading.value = true
  try {
    const datos = {
      ...form.value,
      // Filtrar contactos que tengan al menos un nombre
      contactos: form.value.contactos.filter(c => c.nombre.trim())
    }

    if (modoEdicion.value) {
      await proveedoresStore.actualizarProveedor(props.proveedor.id, datos)
    } else {
      await proveedoresStore.crearProveedor(datos)
    }
    
    emit('success')
  } catch (error) {
    // Error manejado por el store
  } finally {
    loading.value = false
  }
}

// Inicializar
onMounted(() => {
  if (modoEdicion.value) {
    // Cargar datos del proveedor para edición
    proveedoresStore.fetchProveedor(props.proveedor.id).then(proveedor => {
      form.value = {
        nombre: proveedor.nombre,
        razon_social: proveedor.razon_social,
        nit: proveedor.nit,
        especialidad: proveedor.especialidad || '',
        periodicidad_contractual: proveedor.periodicidad_contractual || '',
        observaciones: proveedor.observaciones || '',
        contactos: proveedor.contactos || []
      }
    })
  }
})
</script>