const axios = require('axios')

const glpiApi = axios.create({
  baseURL: `${process.env.GLPI_URL}/apirest.php`,
  timeout: 10000,
  headers: {
    'App-Token':  process.env.GLPI_APP_TOKEN,
    'Content-Type': 'application/json',
  },
})

async function getSessionToken() {
  const { data } = await glpiApi.get('/initSession', {
    headers: { 'Authorization': `user_token ${process.env.GLPI_USER_TOKEN}` }
  })
  return data.session_token
}

async function crearTicket({ id, codigo, nombre_ser_querido, lugar_asistencia, nombre_contacto }) {
  try {
    const session = await getSessionToken()
    const { data } = await glpiApi.post('/Ticket', {
      input: {
        name:     `[H360-${codigo}] Asistencia: ${nombre_ser_querido}`,
        content:  `Solicitud creada desde Homenajes360.\n\nCódigo: ${codigo}\nLugar: ${lugar_asistencia}\nContacto: ${nombre_contacto}`,
        type:     1,  // Incidente
        status:   1,  // Nuevo
        urgency:  3,
        impact:   3,
        priority: 3,
        itilcategories_id: parseInt(process.env.GLPI_CATEGORY_ID || 0),
      }
    }, { headers: { 'Session-Token': session } })

    await glpiApi.get('/killSession', { headers: { 'Session-Token': session } })
    return data.id
  } catch (err) {
    console.warn('[GLPI crearTicket]', err.message)
    return null
  }
}

async function cerrarTicket(ticketId) {
  try {
    const session = await getSessionToken()
    await glpiApi.put(`/Ticket/${ticketId}`, {
      input: { status: 6 }  // 6 = Cerrado en GLPI
    }, { headers: { 'Session-Token': session } })
    await glpiApi.get('/killSession', { headers: { 'Session-Token': session } })
  } catch (err) {
    console.warn('[GLPI cerrarTicket]', err.message)
  }
}

// Mensajes de followup por transición de estado
const FOLLOWUP_ESTADOS = {
  TRASLADO:    (a) => `🚐 *Traslado iniciado*\nEl asistente recogió el cuerpo de ${a.nombre_ser_querido} en ${a.lugar_asistencia}. Inventario en proceso.`,
  PREPARACION: (a) => `🔬 *Tanatopraxia en curso*\nCuerpo recibido en sala. El tanatólogo inició el proceso de ${a.nombre_ser_querido}.`,
  ENTREGA:     (a) => `📦 *Listo para entrega*\nTanatopraxia completada. Supervisora validará y coordinará la entrega de ${a.nombre_ser_querido}.`,
  APROBACION:  (a) => `⏳ *En aprobación*\nEntrega realizada. El caso ${a.codigo} está pendiente de aprobación contable.`,
  CERRADO:     (a) => `✅ *Caso cerrado*\nEl servicio de ${a.nombre_ser_querido} (${a.codigo}) fue completado y facturado.`,
}

async function agregarFollowup(ticketId, mensaje) {
  if (!ticketId) return
  try {
    const session = await getSessionToken()
    await glpiApi.post('/ITILFollowup', {
      input: {
        items_id:      ticketId,
        itemtype:      'Ticket',
        content:       mensaje,
        is_private:    0,
        requesttypes_id: 1,
      }
    }, { headers: { 'Session-Token': session } })
    await glpiApi.get('/killSession', { headers: { 'Session-Token': session } })
    console.log(`[GLPI] Followup agregado al ticket ${ticketId}`)
  } catch (err) {
    console.warn('[GLPI agregarFollowup]', err.message)
  }
}

async function notificarTransicion(ticketId, nuevoEstado, asistencia) {
  const fn = FOLLOWUP_ESTADOS[nuevoEstado]
  if (!fn || !ticketId) return
  const mensaje = fn(asistencia)
  await agregarFollowup(ticketId, mensaje)
  if (nuevoEstado === 'CERRADO') await cerrarTicket(ticketId)
}

module.exports = { crearTicket, cerrarTicket, agregarFollowup, notificarTransicion }
