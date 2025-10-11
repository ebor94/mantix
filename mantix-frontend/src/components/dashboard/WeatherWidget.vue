<!-- ============================================ -->
<!-- src/components/dashboard/WeatherWidget.vue (Opcional) -->
<!-- ============================================ -->
<template>
  <div class="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm opacity-90 mb-1">Cúcuta, Colombia</p>
        <p class="text-4xl font-bold">{{ temperature }}°C</p>
        <p class="text-sm opacity-90 mt-2">{{ condition }}</p>
      </div>
      <div class="text-right">
        <svg class="h-16 w-16 opacity-80" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    </div>
    <div class="mt-4 pt-4 border-t border-white/20 grid grid-cols-3 gap-4 text-center">
      <div>
        <p class="text-xs opacity-75">Humedad</p>
        <p class="text-lg font-semibold">{{ humidity }}%</p>
      </div>
      <div>
        <p class="text-xs opacity-75">Viento</p>
        <p class="text-lg font-semibold">{{ wind }} km/h</p>
      </div>
      <div>
        <p class="text-xs opacity-75">Presión</p>
        <p class="text-lg font-semibold">{{ pressure }} hPa</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// Mock data - integrar con API de clima real si se desea
const temperature = ref(28)
const condition = ref('Parcialmente Nublado')
const humidity = ref(65)
const wind = ref(12)
const pressure = ref(1013)
</script>
