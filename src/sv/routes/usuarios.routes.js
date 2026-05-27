/**
 * sv/routes/usuarios.routes.js
 * CRUD usuarios:
 *   - Lectura (GET /, GET /:id): SUPER_ADMIN, ADMIN_AREA, JEFE_PAP, SUPERVISOR
 *     (el SUPERVISOR/JEFE_PAP necesita listar asesores de su grupo para reasignación)
 *   - Mutaciones (POST/PUT/PATCH): solo SUPER_ADMIN y ADMIN_AREA (JEFE_PAP no muta)
 */
const router = require('express').Router();
const ctrl   = require('../controllers/usuarios.controller');
const v      = require('../validations/usuarios.validation');
const { validate }  = require('../middleware/validate');
const { authorize } = require('../middleware/svAuthorize');

const admin = authorize('SUPER_ADMIN', 'ADMIN_AREA');
const lectura = authorize('SUPER_ADMIN', 'ADMIN_AREA', 'JEFE_PAP', 'SUPERVISOR');

router.get   ('/',     lectura, ctrl.list);
router.get   ('/:id',  lectura, ctrl.getOne);
router.post  ('/',     admin, validate(v.create), ctrl.create);
router.put   ('/:id',  admin, validate(v.update), ctrl.update);
router.patch ('/:id/toggle',         admin, ctrl.toggle);
router.post  ('/:id/reset-password', admin, validate(v.resetPassword), ctrl.resetPassword);

module.exports = router;
