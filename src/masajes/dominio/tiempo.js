// dayjs configurado para la zona de Colombia. Toda la lógica de franjas usa esta zona, sin importar
// la del proceso (el servidor puede correr en UTC). Colombia no tiene horario de verano: UTC-5 fijo.
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

const TZ = 'America/Bogota';
const local = (d) => dayjs(d).tz(TZ);
const deLocal = (str) => dayjs.tz(str, TZ);

module.exports = { dayjs, local, deLocal, TZ };
