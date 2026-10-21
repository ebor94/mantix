// Compartido por src/bigday y src/trk. Servidores HTTP de prueba ligados explícitamente a 127.0.0.1 (no es un archivo de pruebas).
//
// Por qué: supertest 6.x con `request(app)` hace `app.listen(0)` (se liga a `::`) pero se conecta a
// `127.0.0.1:<puerto>`. En macOS ese puerto puede estar ya ocupado por otro proceso ligado a 127.0.0.1
// (ayudantes de VS Code, ssh…) y la petición llega a un servidor ajeno: 401/404, "socket hang up",
// "Parse Error: Expected HTTP/". Ligando a 127.0.0.1 y esperando al callback de listen, el puerto es nuestro
// y `server.address()` ya existe cuando supertest lo lee (si no, supertest volvería a escuchar en `::`).
//
// Uso:  const res = await request(await servir(app)).get('/ruta');
//       afterEach(cerrarServidores);
// `servir` reutiliza el mismo servidor para la misma app hasta `cerrarServidores()`.

const servidores = new Map();

function servir(app) {
  if (servidores.has(app)) return servidores.get(app);
  const listo = new Promise((ok, mal) => {
    const servidor = app.listen(0, '127.0.0.1', () => ok(servidor));
    servidor.once('error', mal);
  });
  servidores.set(app, listo);
  return listo;
}

async function cerrarServidores() {
  const pendientes = [...servidores.values()];
  servidores.clear();
  await Promise.all(pendientes.map(async (listo) => {
    const servidor = await listo.catch(() => null);
    if (!servidor) return;
    servidor.closeAllConnections?.();
    await new Promise((ok) => servidor.close(() => ok()));
  }));
}

module.exports = { servir, cerrarServidores };
