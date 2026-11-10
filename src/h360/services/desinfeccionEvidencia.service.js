/**
 * desinfeccionEvidencia.service.js — evidencia fotográfica de las desinfecciones.
 *
 * Las desinfecciones de tipo EVIDENCIA las ejecuta el operario y lo que queda
 * como prueba es la foto: esto reemplaza un talonario físico que es evidencia
 * sanitaria, así que la foto es el documento y no un adorno de la pantalla.
 *
 * Tres decisiones que vale la pena dejar escritas, porque las tres salieron de
 * mirar el servidor de producción y no de un criterio general:
 *
 * 1. Se redimensiona SIEMPRE antes de escribir. En producción `uploads/` ya
 *    pesa 8,4 GB sobre un disco de 76 GB, y acá entran dos o más fotos de
 *    celular (3–8 MB cada una) todos los días. Guardar el original es llenar
 *    el disco en meses; a 1600 px y calidad 80 una foto de desinfección sigue
 *    sirviendo como prueba y pesa un orden de magnitud menos.
 *
 * 2. En la base va la ruta RELATIVA a la carpeta del módulo, nunca la
 *    absoluta. El día que el directorio se mueva (y se va a mover: el disco
 *    está al 54 %), una ruta absoluta en la base deja toda la evidencia
 *    inalcanzable y hay que hacer un UPDATE masivo para recuperarla.
 *
 * 3. El binario se sirve por endpoint con token, como el PDF del R-34, y no
 *    como estático. Es evidencia sanitaria de la empresa: quien no tiene
 *    sesión no debería poder enumerar fotos de vehículos.
 */
const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
const axios  = require('axios')
const multer = require('multer')
const sharp  = require('sharp')
const db     = require('../config/db')

// ── Parámetros del módulo ──────────────────────────────────────────────────
const ANCHO_MAXIMO  = 1600   // px: suficiente para ver una placa y un compartimiento
const CALIDAD_JPEG  = 80
const MAX_ARCHIVOS  = 6
const CAMPO_ARCHIVO = 'evidencia'

// Evidencia FOTOGRÁFICA: el PDF se deja fuera a propósito. El formato que
// reemplaza esto pide fotos, y un PDF escaneado del talonario es justo lo que
// se quiere dejar de recibir (para eso está ORDEN_SERVICIO, que se confirma
// con el número del talonario y no con un archivo).
const EXT_PERMITIDAS = ['.jpg', '.jpeg', '.png', '.webp', '.heic']

// Lo único que se escribe en la cabecera Content-Type al servir. La base
// guarda el mime que declaró el cliente, y un mime inventado («text/html»,
// o uno con salto de línea) convertiría una foto en una página servida desde
// nuestro dominio. Se valida al guardar y otra vez al servir.
const MIMES_PERMITIDOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]

// Textos que pasan la forma de un id de Drive pero no son uno.
const BASURA_DRIVE = ['undefined', 'null', 'nodata', 'notfound', 'nofileid']

const MIME_POR_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.heic': 'image/heic',
}

// Las rutas y los destinos se leen en cada llamada, no al cargar el módulo:
// así un cambio de .env (o una prueba) no obliga a reiniciar el proceso para
// que tome efecto.
//
// El default NO cuelga de `uploads/` ni de UPLOAD_PATH, y es deliberado:
// `app.js` sirve todo `uploads/` con express.static y
// `Access-Control-Allow-Origin: *`, así que cualquier cosa que aterrice ahí
// queda descargable sin token por URL directa. Comprobado contra producción: un
// archivo de `uploads/evidencias` responde 200 desde internet.
//
// Un default que expone la evidencia si alguien olvida poner la variable es un
// default que falla abierto. Este cae fuera del árbol servido, de modo que el
// único camino a la foto sea `servirEvidencia`, que pide token. Si se quiere
// otro destino, DESINF_UPLOAD_PATH lo manda — pero que también quede fuera de
// `uploads/`.
const RAIZ_BACKEND = path.resolve(__dirname, '../../..')

const directorioBase = () =>
  path.resolve(process.env.DESINF_UPLOAD_PATH ||
    path.join(RAIZ_BACKEND, 'datos', 'evidencias-desinfeccion'))

const webhookDrive = () =>
  process.env.N8N_WEBHOOK_EVIDENCIAS_URL ||
  'http://192.9.17.10:5678/webhook/desinfeccion-evidencia-drive'

const carpetaDrive = () =>
  process.env.DESINF_DRIVE_FOLDER_ID || '1DBF4FUBe_oq5Ol0-dR-43aUMjCblbdJh'

const urlCallback = () =>
  process.env.DESINF_DRIVE_CALLBACK_URL ||
  `${process.env.API_BASE_URL || 'https://mantix-api.losolivoscucuta.com:8444/api'}` +
  '/h360/desinfecciones/evidencia/drive'

const entero = v => {
  const n = Number.parseInt(v, 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

function malaPeticion(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 })
}

/**
 * Texto apto para nombre de archivo: sin tildes, sin espacios y sin puntos ni
 * barras. Lo segundo es lo que importa: la placa y la actividad entran al
 * nombre del archivo, y un `../` ahí escribiría fuera del directorio base.
 */
function slug(texto, max) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
}

/** Año y mes de la ejecución, sin pasar por UTC. */
function anioMes(fecha) {
  const texto = String(fecha ?? '')
  const m = texto.match(/^(\d{4})-(\d{2})/)
  if (m) return { anio: m[1], mes: m[2] }
  // Un DATE de mysql2 llega como Date en hora local; los getters locales dan
  // el mismo día que tiene la base. Recortar un ISO acá correría el mes el
  // primero de cada mes, que es exactamente el error que no se ve nunca.
  const d = fecha instanceof Date && !Number.isNaN(fecha.getTime()) ? fecha : new Date()
  return {
    anio: String(d.getFullYear()),
    mes:  String(d.getMonth() + 1).padStart(2, '0'),
  }
}

function extensionSegura(nombreOriginal) {
  const ext = path.extname(String(nombreOriginal ?? '')).toLowerCase()
  return EXT_PERMITIDAS.includes(ext) ? ext : '.jpg'
}

function mimeSeguro(mime, ext) {
  const limpio = String(mime ?? '').trim().toLowerCase()
  if (MIMES_PERMITIDOS.includes(limpio)) return limpio
  return MIME_POR_EXT[ext] || 'application/octet-stream'
}

/**
 * Resuelve una ruta guardada en la base contra el directorio del módulo y
 * devuelve null si se sale de ahí.
 *
 * Las rutas las escribe este mismo servicio, así que hoy nunca se salen. Se
 * valida igual porque servir por id un valor de la base sin normalizar es
 * literalmente cómo se leen archivos del sistema: basta un UPDATE, una
 * importación vieja o un bug futuro para que `ruta` diga `../../etc/passwd`.
 */
function rutaSegura(rutaRelativa) {
  const base = directorioBase()
  const absoluta = path.resolve(base, String(rutaRelativa ?? ''))
  if (absoluta !== base && !absoluta.startsWith(base + path.sep)) return null
  return absoluta
}

// ── Subida ─────────────────────────────────────────────────────────────────
//
// Multer en MEMORIA, no en disco. Tres razones, en orden de peso:
//
// 1. Lo que llega es el original del celular (3–8 MB) y lo que debe quedar en
//    disco es el JPEG ya reducido. Con diskStorage el original aterriza antes
//    de que lo veamos y toca borrarlo después; con memoria simplemente nunca
//    se escribe. En un disco donde `uploads/` ya pesa 8,4 GB, lo que no se
//    escribe es lo que no hay que limpiar luego.
// 2. El registro se guarda dentro de una transacción. Si el INSERT falla, con
//    memoria no hay nada escrito que recoger; con disco quedarían archivos
//    huérfanos cada vez que falle una validación tardía.
// 3. sharp recibe el buffer directo, sin un viaje extra de ida y vuelta al
//    disco por cada foto.
//
// El techo de RAM queda acotado y es asumible: 6 archivos × MAX_FILE_SIZE_MB
// (10 MB hoy) = 60 MB en el peor caso de una sola petición.
const maxBytesArchivo =
  (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024

const subidaEvidencia = multer({
  storage: multer.memoryStorage(),
  fileFilter(req, archivo, cb) {
    const ext = path.extname(String(archivo.originalname || '')).toLowerCase()
    if (!EXT_PERMITIDAS.includes(ext)) {
      // El mensaje nombra el pdf aparte porque es el rechazo que más va a
      // pasar: el operario de campo tiene el talonario escaneado a mano.
      return cb(malaPeticion(
        ext === '.pdf'
          ? 'La evidencia de la desinfección es fotográfica: sube una foto, no un PDF.'
          : `Formato no permitido (${ext || 'sin extensión'}). Solo fotos: ${EXT_PERMITIDAS.join(', ')}.`
      ), false)
    }
    cb(null, true)
  },
  limits: { fileSize: maxBytesArchivo, files: MAX_ARCHIVOS },
}).array(CAMPO_ARCHIVO, MAX_ARCHIVOS)

/** El contenido del archivo, venga de memoria o de disco. */
async function contenido(archivo) {
  if (Buffer.isBuffer(archivo?.buffer)) return archivo.buffer
  // No es el camino de este módulo (el multer de acá es de memoria), pero si
  // alguien monta la ruta con un multer de disco, la evidencia se guarda igual
  // en vez de fallar con un error incomprensible en campo.
  if (archivo?.path) return fs.promises.readFile(archivo.path)
  throw malaPeticion('La evidencia llegó vacía: vuelve a tomar la foto.')
}

/**
 * Guarda los archivos ya validados, inserta las filas de h360_desinf_evidencia
 * con la conexión de la transacción que recibe, y devuelve las rutas escritas
 * para que el controlador pueda borrarlas si hace rollback.
 *
 * Las filas se insertan con `conn` (la de la transacción) y los archivos se
 * escriben fuera de ella, porque el disco no tiene rollback: de ahí que se
 * devuelvan las rutas y exista descartarEvidencias.
 *
 * @param {object}   opts
 * @param {object}   opts.conn             conexión de la transacción del registro
 * @param {number}   opts.registroId
 * @param {Array}    opts.archivos         lo que deja multer en req.files
 * @param {string}   opts.placa            va al nombre del archivo
 * @param {string}   opts.actividadNombre  va al nombre del archivo
 * @param {string|Date} opts.fechaEjecucion  decide la subcarpeta AAAA/MM
 * @returns {Promise<{filas: Array, rutasEscritas: string[]}>}
 */
async function guardarEvidencias({ conn, registroId, archivos, placa, actividadNombre, fechaEjecucion }) {
  const filas = []
  const rutasEscritas = []

  const lista = Array.isArray(archivos) ? archivos.filter(Boolean) : (archivos ? [archivos] : [])
  if (!lista.length) return { filas, rutasEscritas }

  const id = entero(registroId)
  if (!id) throw malaPeticion('No se puede guardar evidencia sin el registro al que pertenece')

  // AAAA/MM y no todo en un directorio: con dos fotos diarias, un solo
  // directorio llega a decenas de miles de entradas y hasta un `ls` en el
  // servidor se vuelve una espera.
  const { anio, mes } = anioMes(fechaEjecucion)
  const directorioAbs = path.join(directorioBase(), anio, mes)
  await fs.promises.mkdir(directorioAbs, { recursive: true })

  // El nombre lleva placa y actividad porque el archivo viaja solo: alguien lo
  // va a mirar desde la consola del servidor o desde Drive antes de que el
  // callback escriba nada, y «foto-3.jpg» no dice de qué vehículo es.
  const parte = [slug(placa, 12) || 'sinplaca', slug(actividadNombre, 24) || 'desinfeccion'].join('-')

  let n = 0
  for (const archivo of lista) {
    n++
    const nombreOriginal = String(archivo.originalname || `evidencia-${n}`).slice(0, 255)
    const entrada = await contenido(archivo)
    const sello = `${id}-${Date.now()}-${n}-${crypto.randomBytes(3).toString('hex')}`

    let datos, ext, mime
    try {
      datos = await sharp(entrada)
        .rotate()                                  // respeta el EXIF: la foto de celular viene girada
        .resize({ width: ANCHO_MAXIMO, withoutEnlargement: true })
        .jpeg({ quality: CALIDAD_JPEG, mozjpeg: true })
        .toBuffer()
      ext  = '.jpg'
      mime = 'image/jpeg'
    } catch (err) {
      // Si sharp no puede con el archivo (un PDF colado, un HEIC que esta
      // build no decodifica, una foto corrupta), se guarda el original tal
      // cual: una evidencia pesada sirve en una auditoría y una evidencia
      // perdida, no. Queda en el log para poder revisar el caso.
      ext  = extensionSegura(nombreOriginal)
      mime = mimeSeguro(archivo.mimetype, ext)
      datos = entrada
      console.error(
        `[desinf-evidencia] sharp no pudo procesar "${nombreOriginal}" del registro ${id}: ` +
        `${err.message}. Se guarda el original sin redimensionar.`)
    }

    const nombreArchivo = `${parte}-${sello}${ext}`
    const rutaAbsoluta  = path.join(directorioAbs, nombreArchivo)
    await fs.promises.writeFile(rutaAbsoluta, datos)
    rutasEscritas.push(rutaAbsoluta)

    // Relativa al directorio del módulo y con separador POSIX: es un dato que
    // se va a leer en la base y a mirar a ojo, no una ruta del sistema.
    const rutaRelativa = `${anio}/${mes}/${nombreArchivo}`
    const [r] = await conn.query(
      `INSERT INTO h360_desinf_evidencia (registro_id, ruta, nombre_original, mime, bytes)
       VALUES (?,?,?,?,?)`,
      [id, rutaRelativa, nombreOriginal, mime, datos.length])

    filas.push({ id: r.insertId, ruta: rutaRelativa, bytes: datos.length, mime })
  }

  return { filas, rutasEscritas }
}

/**
 * Borra del disco lo que se escribió. Para el rollback. Nunca lanza.
 *
 * Se llama justo cuando algo ya falló: si esto lanzara, taparía el error
 * original y el usuario vería «ENOENT» en vez de por qué no se guardó su
 * registro.
 */
async function descartarEvidencias(rutasEscritas) {
  for (const ruta of (Array.isArray(rutasEscritas) ? rutasEscritas : [])) {
    try {
      await fs.promises.unlink(ruta)
    } catch (err) {
      // Que ya no esté es el resultado buscado, no un problema.
      if (err && err.code !== 'ENOENT') {
        console.error(`[desinf-evidencia] no se pudo borrar ${ruta}: ${err.message}`)
      }
    }
  }
}

/**
 * Arma el payload y lo manda a n8n. Puede lanzar: lo envuelve
 * enviarEvidenciasADrive, que es el que promete no lanzar.
 */
async function copiarADrive(registroId) {
  const id = entero(registroId)
  if (!id) throw new Error(`registro inválido: ${registroId}`)

  // La fecha se formatea en SQL a propósito: el pool no define dateStrings, un
  // DATE volvería como Date y el ISO en UTC correría el día un servicio de la
  // madrugada a la carpeta del día anterior en Drive.
  const [[registro]] = await db.query(
    `SELECT r.id, r.actividad_nombre,
            DATE_FORMAT(r.fecha_ejecucion, '%Y-%m-%d') AS fecha_ejecucion,
            v.placa
       FROM h360_desinf_registro r
       JOIN vehiculos v ON v.id = r.vehiculo_id
      WHERE r.id = ?`, [id])

  if (!registro) throw new Error(`no existe el registro ${id}`)

  // Solo lo que no está en Drive: así esta misma función sirve de reintento
  // (el índice idx_desinf_evi_pendiente_drive existe justo para eso) sin
  // duplicar archivos allá.
  const [evidencias] = await db.query(
    `SELECT id, ruta, mime FROM h360_desinf_evidencia
      WHERE registro_id = ? AND drive_file_id IS NULL ORDER BY id`, [id])
  if (!evidencias.length) return null

  // base64 como en archivarDocumentosEnDrive del R-44: n8n está en la LAN y no
  // ve nuestro disco, así que el backend lee y manda el contenido.
  const archivos = []
  for (const e of evidencias) {
    const absoluta = rutaSegura(e.ruta)
    if (!absoluta) {
      console.error(`[desinf-drive] la evidencia ${e.id} tiene una ruta fuera del directorio base: ${e.ruta}`)
      continue
    }
    try {
      const buffer = await fs.promises.readFile(absoluta)
      archivos.push({
        evidencia_id: e.id,
        nombre:       path.basename(absoluta),
        mime_type:    mimeSeguro(e.mime, path.extname(absoluta).toLowerCase()),
        tamano_bytes: buffer.length,
        base64:       buffer.toString('base64'),
      })
    } catch (err) {
      console.error(`[desinf-drive] no se pudo leer la evidencia ${e.id} (${absoluta}): ${err.message}`)
    }
  }
  if (!archivos.length) return null

  const payload = {
    registro_id:     registro.id,
    // Los tres datos con los que el flujo arma las carpetas en Drive. Las
    // carpetas las crea n8n: desde acá no se tocan, para no tener dos sitios
    // decidiendo el árbol de Drive.
    placa:           registro.placa,
    fecha_ejecucion: registro.fecha_ejecucion,
    actividad:       registro.actividad_nombre,
    folder_id:       carpetaDrive(),
    // Mismo valor con el nombre que usa el flujo del R-44, para que un nodo
    // copiado de allá funcione sin editar la expresión.
    root_folder_id:  carpetaDrive(),
    callback_url:    urlCallback(),
    archivos,
  }

  const res = await axios.post(webhookDrive(), payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 20000,   // el cuerpo lleva varias fotos en base64
  })
  return res.data
}

/**
 * Fire-and-forget DESPUÉS del commit. Nunca lanza, nunca bloquea.
 *
 * Después del commit y no antes porque Drive es la copia secundaria: la
 * evidencia válida es la del servidor y la fila de la base. Si n8n está caído
 * (y se cae), el registro ya quedó guardado y drive_file_id sigue en NULL, que
 * es justo lo que permite reintentar luego.
 *
 * Devuelve la promesa interna para que las pruebas puedan esperarla; el
 * controlador NO debe hacerle await.
 */
function enviarEvidenciasADrive(registroId) {
  return copiarADrive(registroId).catch(err => {
    console.error(
      `[desinf-drive] falló la copia a Drive del registro ${registroId}: ${err.message}`)
    return null
  })
}

/**
 * GET /desinfecciones/evidencia/:id — sirve el binario con el token en la
 * cabecera, como el PDF del R-34: el frontend lo pide como blob con el token
 * y nunca como enlace directo.
 */
async function servirEvidencia(req, res, next) {
  try {
    const id = entero(req.params?.id)
    if (!id) return res.status(400).json({ mensaje: 'Id de evidencia inválido' })

    const [[fila]] = await db.query(
      'SELECT id, ruta, mime FROM h360_desinf_evidencia WHERE id = ?', [id])
    if (!fila) return res.status(404).json({ mensaje: 'Evidencia no encontrada' })

    const absoluta = rutaSegura(fila.ruta)
    if (!absoluta) {
      // Mismo 404 que si no existiera: el que pregunta no tiene por qué saber
      // si falló por la ruta o por la fila.
      console.error(`[desinf-evidencia] ruta fuera del directorio base en la evidencia ${id}: ${fila.ruta}`)
      return res.status(404).json({ mensaje: 'Evidencia no encontrada' })
    }

    let binario
    try {
      binario = await fs.promises.readFile(absoluta)
    } catch (err) {
      // La fila existe y el archivo no: es un dato distinto de «no existe la
      // evidencia» y hay que poder verlo en el log, porque significa que algo
      // se borró del disco sin pasar por acá.
      console.error(`[desinf-evidencia] la evidencia ${id} no está en disco (${absoluta}): ${err.message}`)
      return res.status(404).json({ mensaje: 'El archivo de la evidencia no está en el servidor' })
    }

    const ext = path.extname(absoluta).toLowerCase()
    res.setHeader('Content-Type', mimeSeguro(fila.mime, ext))
    // El nombre del archivo en disco y no nombre_original: lo segundo lo
    // escribe el cliente y acabaría dentro de una cabecera.
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(absoluta)}"`)
    // Privada: es evidencia sanitaria, no debe quedar en caché de proxys.
    res.setHeader('Cache-Control', 'private, max-age=86400')
    return res.send(binario)
  } catch (err) { next(err) }
}

/**
 * Acepta las dos formas del callback: una evidencia por llamada, o el lote
 * completo del registro. n8n puede estar armado de las dos maneras y no vale
 * la pena que el backend obligue a una.
 */
function itemsDelCallback(cuerpo) {
  const crudos = Array.isArray(cuerpo?.archivos) ? cuerpo.archivos
    : Array.isArray(cuerpo?.evidencias) ? cuerpo.evidencias
    : [cuerpo]

  const items = []
  for (const c of crudos) {
    const driveFileId = String(c?.drive_file_id ?? '').trim()
    // Los ids de Drive son [A-Za-z0-9_-] y la columna es VARCHAR(100). Se
    // valida la forma para no terminar con un HTML de error guardado como si
    // fuera el id del archivo en Drive.
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(driveFileId)) continue
    // «undefined» pasa la forma y es basura: una expresión de n8n que apunta a
    // un campo que no existe llega justo así, en texto, y quedaría guardada
    // como un id bueno. La evidencia figuraría archivada en Drive sin estarlo y
    // no volvería a entrar a los reintentos, que es el peor final posible.
    if (BASURA_DRIVE.includes(driveFileId.toLowerCase())) continue
    items.push({ evidenciaId: entero(c?.evidencia_id), driveFileId })
  }
  return items
}

/**
 * POST que llama n8n cuando ya subió el archivo a Drive: llena drive_file_id
 * y drive_at.
 *
 * ⚠️ AUTENTICACIÓN: n8n no puede mandar un JWT de usuario, así que esta ruta
 * va FUERA de verifyToken, igual que los callbacks del R-44
 * (/api/r44/documentos/drive y /api/r44/extraccion/resultado en
 * src/routes/r44Routes.js, montados sin r44Auth). En el proyecto ese callback
 * no tiene ninguna autenticación: no hay token compartido ni filtro por IP, se
 * confía en que el webhook solo es alcanzable desde la LAN. Acá se replica ese
 * montaje porque es el mecanismo que ya existe, pero se valida todo lo que se
 * puede validar sin secreto compartido:
 *   · registro_id entero y existente,
 *   · drive_file_id con forma de id de Drive,
 *   · la evidencia tiene que pertenecer a ese registro,
 *   · y nunca se sobreescribe un drive_file_id ya puesto.
 * Lo peor que logra un tercero que alcance el endpoint es marcar una evidencia
 * como archivada en Drive cuando no lo está; no puede leer ni borrar nada.
 */
async function callbackDrive(req, res, next) {
  try {
    const registroId = entero(req.body?.registro_id)
    if (!registroId) {
      return res.status(400).json({ ok: false, mensaje: 'registro_id requerido' })
    }

    const items = itemsDelCallback(req.body)
    if (!items.length) {
      return res.status(400).json({ ok: false, mensaje: 'drive_file_id requerido con forma de id de Drive' })
    }

    const [[registro]] = await db.query(
      'SELECT id FROM h360_desinf_registro WHERE id = ?', [registroId])
    if (!registro) {
      return res.status(404).json({ ok: false, mensaje: `No existe el registro ${registroId}` })
    }

    let actualizadas = 0
    let yaRegistradas = 0

    for (const item of items) {
      // Con evidencia_id se marca esa; sin él, la más antigua que falte. Lo
      // segundo existe porque un flujo que sube un archivo por ejecución no
      // siempre tiene a mano el id que le mandamos.
      const [[fila]] = item.evidenciaId
        ? await db.query(
          'SELECT id, drive_file_id FROM h360_desinf_evidencia WHERE id = ? AND registro_id = ?',
          [item.evidenciaId, registroId])
        : await db.query(
          `SELECT id, drive_file_id FROM h360_desinf_evidencia
            WHERE registro_id = ? AND drive_file_id IS NULL ORDER BY id LIMIT 1`,
          [registroId])

      if (!fila) {
        return res.status(404).json({
          ok: false,
          mensaje: item.evidenciaId
            ? `La evidencia ${item.evidenciaId} no existe o no es del registro ${registroId}`
            : `El registro ${registroId} no tiene evidencias pendientes de Drive`,
        })
      }

      if (fila.drive_file_id) {
        // Reintento de n8n con el mismo id: idempotente.
        if (fila.drive_file_id === item.driveFileId) { yaRegistradas++; continue }
        // Dos ids distintos para la misma evidencia significa que hay dos
        // copias en Drive o que alguien se equivocó de fila. Perder el primero
        // deja un archivo huérfano allá que nadie va a encontrar.
        return res.status(409).json({
          ok: false,
          mensaje: `La evidencia ${fila.id} ya tiene otro drive_file_id; no se sobreescribe`,
        })
      }

      await db.query(
        `UPDATE h360_desinf_evidencia SET drive_file_id = ?, drive_at = NOW()
          WHERE id = ? AND drive_file_id IS NULL`,
        [item.driveFileId, fila.id])
      actualizadas++
    }

    return res.json({
      ok: true, registro_id: registroId, actualizadas, ya_registradas: yaRegistradas,
    })
  } catch (err) { next(err) }
}

module.exports = {
  subidaEvidencia,
  guardarEvidencias,
  descartarEvidencias,
  enviarEvidenciasADrive,
  servirEvidencia,
  callbackDrive,
  // Para las pruebas y para un script de mantenimiento que necesite ubicar los
  // archivos; el resto del código no debería armar rutas por su cuenta.
  directorioBase,
  MAX_ARCHIVOS,
  CAMPO_ARCHIVO,
}
