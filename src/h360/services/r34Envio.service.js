/**
 * r34Envio.service.js — manda el R-34 al proveedor.
 *
 * Sale por n8n, no por SMTP: es el camino que ya usa la orden de servicio de
 * traslado y está probado en producción, y además deja la plantilla del correo
 * editable sin tener que desplegar el backend.
 *
 * El PDF viaja en base64 dentro del payload y allá se convierte en adjunto.
 * Son unos 85 kB por R-34, que para un webhook no es nada.
 *
 * No lanza: el R-34 ya quedó guardado y un correo que no sale no debe
 * deshacerlo. Devuelve { ok, motivo } para que la pantalla lo diga.
 */
const axios = require('axios')
const { generarR34Pdf } = require('./r34Pdf')

/**
 * Operaciones en copia, igual que en la orden de servicio de traslado: así
 * saben qué se contrató sin tener que preguntar.
 */
const CORREOS_OPERACIONES = () => String(
  process.env.H360_CORREOS_OPERACIONES ||
  'homenajesoperativocucuta@losolivos.co,coordhomenajescucuta@losolivos.co,auxhomenajesoperativocucuta@losolivos.co'
).split(',').map(c => c.trim()).filter(Boolean)

const ETIQUETA_GRUPO = {
  CORO: 'Coro',
  CARROZA: 'Carroza',
  SALA_HOMENAJE: 'Sala de homenaje',
  EQ_NOVENARIO: 'Equipo de novenario',
  EQ_ULTIMA_NOCHE: 'Equipo de última noche',
  EQ_VELACION_NOVENARIO: 'Equipo de velación y novenario',
  EQ_VELACION: 'Equipo de velación',
  RAMOS: 'Arreglo floral',
  TRANSPORTE_ACOMPANANTES: 'Transporte de acompañantes',
  TRANSPORTE_FLORES: 'Transporte de flores',
  OTRO: 'Otro',
}

async function enviarR34(r34, correo, usuario = {}) {
  const url = process.env.N8N_R34_WEBHOOK_URL
  if (!url) return { ok: false, motivo: 'N8N_R34_WEBHOOK_URL no está configurada' }

  try {
    const pdf = await generarR34Pdf(r34)

    const payload = {
      evento: 'r34_contratacion_servicios',
      destinatarios: [correo],
      copia: CORREOS_OPERACIONES(),
      r34: {
        consecutivo: r34.consecutivo,
        contrato: r34.contrato,
        servicio: ETIQUETA_GRUPO[r34.grupo] || r34.grupo,
        servicio_desc: r34.servicio_desc,
        cantidad: r34.cantidad,
        ser_querido: r34.ser_querido,
        contratante: r34.contratante,
        direccion_homenaje: r34.direccion_homenaje,
        fecha_entrega: r34.fecha_entrega,
        hora_prestacion: r34.hora_prestacion,
        lugar_exequias: r34.lugar_exequias,
        cementerio: r34.cementerio,
        observaciones: r34.observaciones,
        autoriza: r34.autoriza_nombre || r34.autoriza_usuario,
      },
      proveedor: {
        nit: r34.proveedor_nit,
        nombre: r34.proveedor_nombre,
        correo,
      },
      enviado_por: usuario.nombre || usuario.usuario || null,
      adjunto: {
        nombre: `${r34.consecutivo}.pdf`,
        tipo: 'application/pdf',
        base64: pdf.toString('base64'),
      },
    }

    const r = await axios.post(url, payload, { timeout: 30000, maxBodyLength: 20 * 1024 * 1024 })
    return { ok: true, destinatarios: [correo], copia: payload.copia, respuesta: r.data }
  } catch (err) {
    console.warn('[r34Envio]', err.message)
    return { ok: false, motivo: err.message }
  }
}

module.exports = { enviarR34, ETIQUETA_GRUPO }
