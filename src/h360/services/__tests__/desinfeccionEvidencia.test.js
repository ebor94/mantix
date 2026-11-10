// Evidencia fotográfica de las desinfecciones.
//
// Lo que se cuida acá es lo que no se nota hasta que duele: que la foto se
// reduzca ANTES de tocar el disco (en producción `uploads/` ya pesa 8,4 GB),
// que en la base quede la ruta relativa y no la absoluta (el día que el
// directorio se mueva, una ruta absoluta deja toda la evidencia inalcanzable),
// que un fallo de sharp no se lleve la evidencia, que un rollback no deje
// basura, que n8n caído no tumbe el registro, y que servir un archivo por id
// no sea una forma de leer /etc/passwd.

const path = require('path')

jest.mock('../../config/db')
jest.mock('axios')

// Solo se reemplaza fs.promises: el resto de fs queda real porque otros
// módulos del árbol (multer entre ellos) lo usan.
jest.mock('fs', () => {
  const real = jest.requireActual('fs')
  return {
    ...real,
    promises: {
      mkdir:     jest.fn(),
      writeFile: jest.fn(),
      unlink:    jest.fn(),
      readFile:  jest.fn(),
    },
  }
})

jest.mock('sharp', () => {
  const api = {}
  api.rotate   = jest.fn(() => api)
  api.resize   = jest.fn(() => api)
  api.jpeg     = jest.fn(() => api)
  api.toBuffer = jest.fn()
  const fabrica = jest.fn(() => api)
  fabrica.__api = api
  return fabrica
})

const fs      = require('fs')
const axios   = require('axios')
const sharp   = require('sharp')
const db      = require('../../config/db')
const express = require('express')
const request = require('supertest')
const svc     = require('../desinfeccionEvidencia.service')

const BASE      = '/srv/h360-evidencias'
const REDUCIDA  = Buffer.from('jpeg-ya-reducido')
const ORIGINAL  = Buffer.from('original-de-celular-pesado')
const CARPETA   = '1DBF4FUBe_oq5Ol0-dR-43aUMjCblbdJh'

const envOriginal = { ...process.env }

// Conexión de transacción simulada: guarda lo que se escribió para poder
// afirmar sobre los INSERT.
function connDoble() {
  let secuencia = 900
  const c = { consultas: [] }
  c.query = jest.fn(async (sql, params) => {
    c.consultas.push({ sql, params })
    return [{ insertId: ++secuencia }]
  })
  return c
}

function resDoble() {
  const r = { codigo: 200, cuerpo: null, cabeceras: {}, enviado: null }
  r.status = c => { r.codigo = c; return r }
  r.json = b => { r.cuerpo = b; return r }
  r.send = b => { r.enviado = b; return r }
  r.setHeader = (k, v) => { r.cabeceras[k.toLowerCase()] = v }
  return r
}

const archivoEnMemoria = (nombre, mime, buffer = ORIGINAL) =>
  ({ originalname: nombre, mimetype: mime, buffer })

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})

  process.env = { ...envOriginal, DESINF_UPLOAD_PATH: BASE, MAX_FILE_SIZE_MB: '10' }
  delete process.env.DESINF_DRIVE_FOLDER_ID
  delete process.env.N8N_WEBHOOK_EVIDENCIAS_URL
  delete process.env.DESINF_DRIVE_CALLBACK_URL

  fs.promises.mkdir.mockResolvedValue(undefined)
  fs.promises.writeFile.mockResolvedValue(undefined)
  fs.promises.unlink.mockResolvedValue(undefined)
  fs.promises.readFile.mockResolvedValue(Buffer.from('binario'))

  sharp.mockImplementation(() => sharp.__api)
  sharp.__api.rotate.mockImplementation(() => sharp.__api)
  sharp.__api.resize.mockImplementation(() => sharp.__api)
  sharp.__api.jpeg.mockImplementation(() => sharp.__api)
  sharp.__api.toBuffer.mockResolvedValue(REDUCIDA)

  axios.post = jest.fn().mockResolvedValue({ data: { ok: true } })
  db.query = jest.fn(async () => [[]])
})

afterAll(() => { process.env = envOriginal })

// ── Guardar ────────────────────────────────────────────────────────────────
describe('guardarEvidencias', () => {
  const datos = {
    registroId: 77,
    placa: 'WGX-123',
    actividadNombre: 'Desinfección choque',
    fechaEjecucion: '2026-11-09',
  }

  test('redimensiona antes de escribir y guarda en la base la ruta RELATIVA', async () => {
    const conn = connDoble()
    const r = await svc.guardarEvidencias({
      ...datos, conn, archivos: [archivoEnMemoria('IMG_4821.HEIC', 'image/heic')],
    })

    // Se redujo a 1600 px y calidad 80, sin agrandar lo que ya venía chico.
    expect(sharp).toHaveBeenCalledWith(ORIGINAL)
    expect(sharp.__api.resize).toHaveBeenCalledWith({ width: 1600, withoutEnlargement: true })
    expect(sharp.__api.jpeg).toHaveBeenCalledWith({ quality: 80, mozjpeg: true })

    // Lo que aterriza en disco es el JPEG reducido, nunca el original.
    expect(fs.promises.writeFile).toHaveBeenCalledTimes(1)
    const [rutaEscrita, contenido] = fs.promises.writeFile.mock.calls[0]
    expect(contenido).toBe(REDUCIDA)
    expect(rutaEscrita.startsWith(path.join(BASE, '2026', '11') + path.sep)).toBe(true)
    expect(fs.promises.mkdir).toHaveBeenCalledWith(path.join(BASE, '2026', '11'), { recursive: true })

    // En la base, relativa al directorio del módulo.
    const insert = conn.consultas.find(q => /INSERT INTO h360_desinf_evidencia/i.test(q.sql))
    expect(insert).toBeDefined()
    const [registroId, ruta, nombreOriginal, mime, bytes] = insert.params
    expect(registroId).toBe(77)
    expect(ruta).toMatch(/^2026\/11\//)
    expect(path.isAbsolute(ruta)).toBe(false)
    expect(ruta).not.toContain(BASE)
    expect(nombreOriginal).toBe('IMG_4821.HEIC')
    expect(mime).toBe('image/jpeg')
    expect(bytes).toBe(REDUCIDA.length)

    // El nombre del archivo lleva placa y actividad: el archivo viaja solo a
    // Drive y a la consola del servidor.
    expect(path.basename(ruta)).toMatch(/^wgx-123-desinfeccion-choque-77-/)
    expect(ruta.endsWith('.jpg')).toBe(true)

    // Y el controlador recibe la ruta ABSOLUTA para poder borrarla.
    expect(r.rutasEscritas).toEqual([rutaEscrita])
    expect(path.isAbsolute(r.rutasEscritas[0])).toBe(true)
    expect(r.filas).toEqual([{ id: 901, ruta, bytes: REDUCIDA.length, mime: 'image/jpeg' }])
  })

  test('si sharp falla guarda el original en vez de perder la evidencia', async () => {
    sharp.__api.toBuffer.mockRejectedValue(new Error('Input buffer contains unsupported image format'))
    const conn = connDoble()

    const r = await svc.guardarEvidencias({
      ...datos, conn, archivos: [archivoEnMemoria('acta.pdf', 'application/pdf')],
    })

    const [ruta, contenido] = fs.promises.writeFile.mock.calls[0]
    expect(contenido).toBe(ORIGINAL)            // se escribió, no se perdió
    expect(ruta.endsWith('.jpg')).toBe(true)    // extensión no permitida → se normaliza
    const insert = conn.consultas.find(q => /INSERT INTO h360_desinf_evidencia/i.test(q.sql))
    expect(insert.params[4]).toBe(ORIGINAL.length)
    expect(r.filas[0].bytes).toBe(ORIGINAL.length)
    // Y queda en el log para poder revisar el caso.
    expect(console.error.mock.calls.join(' ')).toMatch(/sharp no pudo procesar/)
  })

  test('conserva la extensión original cuando es una foto que sharp no pudo procesar', async () => {
    sharp.__api.toBuffer.mockRejectedValue(new Error('heif: unsupported'))
    const conn = connDoble()
    await svc.guardarEvidencias({
      ...datos, conn, archivos: [archivoEnMemoria('IMG_1.heic', 'image/heic')],
    })
    const [ruta] = fs.promises.writeFile.mock.calls[0]
    expect(ruta.endsWith('.heic')).toBe(true)
    const insert = conn.consultas[0]
    expect(insert.params[3]).toBe('image/heic')
  })

  test('un mime inventado por el cliente no llega a la base', async () => {
    sharp.__api.toBuffer.mockRejectedValue(new Error('no procesable'))
    const conn = connDoble()
    await svc.guardarEvidencias({
      ...datos, conn,
      archivos: [archivoEnMemoria('IMG_2.png', 'text/html;x=\n')],
    })
    expect(conn.consultas[0].params[3]).toBe('image/png')
  })

  test('organiza en AAAA/MM y acepta la fecha como Date sin correr el mes', async () => {
    const conn = connDoble()
    await svc.guardarEvidencias({
      ...datos, conn, fechaEjecucion: new Date(2026, 0, 1),   // 1 de enero local
      archivos: [archivoEnMemoria('a.jpg', 'image/jpeg')],
    })
    expect(fs.promises.mkdir).toHaveBeenCalledWith(path.join(BASE, '2026', '01'), { recursive: true })
    expect(conn.consultas[0].params[1]).toMatch(/^2026\/01\//)
  })

  test('guarda las seis fotos de un registro con nombres distintos', async () => {
    const conn = connDoble()
    const seis = Array.from({ length: 6 }, (_, i) => archivoEnMemoria(`f${i}.jpg`, 'image/jpeg'))
    const r = await svc.guardarEvidencias({ ...datos, conn, archivos: seis })

    expect(fs.promises.writeFile).toHaveBeenCalledTimes(6)
    expect(r.filas).toHaveLength(6)
    expect(new Set(r.rutasEscritas).size).toBe(6)
  })

  test('sin archivos no toca el disco ni la base', async () => {
    const conn = connDoble()
    const r = await svc.guardarEvidencias({ ...datos, conn, archivos: [] })
    expect(r).toEqual({ filas: [], rutasEscritas: [] })
    expect(fs.promises.mkdir).not.toHaveBeenCalled()
    expect(conn.query).not.toHaveBeenCalled()
  })

  test('sin registro no escribe nada', async () => {
    const conn = connDoble()
    await expect(svc.guardarEvidencias({
      ...datos, conn, registroId: null, archivos: [archivoEnMemoria('a.jpg', 'image/jpeg')],
    })).rejects.toThrow(/sin el registro/)
    expect(fs.promises.writeFile).not.toHaveBeenCalled()
  })

  test('DESINF_UPLOAD_PATH manda sobre el default', async () => {
    process.env.DESINF_UPLOAD_PATH = '/var/mantix/evidencias-desinfeccion'
    const conn = connDoble()
    await svc.guardarEvidencias({ ...datos, conn, archivos: [archivoEnMemoria('a.jpg', 'image/jpeg')] })
    expect(fs.promises.mkdir).toHaveBeenCalledWith(
      path.join('/var/mantix/evidencias-desinfeccion', '2026', '11'), { recursive: true })
  })

  // Esta prueba no fija una ruta: fija la PROPIEDAD que importa. `app.js` sirve
  // todo `uploads/` con express.static y CORS abierto (comprobado contra
  // produccion: un archivo de uploads/evidencias responde 200 desde internet),
  // asi que un default que caiga ahi dentro deja la evidencia sanitaria
  // descargable sin token. Si alguien vuelve a colgar el default de UPLOAD_PATH,
  // esto se pone rojo.
  test('el default NO cae dentro del arbol que express.static publica', async () => {
    delete process.env.DESINF_UPLOAD_PATH
    process.env.UPLOAD_PATH = '/var/mantix/uploads'
    const conn = connDoble()
    await svc.guardarEvidencias({ ...datos, conn, archivos: [archivoEnMemoria('a.jpg', 'image/jpeg')] })

    const [[dirUsado]] = fs.promises.mkdir.mock.calls
    expect(dirUsado).not.toContain('/uploads/')
    expect(dirUsado).not.toMatch(/[\\/]uploads$/)
    expect(dirUsado).toContain('evidencias-desinfeccion')
  })
})

// ── Rollback ───────────────────────────────────────────────────────────────
describe('descartarEvidencias', () => {
  test('borra todo lo que se escribió', async () => {
    await svc.descartarEvidencias(['/a/1.jpg', '/a/2.jpg'])
    expect(fs.promises.unlink.mock.calls.map(c => c[0])).toEqual(['/a/1.jpg', '/a/2.jpg'])
  })

  // Se llama justo cuando algo ya falló: si lanzara, taparía el error real.
  test('no lanza si el archivo ya no está y sigue con los demás', async () => {
    fs.promises.unlink
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(undefined)

    await expect(svc.descartarEvidencias(['/a/no-esta.jpg', '/a/2.jpg'])).resolves.toBeUndefined()
    expect(fs.promises.unlink).toHaveBeenCalledTimes(2)
    // ENOENT es el resultado buscado: no se ensucia el log con eso.
    expect(console.error).not.toHaveBeenCalled()
  })

  test('no lanza con un error de permisos, pero lo deja en el log', async () => {
    fs.promises.unlink.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
    await expect(svc.descartarEvidencias(['/a/1.jpg'])).resolves.toBeUndefined()
    expect(console.error.mock.calls.join(' ')).toMatch(/no se pudo borrar/)
  })

  test('tolera que no haya nada que borrar', async () => {
    await expect(svc.descartarEvidencias(undefined)).resolves.toBeUndefined()
    expect(fs.promises.unlink).not.toHaveBeenCalled()
  })
})

// ── Copia a Drive ──────────────────────────────────────────────────────────
describe('enviarEvidenciasADrive', () => {
  function baseDeDatosConRegistro({ evidencias } = {}) {
    db.query = jest.fn(async sql => {
      if (/FROM h360_desinf_registro/i.test(sql)) {
        return [[{
          id: 77, actividad_nombre: 'Desinfección choque',
          fecha_ejecucion: '2026-11-09', placa: 'WGX-123',
        }]]
      }
      if (/FROM h360_desinf_evidencia/i.test(sql)) {
        return [evidencias ?? [{ id: 11, ruta: '2026/11/foto.jpg', mime: 'image/jpeg' }]]
      }
      return [[]]
    })
  }

  test('el payload lleva placa, fecha y actividad, y el folder_id sale del entorno', async () => {
    process.env.DESINF_DRIVE_FOLDER_ID = 'CARPETA_DE_PRUEBA_123'
    process.env.N8N_WEBHOOK_EVIDENCIAS_URL = 'http://n8n.prueba/webhook/evidencia'
    baseDeDatosConRegistro()

    await svc.enviarEvidenciasADrive(77)

    expect(axios.post).toHaveBeenCalledTimes(1)
    const [url, payload] = axios.post.mock.calls[0]
    expect(url).toBe('http://n8n.prueba/webhook/evidencia')
    expect(payload.placa).toBe('WGX-123')
    expect(payload.fecha_ejecucion).toBe('2026-11-09')
    expect(payload.actividad).toBe('Desinfección choque')
    expect(payload.folder_id).toBe('CARPETA_DE_PRUEBA_123')
    expect(payload.root_folder_id).toBe('CARPETA_DE_PRUEBA_123')
    expect(payload.callback_url).toMatch(/\/h360\/desinfecciones\/evidencia\/drive$/)
    // El backend lee el archivo y manda base64, como el archivado del R-44.
    expect(payload.archivos).toEqual([{
      evidencia_id: 11,
      nombre:       'foto.jpg',
      mime_type:    'image/jpeg',
      tamano_bytes: 7,
      base64:       Buffer.from('binario').toString('base64'),
    }])
  })

  test('sin variables de entorno usa la carpeta y el webhook de producción', async () => {
    baseDeDatosConRegistro()
    await svc.enviarEvidenciasADrive(77)
    const [url, payload] = axios.post.mock.calls[0]
    expect(payload.folder_id).toBe(CARPETA)
    expect(url).toBe('http://192.9.17.10:5678/webhook/desinfeccion-evidencia-drive')
  })

  test('la fecha se formatea en SQL y no se recorta de un ISO', async () => {
    baseDeDatosConRegistro()
    await svc.enviarEvidenciasADrive(77)
    expect(db.query.mock.calls[0][0]).toMatch(/DATE_FORMAT\(r\.fecha_ejecucion, '%Y-%m-%d'\)/)
  })

  // n8n se cae; el registro ya está guardado y drive_file_id sigue en NULL,
  // que es lo que permite reintentar. Lo que no puede pasar es que explote.
  test('no lanza cuando n8n está caído y deja el error en el log', async () => {
    baseDeDatosConRegistro()
    axios.post.mockRejectedValue(new Error('connect ECONNREFUSED 192.9.17.10:5678'))

    await expect(svc.enviarEvidenciasADrive(77)).resolves.toBeNull()
    expect(console.error.mock.calls.join(' ')).toMatch(/ECONNREFUSED/)
  })

  test('no lanza si el registro no existe', async () => {
    db.query = jest.fn(async () => [[]])
    await expect(svc.enviarEvidenciasADrive(999)).resolves.toBeNull()
    expect(axios.post).not.toHaveBeenCalled()
    expect(console.error.mock.calls.join(' ')).toMatch(/no existe el registro 999/)
  })

  test('solo manda lo que no está en Drive: sin pendientes no llama a n8n', async () => {
    baseDeDatosConRegistro({ evidencias: [] })
    await expect(svc.enviarEvidenciasADrive(77)).resolves.toBeNull()
    expect(axios.post).not.toHaveBeenCalled()
    expect(db.query.mock.calls[1][0]).toMatch(/drive_file_id IS NULL/)
  })

  test('una ruta que se sale del directorio base no se lee ni se manda', async () => {
    baseDeDatosConRegistro({ evidencias: [{ id: 11, ruta: '../../etc/passwd', mime: 'image/jpeg' }] })
    await expect(svc.enviarEvidenciasADrive(77)).resolves.toBeNull()
    expect(fs.promises.readFile).not.toHaveBeenCalled()
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('si un archivo no está en disco manda los demás', async () => {
    baseDeDatosConRegistro({ evidencias: [
      { id: 11, ruta: '2026/11/a.jpg', mime: 'image/jpeg' },
      { id: 12, ruta: '2026/11/b.jpg', mime: 'image/jpeg' },
    ] })
    fs.promises.readFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(Buffer.from('binario'))

    await svc.enviarEvidenciasADrive(77)
    expect(axios.post.mock.calls[0][1].archivos.map(a => a.evidencia_id)).toEqual([12])
  })
})

// ── Servir el binario ──────────────────────────────────────────────────────
describe('servirEvidencia', () => {
  test('sirve el binario con el mime y la cabecera de descarga', async () => {
    db.query = jest.fn(async () => [[{ id: 11, ruta: '2026/11/foto.jpg', mime: 'image/jpeg' }]])
    const res = resDoble()

    await svc.servirEvidencia({ params: { id: '11' } }, res, jest.fn())

    expect(fs.promises.readFile).toHaveBeenCalledWith(path.join(BASE, '2026', '11', 'foto.jpg'))
    expect(res.cabeceras['content-type']).toBe('image/jpeg')
    expect(res.cabeceras['content-disposition']).toBe('inline; filename="foto.jpg"')
    expect(res.cabeceras['cache-control']).toBe('private, max-age=86400')
    expect(res.enviado).toEqual(Buffer.from('binario'))
  })

  test('404 si la fila no existe', async () => {
    db.query = jest.fn(async () => [[]])
    const res = resDoble()
    await svc.servirEvidencia({ params: { id: '404' } }, res, jest.fn())
    expect(res.codigo).toBe(404)
    expect(fs.promises.readFile).not.toHaveBeenCalled()
  })

  // Las rutas las escribe este servicio, pero servir por id un valor de la
  // base sin normalizar es cómo se leen archivos del sistema.
  test.each([
    ['relativa hacia arriba', '../../etc/passwd'],
    ['absoluta',              '/etc/passwd'],
    ['mezclada',              '2026/11/../../../../etc/passwd'],
  ])('no se sale del directorio base con una ruta %s', async (_, ruta) => {
    db.query = jest.fn(async () => [[{ id: 11, ruta, mime: 'image/jpeg' }]])
    const res = resDoble()

    await svc.servirEvidencia({ params: { id: '11' } }, res, jest.fn())

    expect(res.codigo).toBe(404)
    expect(fs.promises.readFile).not.toHaveBeenCalled()
    expect(console.error.mock.calls.join(' ')).toMatch(/fuera del directorio base/)
  })

  test('404 cuando la fila existe pero el archivo no está en disco', async () => {
    db.query = jest.fn(async () => [[{ id: 11, ruta: '2026/11/foto.jpg', mime: 'image/jpeg' }]])
    fs.promises.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const res = resDoble()

    await svc.servirEvidencia({ params: { id: '11' } }, res, jest.fn())
    expect(res.codigo).toBe(404)
    expect(res.cuerpo.mensaje).toMatch(/no está en el servidor/)
  })

  test('400 con un id que no es un id', async () => {
    const res = resDoble()
    await svc.servirEvidencia({ params: { id: 'abc' } }, res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('un mime guardado raro no se refleja en la cabecera', async () => {
    db.query = jest.fn(async () => [[{ id: 11, ruta: '2026/11/foto.png', mime: 'text/html' }]])
    const res = resDoble()
    await svc.servirEvidencia({ params: { id: '11' } }, res, jest.fn())
    expect(res.cabeceras['content-type']).toBe('image/png')
  })

  test('un error inesperado va al manejador de Express', async () => {
    db.query = jest.fn(async () => { throw new Error('base caída') })
    const next = jest.fn()
    await svc.servirEvidencia({ params: { id: '11' } }, resDoble(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

// ── Callback de n8n ────────────────────────────────────────────────────────
describe('callbackDrive', () => {
  // La ruta va fuera de verifyToken (n8n no puede mandar un JWT), igual que
  // los callbacks del R-44. Sin secreto compartido, la validación de forma y
  // la negativa a sobreescribir son la única defensa que hay.
  function baseConEvidencia(fila) {
    db.query = jest.fn(async sql => {
      if (/FROM h360_desinf_registro/i.test(sql)) return [[{ id: 77 }]]
      if (/FROM h360_desinf_evidencia/i.test(sql)) return [fila ? [fila] : []]
      return [{ affectedRows: 1 }]
    })
  }

  test('llena drive_file_id y drive_at de la evidencia pendiente', async () => {
    baseConEvidencia({ id: 11, drive_file_id: null })
    const res = resDoble()

    await svc.callbackDrive({ body: { registro_id: 77, evidencia_id: 11, drive_file_id: 'abc123XYZ_-9' } }, res, jest.fn())

    expect(res.cuerpo).toEqual({ ok: true, registro_id: 77, actualizadas: 1, ya_registradas: 0 })
    const update = db.query.mock.calls.find(c => /UPDATE h360_desinf_evidencia/i.test(c[0]))
    expect(update[0]).toMatch(/drive_at = NOW\(\)/)
    expect(update[1]).toEqual(['abc123XYZ_-9', 11])
  })

  test('acepta el lote completo del registro', async () => {
    db.query = jest.fn(async sql => {
      if (/FROM h360_desinf_registro/i.test(sql)) return [[{ id: 77 }]]
      if (/FROM h360_desinf_evidencia/i.test(sql)) return [[{ id: 11, drive_file_id: null }]]
      return [{ affectedRows: 1 }]
    })
    const res = resDoble()

    await svc.callbackDrive({ body: { registro_id: 77, archivos: [
      { evidencia_id: 11, drive_file_id: 'driveFileUno_1' },
      { evidencia_id: 12, drive_file_id: 'driveFileDos_2' },
    ] } }, res, jest.fn())

    expect(res.cuerpo.actualizadas).toBe(2)
  })

  test('rechaza un registro_id inexistente', async () => {
    db.query = jest.fn(async () => [[]])
    const res = resDoble()
    await svc.callbackDrive({ body: { registro_id: 4242, drive_file_id: 'abc123XYZ_-9' } }, res, jest.fn())
    expect(res.codigo).toBe(404)
    expect(res.cuerpo.mensaje).toMatch(/No existe el registro 4242/)
    expect(db.query.mock.calls.some(c => /UPDATE/i.test(c[0]))).toBe(false)
  })

  test('no sobreescribe un drive_file_id ya puesto', async () => {
    baseConEvidencia({ id: 11, drive_file_id: 'elQueYaEstaba1' })
    const res = resDoble()

    await svc.callbackDrive({ body: { registro_id: 77, evidencia_id: 11, drive_file_id: 'otroDistinto_2' } }, res, jest.fn())

    expect(res.codigo).toBe(409)
    expect(db.query.mock.calls.some(c => /UPDATE/i.test(c[0]))).toBe(false)
  })

  // n8n reintenta: el mismo id dos veces no es un conflicto.
  test('es idempotente con el mismo drive_file_id', async () => {
    baseConEvidencia({ id: 11, drive_file_id: 'elMismoDeAntes1' })
    const res = resDoble()
    await svc.callbackDrive({ body: { registro_id: 77, evidencia_id: 11, drive_file_id: 'elMismoDeAntes1' } }, res, jest.fn())
    expect(res.cuerpo).toEqual({ ok: true, registro_id: 77, actualizadas: 0, ya_registradas: 1 })
    expect(db.query.mock.calls.some(c => /UPDATE/i.test(c[0]))).toBe(false)
  })

  test.each([
    ['sin registro_id',      { drive_file_id: 'abc123XYZ_-9' }],
    ['registro_id no entero', { registro_id: 'ayer', drive_file_id: 'abc123XYZ_-9' }],
  ])('400 %s', async (_, body) => {
    const res = resDoble()
    await svc.callbackDrive({ body }, res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })

  test.each([
    ['ausente',   undefined],
    ['vacío',     ''],
    ['basura',    'no es un id de drive!!'],
    ['literal',   'undefined'],
  ])('400 si el drive_file_id viene %s', async (_, valor) => {
    const res = resDoble()
    await svc.callbackDrive({ body: { registro_id: 77, drive_file_id: valor } }, res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('404 si la evidencia no es de ese registro', async () => {
    baseConEvidencia(null)
    const res = resDoble()
    await svc.callbackDrive({ body: { registro_id: 77, evidencia_id: 99, drive_file_id: 'abc123XYZ_-9' } }, res, jest.fn())
    expect(res.codigo).toBe(404)
    expect(db.query.mock.calls.find(c => /FROM h360_desinf_evidencia/i.test(c[0]))[1]).toEqual([99, 77])
  })

  test('sin evidencia_id marca la más antigua pendiente', async () => {
    baseConEvidencia({ id: 11, drive_file_id: null })
    const res = resDoble()
    await svc.callbackDrive({ body: { registro_id: 77, drive_file_id: 'abc123XYZ_-9' } }, res, jest.fn())
    const select = db.query.mock.calls.find(c => /FROM h360_desinf_evidencia/i.test(c[0]))
    expect(select[0]).toMatch(/drive_file_id IS NULL ORDER BY id LIMIT 1/)
    expect(res.cuerpo.actualizadas).toBe(1)
  })
})

// ── El multer del módulo ───────────────────────────────────────────────────
describe('subidaEvidencia', () => {
  function app() {
    const a = express()
    a.post('/sube', svc.subidaEvidencia, (req, res) =>
      res.json({
        archivos: (req.files || []).map(f => ({
          nombre: f.originalname, enMemoria: Buffer.isBuffer(f.buffer), bytes: f.size,
        })),
      }))
    a.use((err, req, res, _next) =>
      res.status(err.status || 500).json({ mensaje: err.message, code: err.code }))
    return a
  }

  test('acepta las fotos en el campo evidencia y las deja en memoria', async () => {
    const r = await request(app()).post('/sube')
      .attach('evidencia', Buffer.from('foto1'), 'IMG_1.jpg')
      .attach('evidencia', Buffer.from('foto2'), 'IMG_2.HEIC')
      .expect(200)

    expect(r.body.archivos).toEqual([
      { nombre: 'IMG_1.jpg',  enMemoria: true, bytes: 5 },
      { nombre: 'IMG_2.HEIC', enMemoria: true, bytes: 5 },
    ])
    // Nada tocó el disco: por eso un rollback no deja basura.
    expect(fs.promises.writeFile).not.toHaveBeenCalled()
  })

  // Es evidencia FOTOGRÁFICA: el talonario escaneado va por ORDEN_SERVICIO.
  test('rechaza un pdf con un mensaje que explica qué hacer', async () => {
    const r = await request(app()).post('/sube')
      .attach('evidencia', Buffer.from('%PDF-1.4'), 'talonario.pdf')
      .expect(400)
    expect(r.body.mensaje).toMatch(/fotográfica/)
  })

  test('rechaza cualquier otro formato', async () => {
    const r = await request(app()).post('/sube')
      .attach('evidencia', Buffer.from('MZ'), 'virus.exe')
      .expect(400)
    expect(r.body.mensaje).toMatch(/Solo fotos/)
  })

  test('no acepta más de seis archivos', async () => {
    let peticion = request(app()).post('/sube')
    for (let i = 0; i < 7; i++) peticion = peticion.attach('evidencia', Buffer.from('x'), `f${i}.jpg`)
    const r = await peticion
    expect(r.status).not.toBe(200)
    expect(r.body.code).toMatch(/LIMIT_FILE_COUNT|LIMIT_UNEXPECTED_FILE/)
  })

  test('ignora otros campos de archivo', async () => {
    const r = await request(app()).post('/sube')
      .attach('fotos', Buffer.from('x'), 'f.jpg')
    expect(r.body.code).toBe('LIMIT_UNEXPECTED_FILE')
  })
})
