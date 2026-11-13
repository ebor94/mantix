// Worker de prueba para convertidorHeic: imita al real según el texto de la entrada, sin HEIC de verdad.
const { parentPort, workerData } = require('worker_threads');

const texto = Buffer.from(workerData.entrada).toString();

if (texto === 'colgar') {
  for (;;) { /* bloquea el hilo del worker: solo terminate() lo detiene */ }
} else if (texto === 'fallar') {
  parentPort.postMessage({ ok: false, nombre: 'TypeError', codigo: 'ERR_HEIF' });
} else if (texto === 'morir') {
  process.exit(3);
} else {
  const salida = Buffer.from(`convertido:${texto}`);
  const ab = salida.buffer.slice(salida.byteOffset, salida.byteOffset + salida.byteLength);
  parentPort.postMessage({ ok: true, salida: ab }, [ab]);
}
