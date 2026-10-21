// Manejador de errores del módulo bigday (solo errores; los parsers de Mantix no lo conocen).
// eslint-disable-next-line no-unused-vars
function bigdayErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido.' });
  }
  // Solo el mensaje: sin IP, cuerpo ni user-agent.
  console.error('bigday: error no controlado:', err instanceof Error ? err.message : 'desconocido');
  return res.status(500).json({ error: 'Error interno.' });
}

module.exports = { bigdayErrorHandler };
