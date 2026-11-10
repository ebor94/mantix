/**
 * h360/jobs/desinfecciones.job.js
 *
 * Un solo cron: el barrido nocturno de desinfecciones (vencer programaciones,
 * inhabilitar vehículos y avisar al espacio de operaciones).
 *
 * El job no tiene lógica. Todo está en h360/services/desinfecciones.service.js
 * para poder correr el barrido a mano y probarlo sin esperar la medianoche.
 */
const cron  = require('node-cron')
const desinf = require('../services/desinfecciones.service')

let task

function start() {
  if (task) return task

  // 00:05 y no 00:00, por tres razones que se pagan caro juntas:
  //
  //  1. A las 00:00:00 en punto el CURDATE() de MySQL está cambiando en el
  //     mismo instante en que arranca el barrido. Un par de segundos de
  //     diferencia entre el reloj de node y el de la base —o un disparo del
  //     scheduler apenas antes de la hora, que node-cron permite— harían que
  //     la comparación «fecha_prox < CURDATE()» corra contra el día de ayer, y
  //     eso es inhabilitar un vehículo un día antes de lo debido.
  //  2. El servidor está en America/Bogota, pero la zona se declara explícita
  //     igual que en los jobs de SerVentas: el día que alguien mueva la zona
  //     del sistema, el barrido no se debe correr de hora sin que nadie note.
  //  3. La medianoche exacta es donde se amontonan los respaldos y los cierres.
  //     Cinco minutos después el barrido corre solo, y queda antes de los jobs
  //     de renovaciones (00:30 y 01:00), así que el aviso de la mañana ya está
  //     puesto cuando empieza el turno.
  task = cron.schedule('5 0 * * *', async () => {
    try {
      const r = await desinf.ejecutarBarridoDiario()
      console.log('[desinfecciones] barrido diario terminado:',
        JSON.stringify({
          vencidas:      r?.barrido?.vencidas ?? null,
          inhabilitados: r?.barrido?.vehiculos_inhabilitados?.length ?? null,
          aviso:         r?.aviso?.enviado ?? false,
          errores:       r?.errores?.length ?? 0,
        }))
    } catch (err) {
      // ejecutarBarridoDiario no lanza, pero el catch queda: una excepción que
      // escape de un callback de cron no la atrapa nadie y tumba el proceso.
      console.error('[desinfecciones] barrido diario falló:', err?.message)
    }
  }, { scheduled: true, timezone: 'America/Bogota' })

  console.log('[desinfecciones] cron armado (5 0 * * *, America/Bogota)')
  return task
}

module.exports = { start }
