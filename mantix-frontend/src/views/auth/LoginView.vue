<!-- src/views/auth/LoginView.vue -->
<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <!-- Logo y Título -->
      <div class="text-center">
        <div
          class="mx-auto h-24 w-24">

          <div class="mx-auto h-40 w-40  flex items-center justify-center mb-6">
            <img class="" src="https://cucuta.losolivos.co/wp-content/uploads/2023/07/Logo-OLIVOS.webp"
              alt="Logo Olivos">
          </div>





        </div>
      <br>
        <p class="mt-2 text-sm text-gray-600">
          Sistema de Gestión de Mantenimiento
        </p>
        <p class="text-xs text-primary-600 font-semibold">
          SERFUNORTE - Los Olivos
        </p>
      </div>

      <!-- Formulario de Login -->
      <div class="mt-8 bg-white py-8 px-6 shadow-2xl rounded-2xl">
        <form class="space-y-6" @submit.prevent="handleLogin">
          <!-- Email -->
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
              Correo Electrónico
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
              <input id="email" v-model="form.email" type="text" required
                class="appearance-none block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="correo@ejemplo.com" />
            </div>
          </div>

          <!-- Password -->
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input id="password" v-model="form.password" :type="showPassword ? 'text' : 'password'" required
                class="appearance-none block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="••••••••" />
              <button type="button" @click="showPassword = !showPassword"
                class="absolute inset-y-0 right-0 pr-3 flex items-center">
                <svg v-if="!showPassword" class="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none"
                  viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24"
                  stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Recordar sesión -->
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <input id="remember-me" v-model="form.rememberMe" type="checkbox"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer" />
              <label for="remember-me" class="ml-2 block text-sm text-gray-700 cursor-pointer">
                Recordar sesión
              </label>
            </div>
          </div>

          <!-- Botón de Login -->
          <div>
            <button type="submit" :disabled="loading"
              class="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-medium text-white bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-600 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
              <svg v-if="loading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg"
                fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                </path>
              </svg>
              {{ loading ? 'Iniciando sesión...' : 'Iniciar Sesión' }}
            </button>
          </div>
        </form>

        <!-- Credenciales de prueba (solo en desarrollo) -->
        <div v-if="isDev" class="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p class="text-xs font-semibold text-yellow-800 mb-2">🔐 Credenciales de prueba:</p>
          <p class="text-xs text-yellow-700">Email: <span class="font-mono">admin@mantix.com</span></p>
          <p class="text-xs text-yellow-700">Password: <span class="font-mono">Admin123!</span></p>
        </div>
      </div>

      <!-- Footer -->
      <p class="text-center text-xs text-gray-500">
        © {{ new Date().getFullYear() }} Mantix - Todos los derechos reservados
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const form = ref({
  email: '',
  password: '',
  rememberMe: false
})

const showPassword = ref(false)
const loading = computed(() => authStore.loading)
const isDev = import.meta.env.DEV

const handleLogin = async () => {
  const success = await authStore.login(form.value.email, form.value.password)

  if (success) {
    router.push({ name: 'Dashboard' })
  }
}
</script>

<style scoped>
/* Animación de entrada */
.min-h-screen>div {
  animation: fadeInUp 0.6s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>