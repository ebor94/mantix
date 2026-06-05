// ============================================
// src/routes/borrador.routes.js
// Montado en /api/afiliados/borradores
// ============================================
const { Router } = require('express');
const controller  = require('../controllers/borrador.controller');
const upload      = require('../middleware/upload');
const { auth }    = require('../middleware/auth');

const router = Router();

// Middleware idéntico al de afiliado.routes: cuando llega multipart, el JSON
// viaja en el campo `data` como string; lo parseamos para reemplazar req.body.
function parseMultipartJson(req, res, next) {
  if (req.body && typeof req.body.data === 'string') {
    try {
      req.body = JSON.parse(req.body.data);
    } catch (_) {
      return res.status(400).json({
        success: false,
        message: 'El campo data no contiene un JSON válido'
      });
    }
  }
  next();
}

// Mismos campos de archivo que el registro/corrección. Hasta 10 beneficiarios.
const beneficiariosDocFields = Array.from({ length: 10 }, (_, i) => ({
  name: `beneficiario_doc_${i}`,
  maxCount: 1
}));

const uploadFields = upload.fields([
  { name: 'soporte',              maxCount: 1 },
  { name: 'cedulaFrontal',        maxCount: 1 },
  { name: 'cedulaReverso',        maxCount: 1 },
  { name: 'contratoCompetencia',  maxCount: 1 },
  ...beneficiariosDocFields
]);

// GET    /afiliados/borradores        — listar borradores del asesor
router.get('/',      auth, controller.listar);

// GET    /afiliados/borradores/:id    — obtener borrador completo
router.get('/:id',   auth, controller.getOne);

// POST   /afiliados/borradores        — crear nuevo borrador (con archivos opcionales)
router.post('/',     auth, uploadFields, parseMultipartJson, controller.crear);

// PUT    /afiliados/borradores/:id    — actualizar borrador existente (con archivos opcionales)
router.put('/:id',   auth, uploadFields, parseMultipartJson, controller.actualizar);

// DELETE /afiliados/borradores/:id    — eliminar borrador
router.delete('/:id', auth, controller.eliminar);

module.exports = router;
