// Contexto que los controladores pasan a los servicios (sin acoplarlos a Express).
function ctxDe(req) {
  return {
    usuario: req.usuario || null,
    usuarioId: req.usuario ? req.usuario.id : null,
    apiCodigo: req.trkApiCodigo,
    ip: req.ip,
    log: req.trkLog
  };
}

module.exports = { ctxDe };
