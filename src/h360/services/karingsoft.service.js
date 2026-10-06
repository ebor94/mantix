/**
 * karingsoft.service.js
 * Lectura del ERP (SQL Server) para armar el formato R-13 "Exequias / Bóvedas".
 *
 * Solo consulta: H360 no escribe nada en Karingsoft. El vínculo entre los dos
 * sistemas es el número de contrato, que en el ERP se llama orden_servicio.
 *
 * El pool se crea una vez y se reutiliza; si la conexión se cae, el siguiente
 * llamado la rehace en vez de dejar el servicio inservible hasta reiniciar.
 */
/**
 * El driver se carga al usarlo, no al arrancar: si el servidor se despliega sin
 * haber corrido npm install, un require arriba tumbaría todo el backend por una
 * función que casi nadie está usando en ese momento.
 */
let sql = null
function driver() {
  if (!sql) {
    try { sql = require('mssql') }
    catch { throw new Error('Falta la dependencia mssql en el servidor: ejecuta npm install') }
  }
  return sql
}

let poolPromesa = null

function configurado() {
  return !!(process.env.KS_HOST && process.env.KS_DATABASE && process.env.KS_USER)
}

async function obtenerPool() {
  if (!configurado()) throw new Error('La conexión al ERP no está configurada (KS_HOST, KS_DATABASE, KS_USER)')
  if (!poolPromesa) {
    poolPromesa = driver().connect({
      server:   process.env.KS_HOST,
      port:     Number(process.env.KS_PORT || 1433),
      database: process.env.KS_DATABASE,
      user:     process.env.KS_USER,
      password: process.env.KS_PASSWORD,
      options:  { encrypt: false, trustServerCertificate: true },
      pool:     { max: 4, min: 0, idleTimeoutMillis: 30000 },
      connectionTimeout: 15000,
      requestTimeout:    20000,
    }).catch(err => {
      poolPromesa = null          // que el próximo intento vuelva a conectar
      throw err
    })
  }
  return poolPromesa
}

/**
 * Cada OUTER APPLY lleva ORDER BY a propósito: un TOP 1 sin orden deja que el
 * motor devuelva cualquier fila, así que el cementerio o la bóveda del formato
 * podían cambiar entre dos impresiones del mismo contrato.
 */
const CONSULTA_R13 = `
DECLARE @orden varchar(20) = @p_orden;

WITH det AS (
    SELECT d.orden_servicio, d.servicio, d.fecha, d.observacion, d.tercero,
           s.descripcion AS servicio_desc, s.servicio_categoria,
           t.nombre AS tercero_nombre
    FROM salas_ordenes_detalle d
    JOIN salas_servicios s ON CAST(s.servicio AS varchar(30)) = d.servicio
    LEFT JOIN terceros t ON t.compania = 1 AND CAST(t.tercero AS varchar(30)) = d.tercero
    WHERE d.orden_servicio = @orden
)
SELECT
    CONVERT(varchar(10), o.fecha, 103)                      AS fecha,
    o.orden_servicio                                        AS contrato_no,
    RTRIM(ex.tercero_nombre)                                AS iglesia,
    RTRIM(o.barrio_fallecido)                               AS barrio,
    CASE WHEN ex.servicio  IS NOT NULL THEN 'X' ELSE '' END AS exequias,
    CASE WHEN bov.servicio IS NOT NULL THEN 'X' ELSE '' END AS alquiler_boveda,
    CASE WHEN tap.servicio IS NOT NULL THEN 'X' ELSE '' END AS tapada_costos_inhumacion,
    CONVERT(varchar(10), ex.fecha, 103)                     AS fecha_exequias,
    -- La hora se digita dentro de la observación del servicio Exequias,
    -- antes del guion: "230PM-LVZ087". Se normaliza fuera de SQL.
    LTRIM(RTRIM(CASE WHEN CHARINDEX('-', ex.observacion) > 0
                     THEN LEFT(ex.observacion, CHARINDEX('-', ex.observacion) - 1)
                     ELSE ex.observacion END))              AS hora_exequias_cruda,
    LTRIM(RTRIM(
      LTRIM(RTRIM(o.primer_apellido_fallecido)) + ' ' +
      LTRIM(RTRIM(ISNULL(o.segundo_apellido_fallecido, ''))) + ' ' +
      LTRIM(RTRIM(o.nombres_fallecido))))                   AS nombre_ser_querido,
    CONVERT(varchar(10), o.fecha_nacimiento, 103)           AS fecha_nacimiento,
    CONVERT(varchar(10), o.fecha_fallecimiento, 103)        AS fecha_defuncion,
    CAST(o.edad_fallecimiento AS int)                       AS edad,
    RTRIM(ec.descripcion)                                   AS estado_civil,
    ISNULL(NULLIF(LTRIM(RTRIM(o.casado_con)), ''), '0')     AS nombre_conyuge,
    RTRIM(o.padre_fallecido)                                AS nombre_padre,
    RTRIM(o.madre_fallecido)                                AS nombre_madre,
    RTRIM(cd.descripcion)                                   AS causa_fallecimiento,
    RTRIM(ISNULL(df.tercero_nombre, df.servicio_desc))
        + ISNULL(' / ' + RTRIM(df.observacion), '')         AS cementerio,
    RTRIM(o.direccion_fallecido)                            AS direccion_residencia
FROM salas_ordenes o
LEFT JOIN estados_civiles ec ON ec.estado_civil = o.estado_civil
LEFT JOIN causas_deceso   cd ON cd.causa_deceso = o.causa_deceso
OUTER APPLY (SELECT TOP 1 * FROM det
              WHERE det.servicio = '170'
              ORDER BY det.fecha, det.servicio) ex                        -- Exequias
OUTER APPLY (SELECT TOP 1 * FROM det
              WHERE det.servicio_categoria = 4
                AND det.servicio_desc LIKE '%b_veda%'
                AND det.servicio_desc NOT LIKE '%tapada%'
              ORDER BY det.servicio) bov
OUTER APPLY (SELECT TOP 1 * FROM det
              WHERE det.servicio_categoria = 4
                AND det.servicio_desc LIKE '%tapada%'
              ORDER BY det.servicio) tap
OUTER APPLY (SELECT TOP 1 * FROM det                                      -- Destino final real
              WHERE det.servicio_categoria = 4
                AND det.servicio <> '104'
                AND det.tercero IS NOT NULL
              ORDER BY det.servicio) df
WHERE o.orden_servicio = @orden;`

/**
 * "230PM" / "2:30PM" / "0430 pm" → "2:30 PM".
 * Devuelve el texto original si no se reconoce: es preferible imprimir lo que
 * digitaron a dejar el campo en blanco.
 */
function normalizarHora(cruda) {
  const texto = String(cruda ?? '').trim()
  if (!texto) return ''

  const m = texto.toUpperCase().match(/^(\d{1,2})[:\s.]?(\d{2})?\s*(AM|PM|A\.M\.|P\.M\.)?$/)
  if (!m) return texto

  let [, h, min, sufijo] = m
  const hora = parseInt(h, 10)
  if (Number.isNaN(hora) || hora > 23) return texto

  // Sin AM/PM: en el ERP las exequias de la tarde se digitan sin sufijo.
  const pm = sufijo ? sufijo.startsWith('P') : hora >= 12
  const h12 = hora % 12 === 0 ? 12 : hora % 12
  return `${h12}:${min || '00'} ${pm ? 'PM' : 'AM'}`
}

/**
 * Datos del formato R-13 para un contrato. Devuelve null si el ERP no conoce
 * ese número, para que quien llame distinga "no existe" de "falló la consulta".
 */
async function formatoR13(ordenServicio) {
  const orden = String(ordenServicio ?? '').trim()
  if (!orden) return null

  const pool = await obtenerPool()
  const r = await pool.request()
    .input('p_orden', driver().VarChar(20), orden)
    .query(CONSULTA_R13)

  const fila = r.recordset[0]
  if (!fila) return null

  const { hora_exequias_cruda, ...resto } = fila
  return {
    ...resto,
    // Sin segundo apellido quedan dos espacios en medio del nombre.
    nombre_ser_querido: String(resto.nombre_ser_querido ?? '').replace(/\s+/g, ' ').trim(),
    hora_exequias: normalizarHora(hora_exequias_cruda),
    hora_exequias_cruda,
  }
}

module.exports = { formatoR13, normalizarHora, configurado }
