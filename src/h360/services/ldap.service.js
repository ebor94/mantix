const ldap = require('ldapjs')

/**
 * Le devuelve a los errores del directorio el diagnóstico que manda el AD.
 *
 * ldapjs 3.0.7 arma el error leyendo `res.errorMessage`, un nombre que
 * @ldapjs/messages renombró a `diagnosticMessage` sin dejar el alias puesto en
 * LDAPResult. Sin ese alias, TODO error del directorio llega con el texto
 * genérico "Invalid Credentials" y se pierde el `data 52e` que viene adentro.
 *
 * Importa porque el AD distingue cosas que para nosotros eran una sola:
 * contraseña equivocada, contraseña vencida, cambio obligatorio y cuenta
 * bloqueada. Saber cuál de ellas le está pasando a una persona costó una tarde
 * de rastreo; con el alias puesto, está en el log.
 *
 * Va en try/catch porque es una ruta interna de la librería: si una versión
 * futura la mueve, se pierde el detalle pero el login sigue funcionando.
 */
try {
  const { LDAPResult } = require('ldapjs/lib/messages')
  if (!Object.getOwnPropertyDescriptor(LDAPResult.prototype, 'errorMessage')) {
    Object.defineProperty(LDAPResult.prototype, 'errorMessage', {
      get () { return this.diagnosticMessage },
      configurable: true,
    })
  }
} catch (err) {
  console.warn('[LDAP] sin diagnóstico detallado del AD:', err.message)
}

const LDAP_TIMEOUT = 8000 // ms máximo por operación

/**
 * Grupo del directorio → rol, EN ORDEN DE PRIORIDAD: quien pertenezca a varios
 * se queda con el primero que coincida. Por eso admin va arriba — hay personal
 * que administra y además conduce.
 *
 * Es una lista y no un objeto a propósito: con un objeto, dos variables de
 * entorno sin definir colapsaban en la misma clave "undefined" y una se comía
 * a la otra, dejando roles fuera del mapa sin que nada avisara.
 */
const ROLES_POR_GRUPO = [
  ['LDAP_GROUP_ADMIN',            'admin'],                 // full access
  ['LDAP_GROUP_ASESOR',           'asesor'],
  ['LDAP_GROUP_ASISTENTE',        'asistente'],
  ['LDAP_GROUP_TANATOLOGO',       'tanatologo'],
  ['LDAP_GROUP_ASIST_TANATOLOGO', 'asistente_tanatologo'],  // rol combinado
  ['LDAP_GROUP_SUPERVISORA',      'supervisora'],
  ['LDAP_GROUP_COORDINADOR',      'coordinador'],
  ['LDAP_GROUP_CONTABILIDAD',     'contabilidad'],
  ['LDAP_GROUP_RECEPCION',        'recepcion'],             // atiende exequias/ceremonias
  ['LDAP_GROUP_PSICOLOGIA',       'psicologia'],            // R-56: duelo y posexequiales
  // Último a propósito: el tramitador solo paga exequias, así que si alguien
  // está además en otro grupo debe entrar con el rol de más alcance.
  ['LDAP_GROUP_TRAMITADOR',       'tramitador'],
]

// Pertenencia EXACTA a un grupo. Antes se usaba dn.includes(nombre): un grupo "H360AdminViejo", o cualquier DN
// con "H360Admin" en una OU, daba el rol de admin. Portería ya lo hacía bien (esDelGrupo en su auth.service).
// - Si el valor configurado es un DN completo (CN=…,OU=…), se compara el DN entero.
// - Si es solo el nombre del grupo, se compara el CN (primer componente del DN), completo.
// Mayúsculas y espacios alrededor de "=" y "," no cuentan. Las comas escapadas (\,) del CN se respetan.
const RDN = /^\s*cn\s*=\s*((?:\\.|[^,\\])*?)\s*(?:,|$)/i
const normalizarDn = (dn) => String(dn).split(/(?<!\\),/).map(p => p.trim().replace(/\s*=\s*/, '=')).join(',').toLowerCase()
function esDelGrupo(dn, grupo) {
  if (typeof dn !== 'string' || !grupo) return false
  if (/^\s*cn\s*=.+,/i.test(grupo)) return normalizarDn(dn) === normalizarDn(grupo)
  const m = RDN.exec(dn)
  return Boolean(m) && m[1].toLowerCase() === String(grupo).trim().toLowerCase()
}

/** Para el log: solo nombres con forma de usuario. Si alguien escribe su contraseña como usuario, no queda escrita. */
const usuarioParaLog = (u) => (/^[a-z0-9._-]{1,64}$/.test(u) ? u : '[formato no válido]')

/** Pares [nombreDeGrupo, rol] de las variables que sí están definidas. */
const ROLE_MAP = () => ROLES_POR_GRUPO
  .map(([envVar, rol]) => [String(process.env[envVar] ?? '').trim(), rol])
  .filter(([grupo]) => grupo)

// Filtro de conexión estándar AD: usuarios activos de tipo persona
const USER_FILTER = '(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))'

// ldapjs v3 eliminó escapeFilter — implementación propia
function escapeFilter(str) {
  return String(str).replace(/[*()\\\x00]/g, c => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'))
}

// Promise que rechaza automáticamente después de N ms (y limpia su temporizador al terminar)
function withTimeout(promise, ms, msg) {
  let temporizador
  const limite = new Promise((_, rej) => {
    temporizador = setTimeout(() => rej(new Error(msg || `Timeout después de ${ms}ms`)), ms)
  })
  return Promise.race([promise, limite]).finally(() => clearTimeout(temporizador))
}

function createClient() {
  const c = ldap.createClient({
    url:            process.env.LDAP_URL,
    timeout:        LDAP_TIMEOUT,
    connectTimeout: LDAP_TIMEOUT,
  })
  c.on('error', err => console.error('[LDAP] client error:', err.message))
  return c
}

function bindAsync(client, dn, password) {
  return withTimeout(
    new Promise((resolve, reject) => {
      client.bind(dn, password, err => (err ? reject(err) : resolve()))
    }),
    LDAP_TIMEOUT,
    'Timeout en bind LDAP'
  )
}

function searchAsync(client, base, filter, attributes) {
  return withTimeout(
    new Promise((resolve, reject) => {
      client.search(base, { filter, scope: 'sub', attributes, timeLimit: 5 }, (err, res) => {
        if (err) return reject(err)
        const entries = []
        res.on('searchEntry', e  => entries.push(e))
        res.on('error',       e  => reject(e))
        res.on('end',         () => resolve(entries))
      })
    }),
    LDAP_TIMEOUT,
    'Timeout en búsqueda LDAP'
  )
}

// Extraer atributos compatibles con ldapjs v2 y v3
function extraerAtributos(entry) {
  if (entry.attributes && Array.isArray(entry.attributes)) {
    // ldapjs v3
    const get = (type) => {
      const a = entry.attributes.find(x => x.type?.toLowerCase() === type.toLowerCase())
      if (!a) return undefined
      const vals = a.values || a._vals || []
      return vals.length === 1 ? vals[0] : vals.length > 1 ? vals : undefined
    }
    return {
      dn:          entry.dn?.toString() || entry.objectName?.toString() || '',
      sam:         get('sAMAccountName') || '',
      upn:         get('userPrincipalName') || '',
      displayName: get('displayName')   || '',
      mail:        get('mail')          || '',
      // mobile es el campo de celular; telephoneNumber queda como respaldo
      telefono:    get('mobile') || get('telephoneNumber') || '',
      memberOf:    (() => {
        const m = get('memberOf')
        if (!m)              return []
        if (Array.isArray(m)) return m
        return [m]
      })(),
    }
  }
  // ldapjs v2
  const attrs = entry.object || {}
  return {
    dn:          entry.objectName?.toString() || '',
    sam:         attrs.sAMAccountName || '',
    upn:         attrs.userPrincipalName || '',
    displayName: attrs.displayName   || '',
    mail:        attrs.mail          || '',
    telefono:    attrs.mobile || attrs.telephoneNumber || '',
    memberOf:    Array.isArray(attrs.memberOf) ? attrs.memberOf : [attrs.memberOf || ''].filter(Boolean),
  }
}

/**
 * Lista los miembros activos de un grupo AD por nombre de grupo (cn).
 * Paso 1: busca el grupo en todo el dominio para obtener su DN exacto.
 * Paso 2: busca usuarios activos con memberOf=<DN exacto>.
 * Retorna [{ usuario: sAMAccountName, nombre: displayName }] ordenados por nombre.
 */
async function listarMiembrosGrupo(groupName) {
  if (!groupName) return []

  // Base de dominio completo para buscar grupos (pueden estar en cualquier OU)
  const domainBase = process.env.LDAP_BASE_DN
    .split(',')
    .filter(p => p.toUpperCase().startsWith('DC='))
    .join(',')
  const searchBase = domainBase || process.env.LDAP_BASE_DN

  const svcClient = createClient()
  try {
    await bindAsync(svcClient, process.env.LDAP_BIND_USER, process.env.LDAP_BIND_PASS)
  } catch (err) {
    svcClient.destroy()
    throw new Error('No se pudo conectar al directorio activo: ' + err.message)
  }

  let groupDN
  try {
    // Paso 1: resolver DN real del grupo buscando por cn en todo el dominio
    const escapedGroup = escapeFilter(groupName)
    const groupEntries = await searchAsync(
      svcClient, searchBase,
      `(&(objectClass=group)(cn=${escapedGroup}))`,
      ['dn']
    )
    if (!groupEntries.length) {
      console.warn(`[LDAP] Grupo "${groupName}" no encontrado en ${searchBase}`)
      svcClient.destroy()
      return []
    }
    groupDN = groupEntries[0].objectName?.toString() || groupEntries[0].dn?.toString()
    console.log(`[LDAP] Grupo encontrado: ${groupDN}`)
  } catch (err) {
    svcClient.destroy()
    throw new Error('Error al buscar el grupo en el directorio: ' + err.message)
  }

  let entries
  try {
    // Paso 2: buscar usuarios activos que sean miembros del grupo (DN exacto)
    const escapedDN = escapeFilter(groupDN)
    const filter = `(&${USER_FILTER}(memberOf=${escapedDN}))`
    entries = await searchAsync(svcClient, searchBase, filter,
      ['sAMAccountName', 'displayName', 'mail', 'mobile', 'telephoneNumber'])
  } catch (err) {
    throw new Error('Error al consultar miembros del grupo: ' + err.message)
  } finally {
    svcClient.destroy()
  }

  const miembros = entries.map(e => {
    const a = extraerAtributos(e)
    return { usuario: a.sam, nombre: a.displayName || a.sam,
             mail: a.mail || '', telefono: a.telefono || '' }
  }).filter(m => m.usuario)

  miembros.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return miembros
}

/**
 * Diagnóstico de SOLO LECTURA para el cambio a comparación exacta de grupos (antes era por subcadena).
 * Por cada grupo configurado (y los de administradores del dominio del respaldo) busca los grupos cuyo CN lo
 * CONTIENE sin ser exactamente él, y lista sus miembros activos que NO están en el grupo exacto: son quienes
 * tenían el rol solo por la subcadena y lo pierden con la corrección.
 * No detecta el caso del nombre dentro de una OU (el AD no filtra memberOf por subcadena); es raro.
 * Retorna [{ rol, grupo, grupoParecido, usuarios: [sAMAccountName] }].
 */
async function diagnosticarRolesPorSubcadena() {
  const domainBase = (process.env.LDAP_BASE_DN || '').split(',').filter(p => p.trim().toUpperCase().startsWith('DC=')).join(',')
  const base = domainBase || process.env.LDAP_BASE_DN
  const configurados = [...ROLE_MAP(), ['Admins. del dominio', 'admin (respaldo)'], ['Domain Admins', 'admin (respaldo)']]
    .map(([grupo, rol]) => [/^\s*cn\s*=/i.test(grupo) ? (RDN.exec(grupo) || [])[1] || grupo : grupo, rol])

  const cliente = createClient()
  try {
    await bindAsync(cliente, process.env.LDAP_BIND_USER, process.env.LDAP_BIND_PASS)
    const miembrosDe = async (dnGrupo) => (await searchAsync(cliente, base, `(&${USER_FILTER}(memberOf=${escapeFilter(dnGrupo)}))`, ['sAMAccountName']))
      .map(e => extraerAtributos(e).sam).filter(Boolean)
    const resultado = []
    for (const [grupo, rol] of configurados) {
      const parecidos = await searchAsync(cliente, base, `(&(objectClass=group)(cn=*${escapeFilter(grupo)}*))`, ['cn'])
      const dnDe = (e) => e.objectName?.toString() || e.dn?.toString() || ''
      const exactos = parecidos.filter(e => esDelGrupo(dnDe(e), grupo))
      const conRolExacto = new Set()
      for (const e of exactos) for (const u of await miembrosDe(dnDe(e))) conRolExacto.add(u.toLowerCase())
      for (const e of parecidos.filter(x => !esDelGrupo(dnDe(x), grupo))) {
        const usuarios = (await miembrosDe(dnDe(e))).filter(u => !conRolExacto.has(u.toLowerCase())).sort()
        if (usuarios.length) resultado.push({ rol, grupo, grupoParecido: dnDe(e), usuarios })
      }
    }
    return resultado
  } finally {
    cliente.destroy()
  }
}

/** Error del directorio con un código estable para quien llama; el mensaje es el de siempre. */
function errorDirectorio(message, codigo) {
  const err = new Error(message)
  err.codigo = codigo
  return err
}

/**
 * Los subcódigos que el AD manda dentro del error 49, y qué hacer con cada uno.
 *
 * `publico` es lo que ve la persona. Los dos primeros no lo llevan y se quedan
 * con el mensaje de siempre: el AD responde 52e también cuando el usuario no
 * existe —lo hace a propósito, para que nadie pueda averiguar qué cuentas hay—
 * y no vale la pena afinar más de lo que el propio directorio distingue.
 *
 * Los demás no hablan de la contraseña sino del estado de la cuenta, y ahí
 * callar es lo caro: la persona reintenta veinte veces una contraseña que está
 * bien mientras lo que pasa es que venció o que la cuenta quedó bloqueada.
 */
const DIAGNOSTICO_AD = {
  525: { causa: 'el usuario no existe' },
  '52e': { causa: 'contraseña incorrecta' },
  530: { causa: 'fuera del horario permitido',
    publico: 'Tu cuenta no tiene permitido iniciar sesión a esta hora.' },
  531: { causa: 'estación de trabajo no permitida',
    publico: 'Tu cuenta no tiene permitido iniciar sesión desde este servidor. Contacta a TI.' },
  532: { causa: 'contraseña vencida',
    publico: 'Tu contraseña venció. Cámbiala en un computador del dominio y vuelve a entrar.' },
  533: { causa: 'cuenta deshabilitada',
    publico: 'Tu cuenta está deshabilitada en el directorio. Contacta a TI.' },
  701: { causa: 'la cuenta venció',
    publico: 'Tu cuenta venció en el directorio. Contacta a TI.' },
  773: { causa: 'debe cambiar la contraseña',
    publico: 'Tienes que cambiar tu contraseña. Hazlo en un computador del dominio y vuelve a entrar.' },
  775: { causa: 'cuenta bloqueada',
    publico: 'Tu cuenta está bloqueada en el directorio. Contacta a TI.' },
}

/** El "data 52e" que el AD mete en el texto del error 49; null si no vino. */
function subcodigoAD(err) {
  const m = String(err?.message ?? '').match(/data ([0-9a-f]{3,4})/i)
  return m ? m[1].toLowerCase() : null
}

// Aceptar "bortega", "bortega@olivos.local" o "OLIVOS\bortega"
function normalizarUsuario(usuarioRaw) {
  const usuario = String(usuarioRaw ?? '').trim()
  if (usuario.includes('@')) return usuario.split('@')[0]
  if (usuario.includes('\\')) return usuario.split('\\')[1]
  return usuario
}

/**
 * Verifica usuario y contraseña contra el AD olivos.local, sin exigir rol de ninguna aplicación.
 * Patrón: bind con cuenta de servicio → busca usuario → re-bind con sus credenciales.
 * Retorna { usuario, nombre, email, memberOf }. Los errores llevan `codigo`:
 * CREDENCIALES_INVALIDAS (vacías, usuario inexistente o contraseña incorrecta) o AD_NO_DISPONIBLE.
 */
async function validarCredenciales(usuarioRaw, password) {
  const usuario = normalizarUsuario(usuarioRaw)
  // Un bind con contraseña vacía es anónimo y el AD lo acepta: nunca puede valer como login.
  if (!usuario || !password) throw errorDirectorio('Usuario o contraseña incorrectos', 'CREDENCIALES_INVALIDAS')

  console.log(`[LDAP] Autenticando usuario: ${usuarioParaLog(usuario)}`)

  // --- Paso 1: bind como cuenta de servicio ---
  const svcClient = createClient()
  try {
    await bindAsync(svcClient, process.env.LDAP_BIND_USER, process.env.LDAP_BIND_PASS)
    console.log('[LDAP] Paso 1 OK — bind svc')
  } catch (err) {
    svcClient.destroy()
    throw errorDirectorio('No se pudo conectar al directorio activo: ' + err.message, 'AD_NO_DISPONIBLE')
  }

  // --- Paso 2: buscar usuario por sAMAccountName ---
  let entries
  try {
    const filter = `(&${USER_FILTER}(sAMAccountName=${escapeFilter(usuario)}))`
    entries = await searchAsync(svcClient, process.env.LDAP_BASE_DN, filter,
      ['dn', 'sAMAccountName', 'userPrincipalName', 'displayName', 'mail', 'memberOf'])
    console.log(`[LDAP] Paso 2 OK — ${entries.length} resultado(s)`)
  } catch (err) {
    throw errorDirectorio('Error al buscar usuario en el directorio: ' + err.message, 'AD_NO_DISPONIBLE')
  } finally {
    svcClient.destroy()
  }

  if (!entries.length) {
    throw errorDirectorio('Usuario no encontrado en el directorio', 'CREDENCIALES_INVALIDAS')
  }

  const { dn: userDN, sam, upn, displayName, mail, memberOf } = extraerAtributos(entries[0])
  console.log(`[LDAP] Usuario: ${sam}, DN: ${userDN}`)

  /**
   * Con qué nombre se verifica la contraseña.
   *
   * Va el userPrincipalName y no el DN porque el DN no sobrevive el viaje de
   * ida y vuelta cuando el nombre de la persona lleva una letra que no es
   * ASCII: @ldapjs/dn convierte la Ñ de "CAMILO OMAÑA" en "\c3\91" al volverlo
   * texto, y ese DN el directorio ya no lo reconoce. El bind falla con 52e
   * —el mismo código de una contraseña equivocada— y la persona queda sin
   * poder entrar aunque la escriba bien. Hoy hay nueve apellidos así.
   *
   * El UPN no es un DN válido, así que ldapjs lo manda tal cual y llega
   * intacto. Se lee del directorio en vez de armarlo como `sam@olivos.local`
   * porque hay tres cuentas donde los dos no coinciden (JCORTINA entra como
   * JORGECORTINA@olivos.local) y a esas el nombre armado las dejaría afuera.
   *
   * El DN queda de respaldo por si alguna cuenta no tuviera UPN. Sigue siendo
   * un solo bind por login: nunca se prueban los dos.
   */
  const nombreBind = upn || userDN

  // --- Paso 3: re-bind con las credenciales del usuario (un solo intento por login) ---
  const userClient = createClient()
  try {
    await bindAsync(userClient, nombreBind, password)
    console.log(`[LDAP] Paso 3 OK — bind usuario con ${upn ? 'UPN' : 'DN'}`)
  } catch (err) {
    // ldapjs: LDAP 49 llega como InvalidCredentialsError con code 49. Se detecta por name/code, no por instanceof.
    if (err?.name === 'InvalidCredentialsError' || err?.code === 49) {
      const data = subcodigoAD(err)
      const d = DIAGNOSTICO_AD[data]
      // Al log va siempre el subcódigo, aunque a la persona se le responda el
      // mensaje genérico: es lo que convierte "no puedo entrar" en un caso que
      // se resuelve en un minuto. Nunca lleva la contraseña.
      //
      // console.log y no console.warn aunque sea un fallo: warn sale por
      // stderr y pm2 lo guarda en otro archivo, de modo que esta línea quedaría
      // separada de los cuatro pasos anteriores del mismo intento. Quien
      // rastrea un login quiere las cinco líneas juntas.
      console.log(`[LDAP] Paso 3 FALLÓ — ${sam}: AD data ${data || '(sin subcódigo)'}`
        + (d ? ` (${d.causa})` : ''))
      throw errorDirectorio(d?.publico || 'Usuario o contraseña incorrectos', 'CREDENCIALES_INVALIDAS')
    }
    throw errorDirectorio('No se pudo conectar al directorio activo: ' + err.message, 'AD_NO_DISPONIBLE')
  } finally {
    userClient.destroy()
  }

  return { usuario: sam || usuario, nombre: displayName || usuario, email: mail || '', memberOf }
}

/**
 * Autentica para H360: credenciales válidas + al menos un rol de H360.
 * Retorna { usuario, nombre, email, rol, roles }.
 */
async function autenticarLDAP(usuarioRaw, password) {
  const datos = await validarCredenciales(usuarioRaw, password)

  // --- Paso 4: determinar roles por membresía de grupos ---
  const roles = detectarRoles(datos.memberOf)
  console.log(`[LDAP] Paso 4 — roles: ${roles.join(', ') || 'ninguno'}, grupos: ${datos.memberOf.length}`)

  if (!roles.length) {
    throw new Error('Tu usuario no tiene rol asignado en Homenajes360. Contacta a TI.')
  }

  return {
    usuario: datos.usuario,
    nombre:  datos.nombre,
    email:   datos.email,
    // `rol` es el activo; `roles` son todos los que puede usar. Si hay más de
    // uno, la pantalla de ingreso le pregunta con cuál entra.
    rol:   roles[0],
    roles,
  }
}

/**
 * Todos los roles que le dan sus grupos, en orden de prioridad.
 *
 * El recorrido va por ROLE_MAP, que está ordenado, y no por los grupos que
 * devuelve el directorio: ese orden es arbitrario y hacía que el rol de alguien
 * dependiera de cómo el AD listara su membresía.
 *
 * Hay gente que hace dos oficios —un asistente de tanatólogo que además
 * tramita los pagos de las exequias—, y por eso se devuelven todos: al iniciar
 * sesión se le pregunta con cuál entra. El primero es el de más alcance y es el
 * que se propone por defecto.
 */
function detectarRoles(memberOf) {
  const grupos = Array.isArray(memberOf) ? memberOf : []
  const roles = []
  for (const [groupName, rol] of ROLE_MAP()) {
    if (grupos.some(dn => esDelGrupo(dn, groupName))) roles.push(rol)
  }
  if (roles.length) return roles

  // Fallback temporal: admins de dominio → rol admin en H360 (grupo exacto, nunca por subcadena)
  const esAdminDominio = grupos.some(dn => esDelGrupo(dn, 'Admins. del dominio') || esDelGrupo(dn, 'Domain Admins'))
  return esAdminDominio ? ['admin'] : []
}

/** El de más alcance, para cuando solo hace falta uno. */
function detectarRol(memberOf) {
  return detectarRoles(memberOf)[0] || null
}

/**
 * Busca un usuario por sAMAccountName y devuelve sus datos de contacto.
 * Usado para resolver el celular del conductor al notificarlo por WhatsApp.
 * Retorna null si no existe; nunca lanza por "no encontrado".
 */
async function buscarUsuarioPorSam(sam) {
  if (!sam) return null

  const domainBase = process.env.LDAP_BASE_DN
    .split(',')
    .filter(p => p.toUpperCase().startsWith('DC='))
    .join(',')
  const searchBase = domainBase || process.env.LDAP_BASE_DN

  const svcClient = createClient()
  try {
    await bindAsync(svcClient, process.env.LDAP_BIND_USER, process.env.LDAP_BIND_PASS)
    const entries = await searchAsync(
      svcClient, searchBase,
      `(&${USER_FILTER}(sAMAccountName=${escapeFilter(sam)}))`,
      // memberOf es lo que permite saber el rol: sin pedirlo, quien consulte
      // por este camino recibe el usuario pero nunca su rol.
      ['sAMAccountName', 'displayName', 'mail', 'mobile', 'telephoneNumber', 'memberOf']
    )
    if (!entries.length) return null
    const a = extraerAtributos(entries[0])
    return {
      usuario:  a.sam,
      nombre:   a.displayName || a.sam,
      mail:     a.mail || '',
      telefono: a.telefono || '',
      rol:      detectarRol(a.memberOf || []),
    }
  } catch (err) {
    console.warn(`[LDAP] buscarUsuarioPorSam(${sam}):`, err.message)
    return null
  } finally {
    svcClient.destroy()
  }
}

module.exports = { autenticarLDAP, validarCredenciales, listarMiembrosGrupo, buscarUsuarioPorSam, detectarRoles, esDelGrupo, diagnosticarRolesPorSubcadena }
