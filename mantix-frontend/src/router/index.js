
// ============================================
// src/router/index.js - Configuración de rutas
// ============================================
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    redirect: '/mantenimientos',
    meta: { requiresAuth: true }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/mantenimientos',
    name: 'Mantenimientos',
    component: () => import('@/views/MantenimientosView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/mantenimientos/:id',
    name: 'MantenimientoDetalle',
    component: () => import('@/views/MantenimientoDetalleView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/solicitudes',
    name: 'Solicitudes',
    component: () => import('@/views/SolicitudesView.vue'),
    meta: { requiresAuth: true }
  },
   {
    path: '/solicitudes/:id',
    name: 'SolicitudDetalle',
    component: () => import('@/views/SolicitudDetalleView.vue'),
    meta: { requiresAuth: true }
  }, 
  {
    path: '/equipos',
    name: 'Equipos',
    component: () => import('@/views/EquiposView.vue'),
    meta: { requiresAuth: true }
  },
  {
  path: '/equipos/:id',
  name: 'EquipoDetalle',
  component: () => import('@/views/EquipoDetalleView.vue'),
  meta: { requiresAuth: true }
},
 {
    path: '/reportes',
    name: 'Reportes',
    component: () => import('@/views/ReportesView.vue'),
    meta: { requiresAuth: true }
  }, 
  
/*   {
    path: '/configuracion',
    name: 'Configuracion',
    component: () => import('@/views/ConfiguracionView.vue'),
    meta: { requiresAuth: true }
  }, */
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue')
  },
{
  path: '/planes',
  name: 'Planes',
  component: () => import('@/views/PlanesView.vue'),
  meta: { 
    requiresAuth: true,
    title: 'Planes de Mantenimiento'
  }
},
{
  path: '/planes/:id',
  name: 'PlanDetalle',
  component: () => import('@/views/PlanDetalleView.vue'),
  meta: { 
    requiresAuth: true,
    title: 'Detalle del Plan'
  }
},
{
  path: '/tipos-mantenimiento',
  name: 'tiposMantenimiento',
  component: () => import('@/views/TiposMantenimientoView.vue'),
  meta: { 
    requiresAuth: true,
    title: 'tipos de Mantenimiento'
  }
},
{
  path: '/proveedores',
  name: 'proveedores',
  component: () => import('@/views/ProveedoresView.vue'),
  meta: { 
    requiresAuth: true,
    title: 'Proveedores'
  }
},
{
  path: '/requisitos',
  name: 'requisitos',
  component: () => import('@/views/RequisitosView.vue'),
  meta: { 
    requiresAuth: true,
    title: 'Requisitos de Mantenimiento'
  }
}
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  // Cargar usuario si existe en localStorage
  if (!authStore.user && localStorage.getItem('token')) {
    await authStore.loadUserFromStorage()
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  const isAuthenticated = authStore.isAuthenticated

  if (requiresAuth && !isAuthenticated) {
    // Ruta protegida sin autenticación -> Login
    next({ name: 'Login' })
  } else if (to.name === 'Login' && isAuthenticated) {
    // Ya autenticado intentando ir a login -> Dashboard
    next({ name: 'Dashboard' })
  } else {
    next()
  }
})

export default router