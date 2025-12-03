<!-- src/views/MantenimientoDetalleView.vue -->
<template>
  <MainLayout>
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        <p class="text-gray-500 mt-4">Cargando mantenimiento...</p>
      </div>
    </div>

    <div v-else-if="!mantenimiento" class="text-center py-12">
      <EmptyState
        title="Mantenimiento no encontrado"
        description="El mantenimiento que buscas no existe o fue eliminado"
        icon="wrench"
      />
      <router-link to="/mantenimientos" class="btn-primary mt-4">
        Volver a Mantenimientos
      </router-link>
    </div>

    <div v-else class="space-y-6">
      <!-- Header con Breadcrumb -->
      <div class="flex items-center justify-between">
        <div>
          <nav class="flex items-center space-x-2 text-sm text-gray-500 mb-2">
            <router-link to="/mantenimientos" class="hover:text-primary-600">Mantenimientos</router-link>
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-gray-900">{{ mantenimiento.codigo }}</span>
          </nav>
          <h1 class="text-3xl font-bold text-gray-900">{{ mantenimiento.actividad?.nombre }}</h1>
          <p class="text-gray-500 mt-1">{{ mantenimiento.codigo }}</p>
        </div>
        
        <div class="flex items-center space-x-3">
          <Badge :color="getEstadoColor(mantenimiento.estado?.nombre)" size="lg">
            {{ mantenimiento.estado?.nombre }}
          </Badge>
          <Badge :color="getPrioridadColor(mantenimiento.prioridad)" size="lg">
            {{ mantenimiento.prioridad }}
          </Badge>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Columna Principal -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Información General -->
          <div class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Información General
            </h2>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-600">Sede</label>
                <p class="text-gray-900 font-semibold mt-1">{{ mantenimiento.actividad?.sede?.nombre || 'N/A' }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Categoría</label>
                <p class="text-gray-900 font-semibold mt-1">{{ mantenimiento.actividad?.categoria?.nombre || 'N/A' }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Equipo</label>
                <p class="text-gray-900 font-semibold mt-1">{{ mantenimiento.actividad?.equipo?.nombre || 'N/A' }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Fecha Programada</label>
                <p class="text-gray-900 font-semibold mt-1">{{ formatDate(mantenimiento.fecha_programada) }}</p>
              </div>

              <div>
                <label class="text-sm font-medium text-gray-600">Hora Programada</label>
                <p class="text-gray-900 font-semibold mt-1">{{ mantenimiento.hora_programada || 'N/A' }}</p>
              </div>

              <div>
                <label class="text-sm font-medium text-gray-600">Responsable</label>
                <p class="text-gray-900 font-semibold mt-1">
                  {{ mantenimiento.actividad?.responsable_usuario?.nombre || 
                     mantenimiento.actividad?.responsable_proveedor?.nombre || 'N/A' }}
                </p>
              </div>
            </div>

            <div v-if="mantenimiento.observaciones" class="mt-4 pt-4 border-t border-gray-200">
              <label class="text-sm font-medium text-gray-600">Observaciones</label>
              <p class="text-gray-900 mt-1">{{ mantenimiento.observaciones }}</p>
            </div>
          </div>

          <!-- Ejecución -->
          <div v-if="mantenimiento.ejecucion" class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Ejecución Realizada
            </h2>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium text-gray-600">Fecha de Ejecución</label>
                <p class="text-gray-900 font-semibold mt-1">{{ formatDate(mantenimiento.ejecucion.fecha_ejecucion) }}</p>
              </div>
              
              <div>
                <label class="text-sm font-medium text-gray-600">Duración</label>
                <p class="text-gray-900 font-semibold mt-1">
                  {{ mantenimiento.ejecucion.duracion_horas || 'N/A' }} horas
                </p>
              </div>

              <div>
                <label class="text-sm font-medium text-gray-600">Hora Inicio</label>
                <p class="text-gray-900 font-semibold mt-1">{{ mantenimiento.ejecucion.hora_inicio }}</p>
              </div>

              <div>
                <label class="text-sm font-medium text-gray-600">Hora Fin</label>
                <p class="text-gray-900 font-semibold mt-1">{{ mantenimiento.ejecucion.hora_fin }}</p>
              </div>

              <div class="col-span-2">
                <label class="text-sm font-medium text-gray-600">Ejecutado por</label>
                <p class="text-gray-900 font-semibold mt-1">
                  {{ mantenimiento.ejecucion.nombre_recibe || 
                     mantenimiento.ejecucion.usuario_ejecutor?.nombre || 'N/A' }}
                </p>
              </div>
            </div>

            <div v-if="mantenimiento.ejecucion.trabajo_realizado" class="mt-4 pt-4 border-t border-gray-200">
              <label class="text-sm font-medium text-gray-600">Trabajo Realizado</label>
              <p class="text-gray-900 mt-1 leading-relaxed">{{ mantenimiento.ejecucion.trabajo_realizado }}</p>
            </div>

            <div v-if="mantenimiento.ejecucion.observaciones" class="mt-4">
              <label class="text-sm font-medium text-gray-600">Observaciones</label>
              <p class="text-gray-900 mt-1 leading-relaxed">{{ mantenimiento.ejecucion.observaciones }}</p>
            </div>

            <div v-if="mantenimiento.ejecucion.costo_real" class="mt-4 pt-4 border-t border-gray-200">
              <label class="text-sm font-medium text-gray-600">Costo Real</label>
              <p class="text-2xl font-bold text-primary-600 mt-1">
                {{ formatCurrency(mantenimiento.ejecucion.costo_real) }}
              </p>
            </div>
          </div>

          <!-- Checklist -->
          <div v-if="mantenimiento.ejecucion?.checklist?.length > 0" class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Checklist de Actividades
            </h2>

            <div class="space-y-3">
              <div
                v-for="item in mantenimiento.ejecucion.checklist"
                :key="item.id"
                class="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div
                  :class="[
                    'flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center',
                    item.completada ? 'bg-green-100' : 'bg-gray-100'
                  ]"
                >
                  <svg
                    v-if="item.completada"
                    class="h-3 w-3 text-green-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="flex-1">
                  <p
                    :class="[
                      'text-sm font-medium',
                      item.completada ? 'text-gray-900' : 'text-gray-500'
                    ]"
                  >
                    {{ item.actividad }}
                  </p>
                  <p v-if="item.observacion" class="text-xs text-gray-500 mt-1">
                    {{ item.observacion }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Materiales -->
          <div v-if="mantenimiento.ejecucion?.materiales?.length > 0" class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Materiales Utilizados
            </h2>

            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidad</th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Unit.</th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Total</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="material in mantenimiento.ejecucion.materiales" :key="material.id">
                    <td class="px-4 py-3 text-sm text-gray-900">{{ material.descripcion }}</td>
                    <td class="px-4 py-3 text-sm text-gray-900">{{ material.cantidad }}</td>
                    <td class="px-4 py-3 text-sm text-gray-500">{{ material.unidad }}</td>
                    <td class="px-4 py-3 text-sm text-gray-900 text-right">
                      {{ formatCurrency(material.costo_unitario) }}
                    </td>
                    <td class="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                      {{ formatCurrency(material.costo_total) }}
                    </td>
                  </tr>
                </tbody>
                <tfoot class="bg-gray-50">
                  <tr>
                    <td colspan="4" class="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                      Total:
                    </td>
                    <td class="px-4 py-3 text-sm font-bold text-primary-600 text-right">
                      {{ formatCurrency(totalMateriales) }}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- Evidencias -->
          <div v-if="mantenimiento.ejecucion?.evidencias?.length > 0" class="card">
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <svg class="h-6 w-6 mr-2 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Evidencias Fotográficas
            </h2>

            <!-- Tabs -->
            <div class="border-b border-gray-200 mb-4">
              <nav class="-mb-px flex space-x-8">
                <button
                  v-for="tipo in ['antes', 'durante', 'despues']"
                  :key="tipo"
                  @click="tipoEvidenciaActivo = tipo"
                  :class="[
                    'py-2 px-1 border-b-2 font-medium text-sm transition-colors',
                    tipoEvidenciaActivo === tipo
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  ]"
                >
                  {{ tipo.charAt(0).toUpperCase() + tipo.slice(1) }}
                  <span class="ml-2 text-xs">
                    ({{ evidenciasPorTipo(tipo).length }})
                  </span>
                </button>
              </nav>
            </div>

            <!-- Galería -->
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div
                v-for="evidencia in evidenciasPorTipo(tipoEvidenciaActivo)"
                :key="evidencia.id"
                @click="verEvidencia(evidencia)"
                class="relative group cursor-pointer aspect-square rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <img
                  :src="`http://localhost:3020/${evidencia.ruta_archivo}`"
                  :alt="evidencia.descripcion"
                  class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center">
                  <svg class="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
                <div v-if="evidencia.descripcion" class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2">
                  <p class="text-xs text-white truncate">{{ evidencia.descripcion }}</p>
                </div>
              </div>
            </div>

            <p v-if="evidenciasPorTipo(tipoEvidenciaActivo).length === 0" class="text-center text-gray-500 py-8">
              No hay evidencias de tipo "{{ tipoEvidenciaActivo }}"
            </p>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="lg:col-span-1 space-y-6">
          <!-- Acciones Rápidas -->
          <div class="card">
              <h3 class="text-lg font-bold text-gray-900 mb-4">Acciones</h3>
              <div class="space-y-3">
                <button
                  v-if="!mantenimiento.ejecucion"
                  @click="showEjecutarModal = true"
                  class="w-full btn-primary"
                >
                  <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Ejecutar Mantenimiento
                </button>

                <!-- Botón para generar/ver PDF -->
                <button
                  @click="generarPDF"
                  class="w-full btn-secondary"
                  :disabled="loading"
                >
                  <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  {{ loading ? 'Generando...' : 'Ver PDF' }}
                </button>

                <!-- Botón para descargar PDF -->
           <!--      <button
                  @click="descargarPDF"
                  class="w-full btn-secondary"
                  :disabled="loading"
                >
                  <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Descargar PDF
                </button> -->

                <button
                  @click="$router.push('/mantenimientos')"
                  class="w-full btn-secondary"
                >
                  <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Volver
                </button>
              </div>
            </div>

          <!-- Timeline -->
          <div class="card">
            <h3 class="text-lg font-bold text-gray-900 mb-4">Historial</h3>
            
            <div class="flow-root">
              <ul class="-mb-8 space-y-6">
                <li class="relative">
                  <div class="flex items-start space-x-3">
                    <div class="flex-shrink-0">
                      <span class="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <svg class="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" />
                        </svg>
                      </span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-900">Programado</p>
                      <p class="text-xs text-gray-500">{{ formatDate(mantenimiento.fecha_programada) }}</p>
                    </div>
                  </div>
                </li>

                <li v-if="mantenimiento.ejecucion" class="relative">
                  <div class="flex items-start space-x-3">
                    <div class="flex-shrink-0">
                      <span class="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                        <svg class="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                        </svg>
                      </span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-900">Ejecutado</p>
                      <p class="text-xs text-gray-500">{{ formatDate(mantenimiento.ejecucion.fecha_ejecucion) }}</p>
                    </div>
                  </div>
                </li>

                <li v-if="mantenimiento.reprogramaciones > 0" class="relative">
                  <div class="flex items-start space-x-3">
                    <div class="flex-shrink-0">
                      <span class="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                        <svg class="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
                        </svg>
                      </span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-900">Reprogramado</p>
                      <p class="text-xs text-gray-500">{{ mantenimiento.reprogramaciones }} vez(ces)</p>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <!-- Estadísticas -->
          <div class="card bg-gradient-to-br from-primary-50 to-primary-100">
            <h3 class="text-lg font-bold text-gray-900 mb-4">Resumen</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Estado</span>
                <span class="text-sm font-semibold text-gray-900">{{ mantenimiento.estado?.nombre }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Prioridad</span>
                <span class="text-sm font-semibold text-gray-900 capitalize">{{ mantenimiento.prioridad }}</span>
              </div>
              <div v-if="mantenimiento.ejecucion" class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Checklist</span>
                <span class="text-sm font-semibold text-primary-600">
                  {{ checklistCompletado }}%
                </span>
              </div>
              <div v-if="mantenimiento.ejecucion?.materiales" class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Materiales</span>
                <span class="text-sm font-semibold text-gray-900">
                  {{ mantenimiento.ejecucion.materiales.length }} items
                </span>
              </div>
              <div v-if="mantenimiento.ejecucion?.evidencias" class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Evidencias</span>
                <span class="text-sm font-semibold text-gray-900">
                  {{ mantenimiento.ejecucion.evidencias.length }} fotos
                </span>
              </div>
            </div>
          </div>

          <!-- Información Adicional -->
          <div class="card">
            <h3 class="text-lg font-bold text-gray-900 mb-4">Detalles</h3>
            <div class="space-y-3">
              <div v-if="mantenimiento.created_at">
                <label class="text-xs font-medium text-gray-600">Creado el</label>
                <p class="text-sm text-gray-700">{{ formatDateTime(mantenimiento.created_at) }}</p>
              </div>

              <div v-if="mantenimiento.updated_at">
                <label class="text-xs font-medium text-gray-600">Última actualización</label>
                <p class="text-sm text-gray-700">{{ formatDateTime(mantenimiento.updated_at) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Ejecutar Mantenimiento -->
    <EjecutarMantenimientoModal
      v-if="showEjecutarModal && mantenimiento"
      :mantenimiento="mantenimiento"
      @close="showEjecutarModal = false"
      @success="handleEjecucionSuccess"
    />

    <!-- Modal Ver Evidencia -->
    <div
      v-if="evidenciaActual"
      @click="evidenciaActual = null"
      class="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4 cursor-pointer"
    >
      <div class="max-w-4xl max-h-full">
        <img
          :src="`http://localhost:3020/${evidenciaActual.ruta_archivo}`"
          :alt="evidenciaActual.descripcion"
          class="max-w-full max-h-[90vh] object-contain rounded-lg"
        />
        <p v-if="evidenciaActual.descripcion" class="text-white text-center mt-4 text-sm">
          {{ evidenciaActual.descripcion }}
        </p>
      </div>
    </div>
  </MainLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useMantenimientosStore } from '@/stores/mantenimientos'
import { storeToRefs } from 'pinia'
import MainLayout from '@/components/common/MainLayout.vue'
import Badge from '@/components/common/Badge.vue'
import EmptyState from '@/components/common/EmptyState.vue' // ✅ Correcto
import EjecutarMantenimientoModal from '@/components/mantenimientos/EjecutarMantenimientoModal.vue'
import dayjs from 'dayjs'
import 'dayjs/locale/es'



dayjs.locale('es')

const route = useRoute()
const mantenimientosStore = useMantenimientosStore()

const { mantenimientoActual: mantenimiento, loading } = storeToRefs(mantenimientosStore)

const showEjecutarModal = ref(false)
const tipoEvidenciaActivo = ref('antes')
const evidenciaActual = ref(null)
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3020'
const apiurlPdf = 'http://localhost:3020'

// Computed
const totalMateriales = computed(() => {
  if (!mantenimiento.value?.ejecucion?.materiales) return 0
  return mantenimiento.value.ejecucion.materiales.reduce(
    (sum, m) => sum + parseFloat(m.costo_total || 0),
    0
  )
})

const checklistCompletado = computed(() => {
  if (!mantenimiento.value?.ejecucion?.checklist?.length) return 0
  const completadas = mantenimiento.value.ejecucion.checklist.filter(
    item => item.completada
  ).length
  const total = mantenimiento.value.ejecucion.checklist.length
  return Math.round((completadas / total) * 100)
})

// Methods
const formatDate = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY')
}

const formatDateTime = (date) => {
  if (!date) return 'N/A'
  return dayjs(date).format('DD/MM/YYYY HH:mm')
}

const formatCurrency = (value) => {
  if (!value) return 'N/A'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(value)
}

const getEstadoColor = (estado) => {
  const colors = {
    'Programado': 'blue',
    'En Proceso': 'yellow',
    'Ejecutado': 'green',
    'Atrasado': 'red',
    'Reprogramado': 'orange',
    'Cancelado': 'gray'
  }
  return colors[estado] || 'gray'
}

const getPrioridadColor = (prioridad) => {
  const colors = {
    'baja': 'gray',
    'media': 'blue',
    'alta': 'orange',
    'critica': 'red'
  }
  return colors[prioridad] || 'gray'
}

const evidenciasPorTipo = (tipo) => {
  if (!mantenimiento.value?.ejecucion?.evidencias) return []
  return mantenimiento.value.ejecucion.evidencias.filter(e => e.tipo === tipo)
}

const verEvidencia = (evidencia) => {
  evidenciaActual.value = evidencia
}

const handleEjecucionSuccess = async () => {
  showEjecutarModal.value = false
  // Recargar mantenimiento
  await loadMantenimiento()
}


const loadMantenimiento = async () => {
  const id = route.params.id
  console.log('Cargando mantenimiento con ID:', id)
  await mantenimientosStore.fetchMantenimiento(id)
  console.log('Mantenimiento cargado:', mantenimiento.value)
}

onMounted(() => {
  console.log('MantenimientoDetalleView montado')
  console.log('Parámetro ID:', route.params.id)
  loadMantenimiento()
})

const generarPDF = async () => {
  try {
    loading.value = true;
    
    const response = await fetch(
      `${apiUrl}/mantenimientos/${route.params.id}/pdf`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      // Abrir PDF en nueva pestaña
      window.open(`${apiurlPdf}${data.data.url}`, '_blank');
      
      toast.success('PDF generado exitosamente');
    } else {
      toast.error(data.message || 'Error al generar PDF');
    }
  } catch (error) {
    console.error('Error al generar PDF:', error);
    toast.error('Error al generar el PDF');
  } finally {
    loading.value = false;
  }
};

const descargarPDF = async () => {
  try {
    loading.value = true;
    
    // Crear link temporal para descargar
    const link = document.createElement('a');
    link.href = `${apiUrl}/mantenimientos/${route.params.id}/pdf/descargar`;
    link.download = `mantenimiento_${mantenimiento.value.codigo}.pdf`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Descargando PDF...');
  } catch (error) {
    console.error('Error al descargar PDF:', error);
    toast.error('Error al descargar el PDF');
  } finally {
    loading.value = false;
  }
};
</script>