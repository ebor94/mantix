/**
 * duelo.peticion.js — lo que los controladores del R-56 leen de una petición:
 * quién la manda y sobre qué gestión actúa.
 *
 * Vive acá porque son DOS controladores hermanos sobre las mismas tablas
 * (duelo.controller.js y duelo_atenciones.controller.js). Con una copia en cada
 * uno, el mismo caso se respondía distinto según la ruta —un 403 que explica qué
 * hacer en el de atenciones y un 500 mudo en el de la gestión— y la diferencia
 * no se veía leyendo ninguno de los dos archivos completo. Un solo criterio, en
 * un solo lugar.
 */
const { malUso } = require('./errores')

/** Cuánto de lo que llegó se cita en un mensaje: el valor puede ser enorme. */
const eco = v => {
  const t = String(v)
  return JSON.stringify(t.length > 40 ? `${t.slice(0, 40)}…` : t)
}

/**
 * Quién hace el registro, según el login: el texto RECORTADO, o null si la
 * sesión no trae un nombre de usuario con contenido.
 *
 * De acá salen `psicologa` y `created_by`, que son columnas NOT NULL y son toda
 * la auditoría del módulo: en el Excel ese nombre se escribía a mano 1850 veces
 * y no había forma de saber quién atendió de verdad. Por eso solo vale un texto
 * con contenido; cualquier otra cosa (ausente, null, vacío, solo espacios,
 * número, objeto, arreglo) es «no hay usuario».
 *
 * Se devuelve recortado, el mismo valor que se validó: guardar ' JAZMIN ' con
 * los espacios dejaría dos nombres distintos para la misma persona.
 */
function usuarioDelLogin(req) {
  const u = req?.user?.usuario
  if (typeof u !== 'string') return null
  const limpio = u.trim()
  return limpio !== '' ? limpio : null
}

/**
 * La respuesta cuando la sesión no trae nombre de usuario. Es un 403 y no un
 * 500: no es una falla del servidor, es una sesión que no sirve para auditar, y
 * el mensaje dice qué hacer. Hoy no es alcanzable (ldap.service siempre devuelve
 * un usuario con contenido y el login rechaza el vacío), y aun así los tres
 * sitios contestan lo mismo en vez de reventar cada uno a su manera.
 */
function sinUsuario(res) {
  return res.status(403).json({
    mensaje: 'No se pudo identificar a la persona que hace el registro: ' +
      'la sesión no trae el nombre de usuario. Cierra sesión, ingresa de nuevo ' +
      'y, si persiste, avisa a soporte.',
  })
}

/** Solo dígitos: ni signo, ni punto, ni notación exponencial, ni espacios. */
const ES_ID = /^\d+$/

/**
 * El id de la gestión que viene en la ruta, ya validado.
 *
 * Las columnas son INT UNSIGNED. Un id no numérico («abc», un id pegado a otro
 * texto) entraba al SQL tal cual: en una escritura, MySQL en modo estricto corta
 * la sentencia (ER_TRUNCATED_WRONG_VALUE) y desde la API es un 500 que no dice
 * nada; en una lectura es peor, porque la comparación no coincide con nada y la
 * respuesta sale vacía, que en este módulo se lee como «esta familia no tiene
 * nada registrado». Las dos cosas se cierran con un 400 que dice qué se
 * esperaba. No es alcanzable desde la pantalla (el id sale de la ficha), pero es
 * lo primero que alguien escribe a mano al depurar.
 *
 * Devuelve el texto tal como llegó, no un número: ya está comprobado que son
 * solo dígitos, y así lo que se le pasa al servicio es exactamente lo que pidió
 * la ruta.
 */
function leerId(valor) {
  const v = typeof valor === 'string' ? valor.trim() : valor
  if (typeof v !== 'string' || !ES_ID.test(v))
    throw malUso(`El id de la gestión debe ser un número (solo dígitos); llegó ${eco(valor)}.`)
  return v
}

module.exports = { eco, usuarioDelLogin, sinUsuario, leerId }
