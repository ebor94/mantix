<!-- src/components/mantenimientos/CalendarioMantenimientos.vue -->
<template>
  <div class="card">
    <!-- Header del Calendario -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold text-gray-900">
        {{ mesActual }}
      </h2>
      <div class="flex items-center space-x-3">
        <button
          @click="mesAnterior"
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          @click="hoy"
          class="px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
        >
          Hoy
        </button>
        <button
          @click="mesSiguiente"
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Días de la semana -->
    <div class="grid grid-cols-7 gap-2 mb-2">
      <div
        v-for="dia in diasSemana"
        :key="dia"
        class="text-center text-sm font-semibold text-gray-600 py-2"
      >
        {{ dia }}
      </div>
    </div>

    <!-- Días del mes -->
    <div class="grid grid-cols-7 gap-2">
      <div
        v-for="(dia, index) in diasDelMes"
        :key="index"
        :class="[
          'min-h-32 p-2 border rounded-lg transition-all',
          dia.esHoy ? 'bg-primary-50 border-primary-300' : 'bg-white border-gray-200',
          dia.esMesActual ? 'text-gray-900' : 'text-gray-400',
          'hover:shadow-md cursor-pointer'
        ]"
        @click="seleccionarDia(dia)"
      >
        <div class="flex items-center justify-between mb-2">
          <span :class="['text-sm font-semibold', dia.esHoy ? 'text-primary-600' : '']">
            {{ dia.numero }}
          </span>
          <span v-if="dia.mantenimientos.length > 0" class="text-xs bg-primary-600 text-white px-2 py-1 rounded-full">
            {{ dia.mantenimientos.length }}
          </span>
        </div>

        <!-- Mantenimientos del día -->
        <div class="space-y-1">
          <div
            v-for="mant in dia.mantenimientos.slice(0, 3)"
            :key="mant.id"
            :class="[
              'text-xs p-2 rounded truncate',
              getEstadoBgClass(mant.estado?.nombre)
            ]"
            :title="mant.actividad?.nombre"
          >
            {{ mant.actividad?.nombre }}
          </div>
          <div
            v-if="dia.mantenimientos.length > 3"
            class="text-xs text-gray-500 text-center py-1"
          >
            +{{ dia.mantenimientos.length - 3 }} más
          </div>
        </div>
      </div>
    </div>

    <!-- Leyenda -->
    <div class="flex items-center justify-center space-x-6 mt-6 pt-6 border-t">
      <div class="flex items-center space-x-2">
        <div class="h-3 w-3 bg-blue-500 rounded"></div>
        <span class="text-sm text-gray-600">Programado</span>
      </div>
      <div class="flex items-center space-x-2">
        <div class="h-3 w-3 bg-orange-500 rounded"></div>
        <span class="text-sm text-gray-600">En Proceso</span>
      </div>
      <div class="flex items-center space-x-2">
        <div class="h-3 w-3 bg-green-500 rounded"></div>
        <span class="text-sm text-gray-600">Ejecutado</span>
      </div>
      <div class="flex items-center space-x-2">
        <div class="h-3 w-3 bg-red-500 rounded"></div>
        <span class="text-sm text-gray-600">Atrasado</span>
      </div>
    </div>
  </div>

  <!-- Modal de detalle del día -->
  <!-- <DiaDetalleModal
    v-if="diaSeleccionado"
    :dia="diaSeleccionado"
    @close="diaSeleccionado = null"
  /> -->
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import dayjs from 'dayjs'
// import isSameDay from 'dayjs/plugin/isSameDay'
// import DiaDetalleModal from './DiaDetalleModal.vue'

dayjs.extend(isSameDay)

const props = defineProps({
  mantenimientos: {
    type: Array,
    default: () => []
  }
})

const fechaActual = ref(dayjs())
const diaSeleccionado = ref(null)

const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const mesActual = computed(() => {
  return fechaActual.value.format('MMMM YYYY')
})

const diasDelMes = computed(() => {
  const primerDia = fechaActual.value.startOf('month')
  const ultimoDia = fechaActual.value.endOf('month')
  const diasDelMesAnterior = primerDia.day()
  const diasDelMesSiguiente = 6 - ultimoDia.day()
  
  const dias = []

  // Días del mes anterior
  for (let i = diasDelMesAnterior - 1; i >= 0; i--) {
    const dia = primerDia.subtract(i + 1, 'day')
    dias.push(crearDia(dia, false))
  }

  // Días del mes actual
  for (let i = 0; i < ultimoDia.date(); i++) {
    const dia = primerDia.add(i, 'day')
    dias.push(crearDia(dia, true))
  }

  // Días del mes siguiente
  for (let i = 0; i < diasDelMesSiguiente; i++) {
    const dia = ultimoDia.add(i + 1, 'day')
    dias.push(crearDia(dia, false))
  }

  return dias
})

const crearDia = (fecha, esMesActual) => {
  const mantenimientosDelDia = props.mantenimientos.filter(m => 
    dayjs(m.fecha_programada).isSame(fecha, 'day')
  )

  return {
    fecha: fecha,
    numero: fecha.date(),
    esMesActual,
    esHoy: fecha.isSame(dayjs(), 'day'),
    mantenimientos: mantenimientosDelDia
  }
}

const mesAnterior = () => {
  fechaActual.value = fechaActual.value.subtract(1, 'month')
}

const mesSiguiente = () => {
  fechaActual.value = fechaActual.value.add(1, 'month')
}

const hoy = () => {
  fechaActual.value = dayjs()
}

const seleccionarDia = (dia) => {
  if (dia.mantenimientos.length > 0) {
    diaSeleccionado.value = dia
  }
}

const getEstadoBgClass = (estado) => {
  const classes = {
    'Programado': 'bg-blue-100 text-blue-800',
    'En Proceso': 'bg-orange-100 text-orange-800',
    'Ejecutado': 'bg-green-100 text-green-800',
    'Atrasado': 'bg-red-100 text-red-800'
  }
  return classes[estado] || 'bg-gray-100 text-gray-800'
}
</script>