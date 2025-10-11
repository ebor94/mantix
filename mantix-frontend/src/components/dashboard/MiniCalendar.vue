<!-- ============================================ -->
<!-- src/components/dashboard/MiniCalendar.vue -->
<!-- ============================================ -->
<template>
  <div class="card">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900">Calendario</h3>
      <div class="flex items-center space-x-2">
        <button
          @click="previousMonth"
          class="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <svg class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span class="text-sm font-medium text-gray-700 min-w-[120px] text-center">
          {{ currentMonthYear }}
        </span>
        <button
          @click="nextMonth"
          class="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <svg class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-7 gap-1 mb-2">
      <div
        v-for="day in daysOfWeek"
        :key="day"
        class="text-center text-xs font-medium text-gray-500 py-2"
      >
        {{ day }}
      </div>
    </div>

    <div class="grid grid-cols-7 gap-1">
      <div
        v-for="(day, index) in calendarDays"
        :key="index"
        :class="[
          'aspect-square p-1 text-center text-sm rounded-lg transition-colors relative',
          day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400',
          day.isToday ? 'bg-primary-100 font-bold text-primary-700' : '',
          day.hasEvents ? 'cursor-pointer hover:bg-gray-100' : '',
          !day.isCurrentMonth ? 'opacity-50' : ''
        ]"
        @click="day.hasEvents && selectDay(day)"
      >
        <span>{{ day.day }}</span>
        <div v-if="day.hasEvents" class="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex space-x-1">
          <div
            v-for="i in Math.min(day.eventCount, 3)"
            :key="i"
            class="h-1 w-1 rounded-full bg-primary-500"
          ></div>
        </div>
      </div>
    </div>

    <div v-if="selectedDate" class="mt-4 pt-4 border-t border-gray-200">
      <p class="text-sm font-medium text-gray-700 mb-2">
        Eventos del {{ selectedDate }}
      </p>
      <div class="space-y-2">
        <div
          v-for="event in selectedDayEvents"
          :key="event.id"
          class="text-xs bg-primary-50 text-primary-700 px-3 py-2 rounded-lg"
        >
          {{ event.title }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import dayjs from 'dayjs'

const currentDate = ref(dayjs())
const selectedDate = ref(null)

const daysOfWeek = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

// Mock events - reemplazar con datos reales
const events = ref([
  { id: 1, date: dayjs().format('YYYY-MM-DD'), title: 'Mantenimiento AC' },
  { id: 2, date: dayjs().add(2, 'day').format('YYYY-MM-DD'), title: 'Revisión Extractores' },
  { id: 3, date: dayjs().add(5, 'day').format('YYYY-MM-DD'), title: 'Solicitud R-275' }
])

const currentMonthYear = computed(() => {
  return currentDate.value.format('MMMM YYYY')
})

const calendarDays = computed(() => {
  const startOfMonth = currentDate.value.startOf('month')
  const endOfMonth = currentDate.value.endOf('month')
  const startDay = startOfMonth.day()
  const daysInMonth = endOfMonth.date()
  
  const days = []
  
  // Días del mes anterior
  for (let i = startDay - 1; i >= 0; i--) {
    const date = startOfMonth.subtract(i + 1, 'day')
    days.push({
      day: date.date(),
      date: date.format('YYYY-MM-DD'),
      isCurrentMonth: false,
      isToday: false,
      hasEvents: false,
      eventCount: 0
    })
  }
  
  // Días del mes actual
  for (let i = 1; i <= daysInMonth; i++) {
    const date = startOfMonth.date(i)
    const dateStr = date.format('YYYY-MM-DD')
    const dayEvents = events.value.filter(e => e.date === dateStr)
    
    days.push({
      day: i,
      date: dateStr,
      isCurrentMonth: true,
      isToday: date.isSame(dayjs(), 'day'),
      hasEvents: dayEvents.length > 0,
      eventCount: dayEvents.length
    })
  }
  
  // Días del mes siguiente para completar la grilla
  const remainingDays = 42 - days.length
  for (let i = 1; i <= remainingDays; i++) {
    const date = endOfMonth.add(i, 'day')
    days.push({
      day: date.date(),
      date: date.format('YYYY-MM-DD'),
      isCurrentMonth: false,
      isToday: false,
      hasEvents: false,
      eventCount: 0
    })
  }
  
  return days
})

const selectedDayEvents = computed(() => {
  if (!selectedDate.value) return []
  return events.value.filter(e => e.date === selectedDate.value)
})

const previousMonth = () => {
  currentDate.value = currentDate.value.subtract(1, 'month')
  selectedDate.value = null
}

const nextMonth = () => {
  currentDate.value = currentDate.value.add(1, 'month')
  selectedDate.value = null
}

const selectDay = (day) => {
  selectedDate.value = day.date
}
</script>
