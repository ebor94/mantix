// Semáforo simple: a lo sumo `maximo` tareas a la vez, hasta `maxEnEspera` en cola (FIFO); con la cola
// llena rechaza de inmediato con `errorLleno()`. El turno se libera siempre, falle o no la tarea.
function crearLimitador({ maximo, maxEnEspera, errorLleno }) {
  let activas = 0;
  const cola = [];

  // El turno que se libera pasa directo al primero en espera (sin bajar `activas`), para que una
  // tarea recién llegada no lo ocupe antes de que el que esperaba despierte.
  const liberar = () => {
    const siguiente = cola.shift();
    if (siguiente) siguiente();
    else activas -= 1;
  };

  async function ejecutar(tarea) {
    if (activas < maximo) {
      activas += 1;
    } else {
      if (cola.length >= maxEnEspera) throw errorLleno();
      await new Promise((ok) => { cola.push(ok); });
    }
    try {
      return await tarea();
    } finally {
      liberar();
    }
  }

  const estado = () => ({ activas, enEspera: cola.length });

  return { ejecutar, estado };
}

module.exports = { crearLimitador };
