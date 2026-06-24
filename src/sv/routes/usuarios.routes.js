/**
 * sv/routes/usuarios.routes.js
 * CRUD usuarios:
 *   - Lectura (GET /, GET /:id): cualquier rol con capacidad de jefatura.
 *     Estos roles necesitan listar usuarios para combos de asesor en agenda,
 *     reasignación, filtros de equipo, etc. — se usa ROLES_SUPERVISORES.
 *   - Mutaciones (POST/PUT/PATCH): solo SUPER_ADMIN, GERENTE_GENERAL y
 *     ADMIN_AREA crean/editan usuarios desde el admin.
 */
const router = require('express').Router();
const ctrl   = require('../controllers/usuarios.controller');
const v      = require('../validations/usuarios.validation');
const { validate }  = require('../middleware/validate');
const { authorize } = require('../middleware/svAuthorize');
const { ROLES_SUPERVISORES } = require('../config/constants');

const admin   = authorize('SUPER_ADMIN', 'GERENTE_GENERAL', 'ADMIN_AREA');
const lectura = authorize(...ROLES_SUPERVISORES);

router.get   ('/',     lectura, ctrl.list);
router.get   ('/:id',  lectura, ctrl.getOne);
router.post  ('/',     admin, validate(v.create), ctrl.create);
router.put   ('/:id',  admin, validate(v.update), ctrl.update);
router.patch ('/:id/toggle',         admin, ctrl.toggle);
router.post  ('/:id/reset-password', admin, validate(v.resetPassword), ctrl.resetPassword);

module.exports = router;
