/**
 * asignacionExterna.service.js
 *
 * Lo que ocurre alrededor de un asistente externo, en dos momentos distintos:
 *
 *   · Al ASIGNARLE la asistencia se le avisa por WhatsApp. Tiene que saber que
 *     el caso es suyo, y eso no puede esperar.
 *
 *   · Al CERRAR ÉL el F-02 sale la orden de servicio por correo. Antes salía
 *     también en la asignación, pero el conductor se puede cambiar después a
 *     uno interno y el proveedor quedaba con una orden de un traslado que no
 *     hizo. Quien cierra el F-02 es quien recibió el cuerpo: ahí consta.
 *
 * El correo sale por n8n, no por SMTP: el backend arma los datos y allá se
 * monta la plantilla y se envía. Es el camino que ya usan otros módulos y
 * evita que un cambio de plantilla exija un despliegue.
 *
 * Nada de esto lanza: lo que se estaba guardando ya quedó guardado y no debe
 * deshacerse porque falle un aviso. Cada función devuelve { ok, motivo } para
 * que la pantalla pueda informar qué pasó.
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
    `SELECT id, codigo, contrato, nombre_ser_querido, identificacion, lugar_asistencia,
            nombre_contacto, telefono_contacto, fecha_contacto, created_at,
            tipo_traslado, conductor, conductor_id,
            orden_servicio_at, orden_servicio_resultado
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

  const envio = await sendTextoSimple(conductor.telefono, texto)
  return { ok: true, telefono: conductor.telefono, texto, provider: envio?.data ?? envio }
}

/**
 * Orden de servicio por correo.
 *
 * Local y medicina legal tienen tarifa fija, así que la orden sale derecho al
 * proveedor. El intermunicipal no: va al equipo de operaciones para que
 * acuerden el precio y la envíen ellos.
 */
/**
 * `proveedor` es quien hizo el traslado: el usuario que cerró el F-02, no el
 * conductor que figura en el F-01. Pueden ser distintos, y el que cuenta para
 * la orden es el que estuvo.
 */
async function enviarOrdenServicio(a, proveedor) {
  const url = process.env.N8N_ORDEN_SERVICIO_WEBHOOK_URL
  if (!url) return { ok: false, motivo: 'N8N_ORDEN_SERVICIO_WEBHOOK_URL no está configurada' }

  const traslado = TRASLADOS[a.tipo_traslado]
  if (!traslado) return { ok: false, motivo: 'La asistencia no tiene tipo de traslado' }

  const acuerdaPrecio = a.tipo_traslado === 'INTERMUNICIPAL'
  const operaciones   = CORREOS_OPERACIONES()
  const destinatarios = acuerdaPrecio ? operaciones : (proveedor.mail ? [proveedor.mail] : [])
  // En copia solo cuando no son ya los destinatarios.
  const copia = acuerdaPrecio ? [] : operaciones
  if (!destinatarios.length)
    return { ok: false, motivo: `${proveedor.nombre} no tiene correo registrado en el directorio activo` }

  const payload = {
    evento: 'orden_servicio',
    // Con precio acordado la orden la envía operaciones, no el sistema.
    requiere_acuerdo_precio: acuerdaPrecio,
    destinatarios,
    copia,
    traslado: { tipo: a.tipo_traslado, etiqueta: traslado.etiqueta, tarifa: traslado.tarifa },
    proveedor: { usuario: proveedor.usuario, nombre: proveedor.nombre, correo: proveedor.mail || null },
    asistencia: {
      id: a.id, codigo: a.codigo,
      // El contrato es la referencia con la que trabaja el proveedor y con la
      // que se factura; el código es interno. Puede no estar todavía: se
      // registra en el F-01 o en el encuentro, y la orden sale en el F-02.
      contrato: a.contrato || null,
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
 * Se llama cuando una asistencia queda asignada a alguien. Si no es externo no
 * hace nada, para no avisar al personal propio por esta vía.
 */
/**
 * Deja constancia del intento en la propia asistencia. Sin esto no había forma
 * de responder "¿le llegó el aviso?" semanas después: el envío se hacía y no
 * quedaba rastro en ningún lado.
 */
async function registrarIntento(asistenciaId, resultado) {
  try {
    await db.query(
      `UPDATE asistencias
          SET aviso_externo_at = NOW(), aviso_externo_telefono = ?, aviso_externo_resultado = ?
        WHERE id = ?`,
      [resultado.whatsapp?.telefono || null, JSON.stringify(resultado), asistenciaId]
    )
  } catch (err) {
    console.warn('[asignacionExterna] registrarIntento:', err.message)
  }
}

async function notificarAsignacion(asistenciaId, conductorId) {
  const resultado = { whatsapp: null }
  try {
    const sam = String(conductorId ?? '').trim()
    if (!sam) return resultado

    const conductor = await buscarUsuarioPorSam(sam)
    if (!conductor) return { ...resultado, motivo: `El conductor ${sam} no existe en el directorio` }
    if (conductor.rol !== 'asistente') return resultado   // personal propio: no aplica

    const a = await traerAsistencia(asistenciaId)
    if (!a) return { ...resultado, motivo: 'Asistencia no encontrada' }

    // Solo el WhatsApp. La orden de servicio espera al cierre del F-02: aquí
    // todavía no se sabe quién va a hacer el traslado de verdad.
    resultado.whatsapp = await avisarPorWhatsApp(a, conductor)
      .catch(e => ({ ok: false, motivo: e.message }))
    await registrarIntento(asistenciaId, resultado)
  } catch (err) {
    console.warn('[asignacionExterna] notificarAsignacion:', err.message)
    resultado.motivo = err.message
  }
  return resultado
}

/**
 * Orden de servicio al cerrarse el F-02, cuando lo cierra un externo.
 *
 * `quienCierra` es el req.user del que guardó la etapa. Solo el rol decide:
 * `asistente` es el grupo Asistentes_Funerarios del directorio, que son los
 * externos. Un cierre del personal propio no genera orden porque no hay a
 * quién pagarle.
 *
 * Se envía una sola vez. Un F-02 reabierto y vuelto a cerrar no manda otra
 * orden: un segundo correo idéntico, sin decir que corrige al primero,
 * confunde más de lo que ayuda. Lo que sí se reintenta es un envío que falló
 * —el externo sin correo en el directorio, por ejemplo—: ahí no hay nada que
 * duplicar, y bloquearlo dejaría la orden sin salir para siempre.
 */
async function enviarOrdenPorCierreF02(asistenciaId, quienCierra = {}) {
  const resultado = { correo: null }
  try {
    if (quienCierra.rol !== 'asistente') return { ...resultado, motivo: 'no es asistente externo' }

    const a = await traerAsistencia(asistenciaId)
    if (!a) return { ...resultado, motivo: 'Asistencia no encontrada' }
    if (ordenYaEnviada(a))
      return { ...resultado, motivo: 'la orden de servicio ya se había enviado' }

    // El correo y el nombre salen del directorio, no del token: el token se
    // emitió al iniciar sesión y el correo pudo haberse cargado después.
    const enDirectorio = await buscarUsuarioPorSam(quienCierra.usuario)
    const proveedor = {
      usuario: quienCierra.usuario,
      nombre:  enDirectorio?.nombre || quienCierra.nombre || quienCierra.usuario,
      mail:    enDirectorio?.mail || '',
    }

    resultado.correo = await enviarOrdenServicio(a, proveedor)
      .catch(e => ({ ok: false, motivo: e.message }))

    await registrarOrden(asistenciaId, proveedor, resultado)
  } catch (err) {
    console.warn('[asignacionExterna] enviarOrdenPorCierreF02:', err.message)
    resultado.motivo = err.message
  }
  return resultado
}

/**
 * ¿Ya salió de verdad? Un intento fallido deja fecha igual —para que se vea
 * qué pasó— pero no cuenta como enviada.
 */
function ordenYaEnviada(a) {
  if (!a.orden_servicio_at) return false
  const r = typeof a.orden_servicio_resultado === 'string'
    ? (() => { try { return JSON.parse(a.orden_servicio_resultado) } catch { return null } })()
    : a.orden_servicio_resultado
  // Sin resultado legible se asume enviada: es más seguro no mandar un
  // duplicado que arriesgarse a mandarlo.
  return r ? !!r.correo?.ok : true
}

/**
 * Queda el intento, salga o no. Si el correo falló hay que poder verlo en la
 * asistencia y reenviarlo a mano; si salió, esto es lo que evita el duplicado.
 */
async function registrarOrden(asistenciaId, proveedor, resultado) {
  try {
    await db.query(
      `UPDATE asistencias
          SET orden_servicio_at = NOW(), orden_servicio_correo = ?, orden_servicio_resultado = ?
        WHERE id = ?`,
      [proveedor.mail || null, JSON.stringify({ ...resultado, proveedor: proveedor.usuario }), asistenciaId]
    )
  } catch (err) {
    console.warn('[asignacionExterna] registrarOrden:', err.message)
  }
}

module.exports = { notificarAsignacion, enviarOrdenPorCierreF02, TRASLADOS }
