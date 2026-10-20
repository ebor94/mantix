// Verificación de entorno del módulo TRK (I1). Si falla, el router TRK responde 503 y los
// tokens de PIN no se aceptan; Mantix sigue funcionando (nunca process.exit).
// Puro: lee el entorno en cada llamada (barato) para que las pruebas puedan variarlo.
function verificarEntorno(env = process.env) {
  const trk = env.TRK_JWT_SECRET;
  if (!trk) return { ok: false, motivo: 'Falta TRK_JWT_SECRET' };
  const secretosMantix = [env.JWT_SECRET, env.IDENTIDAD_JWT_SECRET].filter(Boolean);
  if (secretosMantix.includes(trk)) {
    return { ok: false, motivo: 'TRK_JWT_SECRET debe ser distinto de JWT_SECRET e IDENTIDAD_JWT_SECRET' };
  }
  return { ok: true, advertencia: trk.length < 32 ? 'TRK_JWT_SECRET tiene menos de 32 caracteres' : null };
}

module.exports = { verificarEntorno };
