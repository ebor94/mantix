// Worker que decodifica un HEIC con heic-convert (JavaScript puro, ~1,5 s y cientos de MB por foto).
// Corre fuera del hilo principal para no congelar Mantix. Recibe y devuelve ArrayBuffer transferidos.
const { parentPort, workerData } = require('worker_threads');

(async () => {
  try {
    const convertir = require('heic-convert');
    const jpg = Buffer.from(await convertir({ buffer: Buffer.from(workerData.entrada), format: 'JPEG', quality: 0.92 }));
    const salida = jpg.buffer.slice(jpg.byteOffset, jpg.byteOffset + jpg.byteLength);
    parentPort.postMessage({ ok: true, salida }, [salida]);
  } catch (err) {
    // Solo la clase del error: nada del contenido de la foto.
    parentPort.postMessage({ ok: false, nombre: err && err.name, codigo: err && err.code });
  }
})();
