const crypto = require('crypto');
const importador = require('../services/importador.service');
const previewCache = require('../services/previewCache');
const TrkError = require('../utils/TrkError');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');

exports.preview = async (req, res) => {
  if (!req.file) throw new TrkError(400, 'VALIDACION', 'Adjunta el archivo CSV en el campo "archivo"');
  const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const analisis = importador.analizarCsv(req.file.buffer);
  const token = previewCache.guardar(analisis, { sha256, archivoNombre: req.file.originalname });
  ok(res, { preview_token: token, archivo_nombre: req.file.originalname, ...analisis });
};

exports.confirmar = async (req, res) => ok(res, await importador.confirmarImportacion(
  { token: req.body.preview_token, decisiones: req.body.decisiones }, ctxDe(req)
));
