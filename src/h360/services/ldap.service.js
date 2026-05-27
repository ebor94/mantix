const ldap = require('ldapjs')

const LDAP_TIMEOUT = 8000 // ms máximo por operación

const ROLE_MAP = () => ({
  [process.env.LDAP_GROUP_ASESOR]:           'asesor',
  [process.env.LDAP_GROUP_ASISTENTE]:        'asistente',
  [process.env.LDAP_GROUP_TANATOLOGO]:       'tanatologo',
  [process.env.LDAP_GROUP_ASIST_TANATOLOGO]: 'asistente_tanatologo', // rol combinado
  [process.env.LDAP_GROUP_SUPERVISORA]:      'supervisora',
  [process.env.LDAP_GROUP_COORDINADOR]:      'coordinador',
  [process.env.LDAP_GROUP_CONTABILIDAD]:     'contabilidad',
})

// Filtro de conexión estándar AD: usuarios activos de tipo persona
const USER_FILTER = '(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))'

// ldapjs v3 eliminó escapeFilter — implementación propia
function escapeFilter(str) {
  return String(str).replace(/[*()\\\x00]/g, c => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'))
}

// Promise que rechaza automáticamente después de N ms
function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(msg || `Timeout después de ${ms}ms`)), ms))
  ])
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
      displayName: get('displayName')   || '',
      mail:        get('mail')          || '',
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
    displayName: attrs.displayName   || '',
    mail:        attrs.mail          || '',
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
      ['sAMAccountName', 'displayName'])
  } catch (err) {
    throw new Error('Error al consultar miembros del grupo: ' + err.message)
  } finally {
    svcClient.destroy()
  }

  const miembros = entries.map(e => {
    const a = extraerAtributos(e)
    return { usuario: a.sam, nombre: a.displayName || a.sam }
  }).filter(m => m.usuario)

  miembros.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return miembros
}

/**
 * Autentica un usuario contra el AD olivos.local.
 * Patrón: bind con cuenta de servicio → busca usuario → re-bind con
 * credenciales del usuario para verificarlas → retorna { usuario, nombre, email, rol }.
 */
async function autenticarLDAP(usuarioRaw, password) {
  // Aceptar "bortega", "bortega@olivos.local" o "OLIVOS\bortega"
  const usuario = usuarioRaw.includes('@')
    ? usuarioRaw.split('@')[0]
    : usuarioRaw.includes('\\')
      ? usuarioRaw.split('\\')[1]
      : usuarioRaw

  console.log(`[LDAP] Autenticando usuario: ${usuario}`)

  // --- Paso 1: bind como cuenta de servicio ---
  const svcClient = createClient()
  try {
    await bindAsync(svcClient, process.env.LDAP_BIND_USER, process.env.LDAP_BIND_PASS)
    console.log('[LDAP] Paso 1 OK — bind svc')
  } catch (err) {
    svcClient.destroy()
    throw new Error('No se pudo conectar al directorio activo: ' + err.message)
  }

  // --- Paso 2: buscar usuario por sAMAccountName ---
  let entries
  try {
    const filter = `(&${USER_FILTER}(sAMAccountName=${escapeFilter(usuario)}))`
    entries = await searchAsync(svcClient, process.env.LDAP_BASE_DN, filter,
      ['dn', 'sAMAccountName', 'displayName', 'mail', 'memberOf'])
    console.log(`[LDAP] Paso 2 OK — ${entries.length} resultado(s)`)
  } catch (err) {
    throw new Error('Error al buscar usuario en el directorio: ' + err.message)
  } finally {
    svcClient.destroy()
  }

  if (!entries.length) {
    throw new Error('Usuario no encontrado en el directorio')
  }

  const { dn: userDN, sam, displayName, mail, memberOf } = extraerAtributos(entries[0])
  console.log(`[LDAP] Usuario: ${sam}, DN: ${userDN}`)

  // --- Paso 3: re-bind con credenciales del usuario (verifica contraseña) ---
  const upn        = sam ? `${sam}@olivos.local` : `${usuario}@olivos.local`
  const userClient = createClient()
  try {
    try {
      await bindAsync(userClient, upn, password)
      console.log(`[LDAP] Paso 3 OK — bind usuario con UPN: ${upn}`)
    } catch (e1) {
      console.log(`[LDAP] UPN bind falló (${e1.message}), intentando DN`)
      await bindAsync(userClient, userDN, password)
      console.log('[LDAP] Paso 3 OK — bind usuario con DN')
    }
  } catch {
    throw new Error('Usuario o contraseña incorrectos')
  } finally {
    userClient.destroy()
  }

  // --- Paso 4: determinar rol por membresía de grupos ---
  const rol = detectarRol(memberOf)
  console.log(`[LDAP] Paso 4 — rol: ${rol}, grupos: ${memberOf.length}`)

  if (!rol) {
    throw new Error('Tu usuario no tiene rol asignado en Homenajes360. Contacta a TI.')
  }

  return {
    usuario: sam         || usuario,
    nombre:  displayName || usuario,
    email:   mail        || '',
    rol,
  }
}

function detectarRol(memberOf) {
  const map = ROLE_MAP()
  for (const dn of memberOf) {
    for (const [groupName, rol] of Object.entries(map)) {
      if (groupName && dn.includes(groupName)) return rol
    }
  }
  // Fallback temporal: admins de dominio → rol admin en H360
  const esAdminDominio = memberOf.some(dn =>
    dn.includes('Admins. del dominio') || dn.includes('Domain Admins')
  )
  if (esAdminDominio) return 'admin'

  return null
}

module.exports = { autenticarLDAP, listarMiembrosGrupo }
