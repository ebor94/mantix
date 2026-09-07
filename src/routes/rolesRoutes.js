// Roles routes
const express = require('express');
const router = express.Router();
const rolesController = require('../controllers/rolesController');
const { auth } = require('../middleware/auth');

router.use(auth);
router.get('/', rolesController.getAll);

module.exports = router;
