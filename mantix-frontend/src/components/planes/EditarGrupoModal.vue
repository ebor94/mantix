<template>
  <div v-if="visible" class="modal-overlay" @click.self="cerrar">
    <div class="modal-container">
      <div class="modal-header">
        <h2>
          <i class="fas fa-layer-group"></i>
          Editar Grupo de Actividades
        </h2>
        <button class="btn-close" @click="cerrar">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="modal-body">
        <!-- Información del grupo -->
        <div class="grupo-info">
          <div class="info-item">
            <i class="fas fa-list"></i>
            <span><strong>{{ actividades.length }}</strong> actividades en este grupo</span>
          </div>
          <div class="info-item">
            <i class="fas fa-hashtag"></i>
            <span>Grupo ID: <strong>{{ grupoMasivoId }}</strong></span>
          </div>
        </div>

        <!-- Formulario de edición masiva -->
        <div class="form-group">
          <label class="form-label required">
            <i class="fas fa-tasks"></i>
            Nombre de la actividad
          </label>
          <input
            v-model="formData.nombre"
            type="text"
            class="form-control"
            placeholder="Ej: Revisión mensual"
          />
        </div>

        <div class="form-group">
          <label class="form-label">
            <i class="fas fa-align-left"></i>
            Descripción
          </label>
          <textarea
            v-model="formData.descripcion"
            class="form-control"
            rows="3"
            placeholder="Descripción detallada de la actividad..."
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">
              <i class="fas fa-calendar-alt"></i>
              Periodicidad
            </label>
            <select v-model="formData.periodicidad_id" class="form-control">
              <option value="">Seleccionar periodicidad</option>
              <option
                v-for="per in periodicidades"
                :key="per.id_periodicidad"
                :value="per.id_periodicidad"
              >
                {{ per.nombre }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label required">
              <i class="fas fa-clock"></i>
              Duración (horas)
            </label>
            <input
              v-model.number="formData.duracion_estimada_horas"
              type="number"
              min="0.5"
              step="0.5"
              class="form-control"
              placeholder="2.5"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label required">
            <i class="fas fa-user-tag"></i>
            Tipo de responsable
          </label>
          <select v-model="formData.responsable_tipo" class="form-control">
            <option value="interno">Interno</option>
            <option value="externo">Externo</option>
          </select>
        </div>

        <div v-if="formData.responsable_tipo === 'externo'" class="form-group">
          <label class="form-label required">
            <i class="fas fa-building"></i>
            Proveedor
          </label>
          <select v-model="formData.responsable_proveedor_id" class="form-control">
            <option value="">Seleccionar proveedor</option>
            <option
              v-for="prov in proveedores"
              :key="prov.id_proveedor"
              :value="prov.id_proveedor"
            >
              {{ prov.nombre }}
            </option>
          </select>
        </div>

        <div v-if="formData.responsable_tipo === 'interno'" class="form-group">
          <label class="form-label required">
            <i class="fas fa-user"></i>
            Usuario responsable
          </label>
          <select v-model="formData.responsable_usuario_id" class="form-control">
            <option value="">Seleccionar usuario</option>
            <option
              v-for="user in usuarios"
              :key="user.id_usuario"
              :value="user.id_usuario"
            >
              {{ user.nombre }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">
            <i class="fas fa-dollar-sign"></i>
            Costo estimado
          </label>
          <input
            v-model.number="formData.costo_estimado"
            type="number"
            min="0"
            step="1000"
            class="form-control"
            placeholder="0"
          />
        </div>

        <div class="form-group">
          <label class="form-label">
            <i class="fas fa-sticky-note"></i>
            Observaciones
          </label>
          <textarea
            v-model="formData.observaciones"
            class="form-control"
            rows="2"
            placeholder="Observaciones adicionales..."
          ></textarea>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              v-model="formData.activo"
              type="checkbox"
              class="form-checkbox"
            />
            <span>Actividad activa</span>
          </label>
        </div>

        <!-- Lista de equipos del grupo (solo lectura) -->
        <div class="equipos-grupo">
          <h3>
            <i class="fas fa-desktop"></i>
            Equipos incluidos ({{ actividades.length }})
          </h3>
          <div class="equipos-list">
            <div
              v-for="actividad in actividades"
              :key="actividad.id_actividad"
              class="equipo-item"
            >
              <i class="fas fa-check-circle text-success"></i>
              <span>{{ actividad.equipo.codigo|| 'Sin equipo' }}/{{ actividad.equipo.nombre|| 'Sin equipo' }}</span>
              
              <span class="equipo-sede">{{ actividad.sede.nombre || 'N/A' }}</span>
            </div>
          </div>
        </div>

        <!-- Nota informativa -->
        <div class="alert alert-info">
          <i class="fas fa-info-circle"></i>
          Los cambios se aplicarán a todas las <strong>{{ actividades.length }} actividades</strong> del grupo.
          Los equipos y sedes no se modificarán.
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="cerrar">
          <i class="fas fa-times"></i>
          Cancelar
        </button>
        <button 
          class="btn btn-primary" 
          @click="guardar"
          :disabled="!formularioValido || guardando"
        >
          <i class="fas fa-spinner fa-spin" v-if="guardando"></i>
          <i class="fas fa-save" v-else></i>
          {{ guardando ? 'Guardando...' : 'Guardar Cambios' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  visible: Boolean,
  actividades: {
    type: Array,
    default: () => []
  },
  periodicidades: {
    type: Array,
    default: () => []
  },
  proveedores: {
    type: Array,
    default: () => []
  },
  usuarios: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['cerrar', 'guardar'])

const formData = ref({
  nombre: '',
  descripcion: '',
  periodicidad_id: '',
  responsable_tipo: 'externo',
  responsable_proveedor_id: '',
  responsable_usuario_id: null,
  duracion_estimada_horas: 1,
  costo_estimado: 0,
  observaciones: '',
  activo: true
})

const guardando = ref(false)

// ID del grupo masivo
const grupoMasivoId = computed(() => {
  return props.actividades.length > 0 ? props.actividades[0].id_grupo : null
})

// Validación del formulario
const formularioValido = computed(() => {
  const tieneNombre = formData.value.nombre?.trim()
  const tienePeriodicidad = formData.value.periodicidad_id
  const tieneDuracion = formData.value.duracion_estimada_horas > 0
  
  const tieneResponsable = formData.value.responsable_tipo === 'externo'
    ? formData.value.responsable_proveedor_id
    : formData.value.responsable_usuario_id

  return tieneNombre && tienePeriodicidad && tieneDuracion && tieneResponsable
})

// Cargar datos cuando se abre el modal
watch(() => props.visible, (newVal) => {
  if (newVal && props.actividades.length > 0) {
    const primera = props.actividades[0]
    formData.value = {
      nombre: primera.nombre || '',
      descripcion: primera.descripcion || '',
      periodicidad_id: primera.periodicidad_id || '',
      responsable_tipo: primera.responsable_tipo || 'externo',
      responsable_proveedor_id: primera.responsable_proveedor_id || '',
      responsable_usuario_id: primera.responsable_usuario_id || null,
      duracion_estimada_horas: primera.duracion_estimada_horas || 1,
      costo_estimado: primera.costo_estimado || 0,
      observaciones: primera.observaciones || '',
      activo: primera.activo !== undefined ? primera.activo : true
    }
  }
})

// Limpiar responsable cuando cambia el tipo
watch(() => formData.value.responsable_tipo, (newTipo) => {
  if (newTipo === 'externo') {
    formData.value.responsable_usuario_id = null
  } else {
    formData.value.responsable_proveedor_id = ''
  }
})

function cerrar() {
  if (!guardando.value) {
    emit('cerrar')
  }
}

async function guardar() {
  if (!formularioValido.value || guardando.value) return

  guardando.value = true
  try {
    // Preparar datos según el tipo de responsable
    const datos = {
      ...formData.value,
      responsable_proveedor_id: formData.value.responsable_tipo === 'externo' 
        ? formData.value.responsable_proveedor_id 
        : null,
      responsable_usuario_id: formData.value.responsable_tipo === 'interno' 
        ? formData.value.responsable_usuario_id 
        : null
    }

    emit('guardar', datos)
  } finally {
    guardando.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-container {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 700px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-header h2 i {
  color: #3b82f6;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #6b7280;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.grupo-info {
  background: #f8fafc;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #475569;
}

.info-item i {
  color: #3b82f6;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #374151;
  font-size: 0.95rem;
}

.form-label.required::after {
  content: '*';
  color: #ef4444;
  margin-left: 4px;
}

.form-label i {
  color: #6b7280;
  font-size: 0.9rem;
}

.form-control {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.95rem;
  transition: all 0.2s;
}

.form-control:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

textarea.form-control {
  resize: vertical;
  font-family: inherit;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.form-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.equipos-grupo {
  margin-top: 24px;
  margin-bottom: 20px;
}

.equipos-grupo h3 {
  font-size: 1rem;
  color: #1f2937;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.equipos-grupo h3 i {
  color: #3b82f6;
}

.equipos-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  background: #f9fafb;
}

.equipo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: white;
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 0.9rem;
}

.equipo-item:last-child {
  margin-bottom: 0;
}

.equipo-item i {
  font-size: 0.85rem;
}

.text-success {
  color: #10b981;
}

.equipo-sede {
  margin-left: auto;
  color: #6b7280;
  font-size: 0.85rem;
}

.alert {
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 0.9rem;
  line-height: 1.5;
}

.alert-info {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
}

.alert i {
  margin-top: 2px;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  font-size: 0.95rem;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover:not(:disabled) {
  background: #e5e7eb;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

/* Scrollbar personalizado */
.equipos-list::-webkit-scrollbar,
.modal-body::-webkit-scrollbar {
  width: 6px;
}

.equipos-list::-webkit-scrollbar-track,
.modal-body::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

.equipos-list::-webkit-scrollbar-thumb,
.modal-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.equipos-list::-webkit-scrollbar-thumb:hover,
.modal-body::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Responsive */
@media (max-width: 640px) {
  .modal-container {
    max-width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .grupo-info {
    flex-direction: column;
    gap: 12px;
  }
}
</style>