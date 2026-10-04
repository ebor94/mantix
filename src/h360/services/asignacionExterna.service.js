/**
 * asignacionExterna.service.js
 *
 * Lo que ocurre cuando una asistencia queda a cargo de un asistente externo:
 * se le avisa por WhatsApp y se dispara la orden de servicio por correo.
 *
 * El correo sale por n8n, no por SMTP: el backend arma los datos y allá se
 * monta la plantilla y se envía. Es el camino que ya usan otros módulos y
 * evita que un cambio de plantilla exija un despliegue.
 *
 * Nada de esto lanza: la asignación ya quedó guardada y no debe deshacerse
 * porque falle un aviso. Cada función devuelve { ok, motivo } para que la
 * pantalla pueda informar qué pasó.
 */
const axios = require('axios')
const db = require('../config/db')
const { buscarUsuarioPorSam } = require('./ldap.service')
const { sendTextoSimple } = require('../../services/whatsappService')

// Tarifas fijas. El intermunicipal no tiene: se acuerda con el proveedor.
const TRASLADOS = {
  MEDICINA_LEGAL: { etiqueta: 'Medicina legal', tarifa: 60000 },
  LOCAL:          { etiqueta: 'Local',          tarifa: 40000 },
  INTERMUNICIPAL: { etiqueta: 'Intermunicipal', tarifa: null  },
}

/**
 * El equipo de operaciones. Son los destinatarios cuando hay que acordar el
 * precio, y van en copia cuando la orden sale derecho al proveedor, para que
 * sepan que se envió.
 */
const CORREOS_OPERACIONES = () => String(
  // El nombre viejo se sigue aceptando por si ya quedó puesto en el servidor.
  process.env.H360_CORREOS_OPERACIONES ||
  process.env.H360_CORREOS_INTERMUNICIPAL ||
  'homenajesoperativocucuta@losolivos.co,coordhomenajescucuta@losolivos.co,auxhomenajesoperativocucuta@losolivos.co'
).split(',').map(c => c.trim()).filter(Boolean)

const DIAS  = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** "JUEVES Oct 1 , 2:30 PM" — mismo formato que el aviso de exequias. */
function cuando(fechaHora) {
  if (!fechaHora) return ''
  const d = fechaHora instanceof Date ? fechaHora : new Date(fechaHora)
  if (Number.isNaN(d.getTime())) return ''
  const cal = `${DIAS[d.getDay()]} ${MESES[d.getMonth()]} ${d.getDate()}`
  const h   = d.getHours()
  const m   = d.getMinutes()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${cal} , ${m ? `${h12}:${String(m).padStart(2, '0')}` : h12} ${h < 12 ? 'AM' : 'PM'}`
}

async function traerAsistencia(asistenciaId) {
  const [[a]] = await db.query(
    `SELECT id, codigo, nombre_ser_querido, identificacion, lugar_asistencia,
            nombre_contacto, telefono_contacto, fecha_contacto, created_at,
            tipo_traslado, conductor, conductor_id
       FROM asistencias WHERE id = ?`,
    [asistenciaId]
  )
  return a || null
}

/** Aviso por WhatsApp al asistente externo que queda a cargo. */
async function avisarPorWhatsApp(a, conductor) {
  if (!conductor.telefono)
    return { ok: false, motivo: `${conductor.nombre} no tiene celular registrado en el directorio activo` }

  const traslado = TRASLADOS[a.tipo_traslado]
  const texto = [
    'ASISTENCIA asignada',
    a.codigo,
    cuando(a.fecha_contacto || a.created_at),
    // La cruz antecede al nombre del ser querido, como en los avisos impresos.
    `Ser querido: + ${String(a.nombre_ser_querido || 's/n').trim()}`,
    a.lugar_asistencia ? `Lugar: ${a.lugar_asistencia}` : '',
    a.nombre_contacto
      ? `Contacto: ${a.nombre_contacto}${a.telefono_contacto ? ` ${a.telefono_contacto}` : ''}`
      : '',
    traslado ? `Traslado ${traslado.etiqueta.toLowerCase()}` : '',
    'Responde este mensaje con un OK',
  ].filter(Boolean).join(' · ')

  await sendTextoSimple(conductor.telefono, texto)
  return { ok: true, texto, telefono: conductor.telefono }
}

/**
 * Orden de servicio por correo.
 *
 * Local y medicina legal tienen tarifa fija, así que la orden sale derecho al
 * proveedor. El intermunicipal no: va al equipo de operaciones para que
 * acuerden el precio y la envíen ellos.
 */
async function enviarOrdenServicio(a, conductor) {
  const url = process.env.N8N_ORDEN_SERVICIO_WEBHOOK_URL
  if (!url) return { ok: false, motivo: 'N8N_ORDEN_SERVICIO_WEBHOOK_URL no está configurada' }

  const traslado = TRASLADOS[a.tipo_traslado]
  if (!traslado) return { ok: false, motivo: 'La asistencia no tiene tipo de traslado' }

  const acuerdaPrecio = a.tipo_traslado === 'INTERMUNICIPAL'
  const operaciones   = CORREOS_OPERACIONES()
  const destinatarios = acuerdaPrecio ? operaciones : (conductor.mail ? [conductor.mail] : [])
  // En copia solo cuando no son ya los destinatarios.
  const copia = acuerdaPrecio ? [] : operaciones
  if (!destinatarios.length)
    return { ok: false, motivo: `${conductor.nombre} no tiene correo registrado en el directorio activo` }

  const payload = {
    evento: 'orden_servicio',
    // Con precio acordado la orden la envía operaciones, no el sistema.
    requiere_acuerdo_precio: acuerdaPrecio,
    destinatarios,
    copia,
    traslado: { tipo: a.tipo_traslado, etiqueta: traslado.etiqueta, tarifa: traslado.tarifa },
    proveedor: { usuario: conductor.usuario, nombre: conductor.nombre, correo: conductor.mail || null },
    asistencia: {
      id: a.id, codigo: a.codigo,
      ser_querido: a.nombre_ser_querido, identificacion: a.identificacion,
      lugar: a.lugar_asistencia,
      contacto: a.nombre_contacto, telefono_contacto: a.telefono_contacto,
      fecha: a.fecha_contacto || a.created_at,
    },
  }

  const r = await axios.post(url, payload, { timeout: 15000 })
  return { ok: true, destinatarios, copia, acuerda_precio: acuerdaPrecio, respuesta: r.data }
}

/**
 * Punto de entrada: se llama cuando una asistencia queda asignada a alguien.
 * Si no es externo no hace nada, para no avisar al personal propio por esta vía.
 */
async function notificarAsignacion(asistenciaId, conductorId) {
  const resultado = { whatsapp: null, correo: null }
  try {
    const sam = String(conductorId ?? '').trim()
    if (!sam) return resultado

    const conductor = await buscarUsuarioPorSam(sam)
    if (!conductor) return { ...resultado, motivo: `El conductor ${sam} no existe en el directorio` }
    if (conductor.rol !== 'asistente') return resultado   // personal propio: no aplica

    const a = await traerAsistencia(asistenciaId)
    if (!a) return { ...resultado, motivo: 'Asistencia no encontrada' }

    resultado.whatsapp = await avisarPorWhatsApp(a, conductor)
      .catch(e => ({ ok: false, motivo: e.message }))
    resultado.correo = await enviarOrdenServicio(a, conductor)
      .catch(e => ({ ok: false, motivo: e.message }))
  } catch (err) {
    console.warn('[asignacionExterna] notificarAsignacion:', err.message)
    resultado.motivo = err.message
  }
  return resultado
}

module.exports = { notificarAsignacion, TRASLADOS }
