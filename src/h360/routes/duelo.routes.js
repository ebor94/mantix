// src/h360/routes/duelo.routes.js
// Acompañamiento al duelo (R-56). Se monta en /api/h360/duelo detrás de
// verifyToken (ver routes/index.js).
//
// No hay rutas públicas en este módulo: todas las rutas llevan requireRol.
// Este módulo maneja datos de familias en duelo y, en las atenciones, dato de
// salud de un tercero (Ley 1581 de 2012). Cualquier ruta nueva que se agregue
// acá debe llevar requireRol(...EQUIPO); la prueba duelo.routes.test.js falla
// si alguna queda sin compuerta.
const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/duelo.controller')
const atenciones = require('../controllers/duelo_atenciones.controller')

const EQUIPO = ['psicologia', 'admin']

router.get('/bandeja',                    requireRol(...EQUIPO), ctrl.bandeja)
router.get('/buscar',                     requireRol(...EQUIPO), ctrl.buscar)
router.get('/gestion/:orden',             requireRol(...EQUIPO), ctrl.ficha)
router.post('/gestion',                   requireRol(...EQUIPO), ctrl.crear)
router.patch('/gestion/:id',              requireRol(...EQUIPO), ctrl.actualizar)
router.post('/gestion/:id/intentos',      requireRol(...EQUIPO), ctrl.agregarIntento)
router.put('/gestion/:id/servicios',      requireRol(...EQUIPO), ctrl.guardarServicios)

// Dato de salud. El controlador vuelve a verificar el rol por si estas
// funciones terminan montadas en otra ruta sin el requireRol. Las dos capas son
// deliberadas: no quitar ninguna.
router.get('/gestion/:id/atenciones',     requireRol(...EQUIPO), atenciones.listar)
router.post('/gestion/:id/atenciones',    requireRol(...EQUIPO), atenciones.crear)

module.exports = router
