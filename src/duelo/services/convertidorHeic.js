// Convierte HEIC a JPG en un worker_thread: un worker por foto, con memoria acotada y plazo máximo.
// Si el worker falla, se queda sin memoria o no responde a tiempo, la promesa se rechaza (foto ilegible).
const path = require('path');
const { Worker } = require('worker_threads');

const SCRIPT = path.join(__dirname, 'heicWorker.js');
const TIEMPO_MAXIMO_MS = 30_000;
const LIMITES = { maxOldGenerationSizeMb: 768 };

const errorCon = (codigo, nombre = 'Error') => Object.assign(new Error(`conversión HEIC fallida (${codigo})`), {
  name: nombre, code: codigo,
});

function crearConvertidorHeic({ script = SCRIPT, timeoutMs = TIEMPO_MAXIMO_MS, resourceLimits = LIMITES } = {}) {
  return function convertirHeic(buffer) {
    return new Promise((ok, mal) => {
      // Copia propia: transferir el ArrayBuffer de Multer lo dejaría inservible (o a otros, si es del pool).
      const entrada = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      let worker;
      try {
        worker = new Worker(script, { workerData: { entrada }, transferList: [entrada], resourceLimits });
      } catch (err) {
        mal(err);
        return;
      }
      let terminado = false;
      const terminar = (fn, valor) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(reloj);
        worker.terminate().catch(() => {});
        fn(valor);
      };
      const reloj = setTimeout(() => terminar(mal, errorCon('HEIC_TIEMPO')), timeoutMs);

      worker.on('message', (m) => {
        if (m && m.ok) terminar(ok, Buffer.from(m.salida));
        else terminar(mal, errorCon((m && m.codigo) || 'HEIC_ERROR', (m && m.nombre) || 'Error'));
      });
      // Incluye ERR_WORKER_OUT_OF_MEMORY cuando se supera resourceLimits.
      worker.on('error', (err) => terminar(mal, err));
      worker.on('exit', () => terminar(mal, errorCon('HEIC_WORKER_SALIO')));
    });
  };
}

module.exports = { crearConvertidorHeic };
