// ============================================
// Registro de códigos de API TRIKIPELUDOS — espejo de spec §9.1.
// Formato: 'TRK-<MÓD>-<NNN>': { metodo, ruta (relativa a /api/trk/v1), descripcion }
// Un código nunca se reutiliza. La prueba config/__tests__/apiCodigos.test.js
// exige que toda ruta tenga código registrado y viceversa.
// ============================================
module.exports = {
  'TRK-AUTH-001': { metodo: 'POST', ruta: '/auth/pin', descripcion: 'Login con PIN de usuario operativo' },
  'TRK-AUTH-002': { metodo: 'GET', ruta: '/auth/usuarios-pin', descripcion: 'Usuarios operativos activos para el selector de login' },
  'TRK-AUTH-003': { metodo: 'GET', ruta: '/auth/yo', descripcion: 'Perfil y permisos TRK de la sesión' },
};
