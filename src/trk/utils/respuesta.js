// Respuestas exitosas TRK: { success: true, data } (patrón Mantix/SerVentas)
function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

module.exports = { ok };
