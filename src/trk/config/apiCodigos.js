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
  'TRK-USR-001': { metodo: 'GET', ruta: '/usuarios', descripcion: 'Lista usuarios operativos (cabina, comentarista, jurados)' },
  'TRK-USR-002': { metodo: 'POST', ruta: '/usuarios', descripcion: 'Crea usuario operativo y devuelve su PIN una vez' },
  'TRK-USR-003': { metodo: 'PATCH', ruta: '/usuarios/:id', descripcion: 'Edita nombre/activo de un usuario operativo' },
  'TRK-USR-004': { metodo: 'POST', ruta: '/usuarios/:id/pin', descripcion: 'Regenera PIN e invalida sesiones' },
  'TRK-IMP-001': { metodo: 'POST', ruta: '/import/preview', descripcion: 'Vista previa del CSV con advertencias (no guarda)' },
  'TRK-IMP-002': { metodo: 'POST', ruta: '/import/confirm', descripcion: 'Confirma la importación con decisiones del admin' },
  'TRK-CAT-005': { metodo: 'GET', ruta: '/categorias', descripcion: 'Lista categorías con estado y rúbrica' },
  'TRK-PAR-001': { metodo: 'GET', ruta: '/participantes', descripcion: 'Listado filtrado; campos según rol' },
  'TRK-PAR-002': { metodo: 'GET', ruta: '/participantes/:id', descripcion: 'Detalle; campos según rol' },
  'TRK-PAR-003': { metodo: 'POST', ruta: '/participantes', descripcion: 'Alta de último minuto (cabina/admin)' },
  'TRK-PAR-004': { metodo: 'PATCH', ruta: '/participantes/:id', descripcion: 'Edición; categoría directa o propuesta' },
  'TRK-PAR-005': { metodo: 'POST', ruta: '/participantes/:id/foto', descripcion: 'Sube foto oficial y marca PRESENTE' },
  'TRK-PAR-006': { metodo: 'POST', ruta: '/participantes/:id/fusionar', descripcion: 'Fusiona el registro (origen) en destino_id' },
  'TRK-PAR-007': { metodo: 'POST', ruta: '/participantes/:id/categoria/confirmar', descripcion: 'Confirma categoría propuesta; borra calificaciones' },
  'TRK-PAR-008': { metodo: 'PATCH', ruta: '/participantes/:id/estado', descripcion: 'Marca o desmarca AUSENTE' },
  'TRK-PAS-001': { metodo: 'POST', ruta: '/pasarela/:id', descripcion: 'Pone una mascota en pasarela' },
  'TRK-PAS-002': { metodo: 'PUT', ruta: '/pasarela/orden', descripcion: 'Reordena la cola de una categoría' },
  'TRK-EVT-001': { metodo: 'GET', ruta: '/evento/estado', descripcion: 'Estado público: en pasarela, modo de pantalla, ranking publicado' },
  'TRK-EVT-002': { metodo: 'PUT', ruta: '/evento/pantalla', descripcion: 'Modo y categoría de la pantalla pública' },
  'TRK-EVT-003': { metodo: 'GET', ruta: '/evento/tablero', descripcion: 'Contadores y progreso por jurado' },
  'TRK-CAL-002': { metodo: 'PUT', ruta: '/calificaciones/:participanteId', descripcion: 'Crea/envía calificación (idempotente, bloquea)' },
  'TRK-RUB-001': { metodo: 'GET', ruta: '/rubricas/:categoriaId', descripcion: 'Criterios de la rúbrica de la categoría' },
  'TRK-CAL-001': { metodo: 'GET', ruta: '/calificaciones/mias', descripcion: 'Calificaciones del jurado en sesión (insignias)' },
  'TRK-CAL-003': { metodo: 'POST', ruta: '/calificaciones/:id/desbloquear', descripcion: 'Desbloquea una calificación (auditado)' },
  'TRK-CAT-001': { metodo: 'POST', ruta: '/categorias/:id/abrir', descripcion: 'Abre la categoría para calificar' },
  'TRK-CAT-002': { metodo: 'POST', ruta: '/categorias/:id/cerrar', descripcion: 'Cierra la categoría (no se califica más)' },
  'TRK-CAT-003': { metodo: 'POST', ruta: '/categorias/:id/publicar', descripcion: 'Publica el ranking (snapshot)' },
  'TRK-CAT-004': { metodo: 'PATCH', ruta: '/categorias/:id', descripcion: 'Edita puestos premiados' },
  'TRK-RNK-001': { metodo: 'GET', ruta: '/ranking/:categoriaId', descripcion: 'Ranking en vivo (admin) o publicado (resto)' },
  'TRK-RNK-002': { metodo: 'PUT', ruta: '/ranking/:categoriaId/desempate', descripcion: 'Fija desempate manual' },
  'TRK-EXP-001': { metodo: 'GET', ruta: '/export/resultados.xlsx', descripcion: 'Exporta resultados a Excel con detalle por jurado y criterio' },
};
