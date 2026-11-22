// Consultas de solo lectura sobre horno.lecturas (MySQL central). Las 8 variables se definen aquí una vez
// y de aquí salen el SQL, la serie de las gráficas y las columnas del Excel.
const VARIABLES = Object.freeze([
  { campo: 'temp_combustion', etiqueta: 'Temp. combustión', unidad: '°C', decimales: 1 },
  { campo: 'temp_postcombustion', etiqueta: 'Temp. postcombustión', unidad: '°C', decimales: 1 },
  { campo: 'temp_chimenea', etiqueta: 'Temp. chimenea', unidad: '°C', decimales: 1 },
  { campo: 'co', etiqueta: 'CO', unidad: 'ppm', decimales: 1 },
  { campo: 'oxigeno', etiqueta: 'Oxígeno', unidad: '%', decimales: 2 },
  { campo: 'co_mg_m3', etiqueta: 'CO', unidad: 'mg/m³', decimales: 3 },
  { campo: 'ccr', etiqueta: 'Ccr', unidad: null, decimales: 1 },
  { campo: 'ccr_o2_ref', etiqueta: 'Ccr O2 ref.', unidad: null, decimales: 1 },
]);

const EQUIPO = 'HORNO-INCOL';
const LIMITE_EXCEL = 100000;
const CAMPOS = VARIABLES.map((v) => v.campo).join(', ');
// DATE_FORMAT: el texto sale tal cual está en la base (hora de Colombia), sin que mysql2 lo convierta a Date.
const COLUMNAS = `id_local, DATE_FORMAT(registrado_en, '%Y-%m-%d %H:%i:%s') AS registrado_en, `
  + `DATE_FORMAT(fecha_hmi, '%Y-%m-%d %H:%i:%s') AS fecha_hmi, ${CAMPOS}`;
const EN_RANGO = 'equipo = ? AND registrado_en BETWEEN ? AND ?';
const FORMATO_GRUPO = Object.freeze({ hora: '%Y-%m-%d %H:00:00', dia: '%Y-%m-%d' });

// mysql2 entrega DECIMAL como texto.
function numero(v, decimales) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return decimales === undefined ? n : Number(n.toFixed(decimales));
}

function agrupacionPara(dias) {
  if (dias <= 2) return 'crudo';
  if (dias <= 31) return 'hora';
  return 'dia';
}

function lectura(f) {
  const salida = { id: Number(f.id_local), registrado_en: f.registrado_en, fecha_hmi: f.fecha_hmi ?? null };
  for (const v of VARIABLES) salida[v.campo] = numero(f[v.campo]);
  return salida;
}

function crearServicioLecturas({ bd, equipo = EQUIPO }) {
  const consultar = async (sql, params) => {
    const [filas] = await bd.obtener().query(sql, params);
    return filas;
  };

  async function contar({ desde, hasta }) {
    const [f] = await consultar(`SELECT COUNT(*) AS total FROM lecturas WHERE ${EN_RANGO}`, [equipo, desde, hasta]);
    return Number(f.total);
  }

  return {
    contar,

    async ultima() {
      const filas = await consultar(
        `SELECT ${COLUMNAS}, TIMESTAMPDIFF(MINUTE, registrado_en, NOW()) AS minutos_sin_datos `
        + 'FROM lecturas WHERE equipo = ? ORDER BY registrado_en DESC, id_local DESC LIMIT 1',
        [equipo],
      );
      if (filas.length === 0) return { lectura: null, minutosSinDatos: null };
      return { lectura: lectura(filas[0]), minutosSinDatos: Number(filas[0].minutos_sin_datos) };
    },

    async serie({ desde, hasta, dias }) {
      const agrupacion = agrupacionPara(dias);
      if (agrupacion === 'crudo') {
        const filas = await consultar(
          `SELECT DATE_FORMAT(registrado_en, '%Y-%m-%d %H:%i:%s') AS t, ${CAMPOS} FROM lecturas `
          + `WHERE ${EN_RANGO} ORDER BY registrado_en, id_local`,
          [equipo, desde, hasta],
        );
        return {
          agrupacion,
          puntos: filas.map((f) => {
            const p = { t: f.t };
            for (const v of VARIABLES) {
              const n = numero(f[v.campo]);
              p[v.campo] = { prom: n, min: n, max: n };
            }
            return p;
          }),
        };
      }
      const agregados = VARIABLES
        .map(({ campo }) => `AVG(${campo}) AS ${campo}_prom, MIN(${campo}) AS ${campo}_min, MAX(${campo}) AS ${campo}_max`)
        .join(', ');
      const filas = await consultar(
        `SELECT DATE_FORMAT(registrado_en, '${FORMATO_GRUPO[agrupacion]}') AS t, ${agregados} FROM lecturas `
        + `WHERE ${EN_RANGO} GROUP BY t ORDER BY t`,
        [equipo, desde, hasta],
      );
      return {
        agrupacion,
        puntos: filas.map((f) => {
          const p = { t: f.t };
          for (const v of VARIABLES) {
            p[v.campo] = {
              prom: numero(f[`${v.campo}_prom`], v.decimales),
              min: numero(f[`${v.campo}_min`]),
              max: numero(f[`${v.campo}_max`]),
            };
          }
          return p;
        }),
      };
    },

    async listar({ desde, hasta, pagina, tamano }) {
      const total = await contar({ desde, hasta });
      const filas = await consultar(
        `SELECT ${COLUMNAS} FROM lecturas WHERE ${EN_RANGO} ORDER BY registrado_en DESC, id_local DESC LIMIT ? OFFSET ?`,
        [equipo, desde, hasta, tamano, (pagina - 1) * tamano],
      );
      return { filas: filas.map(lectura), total, pagina, tamano };
    },

    async filasParaExcel({ desde, hasta }) {
      const filas = await consultar(
        `SELECT ${COLUMNAS} FROM lecturas WHERE ${EN_RANGO} ORDER BY registrado_en, id_local`,
        [equipo, desde, hasta],
      );
      return filas.map(lectura);
    },
  };
}

module.exports = { crearServicioLecturas, agrupacionPara, VARIABLES, LIMITE_EXCEL };
