// supertest 6 escucha en '::' y conecta a 127.0.0.1. En macOS ese puerto puede estar
// tomado por otro proceso y la petición le llega a él. Por eso las pruebas escuchan
// explícitamente en 127.0.0.1 y cierran el servidor al terminar.
const servidores = [];

async function escuchar(app) {
  const server = app.listen(0, '127.0.0.1');
  servidores.push(server);
  await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  return server;
}

async function cerrarTodos() {
  await Promise.all(servidores.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
}

module.exports = { escuchar, cerrarTodos };
