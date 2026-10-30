/** Envuelve un handler async: cualquier rechazo va a next (Express 4 no lo hace solo). */
const aw = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);

module.exports = aw;
