/**
 * r34Pdf.js — Formato R-34 "Contratación de servicios" en PDF.
 *
 *   generarR34Pdf(r34) -> Promise<Buffer>
 *
 * Reproduce la hoja que operaciones llevaba en Excel: arriba la orden que se
 * le manda al proveedor, y abajo el bloque de verificación que se llena a mano
 * durante el servicio —hora de llegada, conductor, novedades del cortejo,
 * horas en el destino final y las firmas—. Ese bloque va en blanco a
 * propósito: es el que firma el proveedor y el familiar en el sitio.
 *
 * pdfkit y nada más, como el R-44: sin dependencias del sistema, así que no
 * hay que instalar nada en el servidor.
 */
const PDFDocument = require('pdfkit')
const LOGO = require('../assets/logo-olivos.base64')

// ── Geometría y paleta ─────────────────────────────────────────────────────
//
// Media carta: la hoja carta partida por la mitad, 8.5" de ancho por 5.5" de
// alto. Cada cuadro va en su propia página —la orden que se le manda al
// proveedor y el bloque de verificación que se llena a mano— para que se
// puedan separar sin cortar nada.
const HOJA_W = 612       // 8.5" a 72 dpi
const HOJA_H = 396       // 5.5"
const M      = 22        // margen
const CW     = HOJA_W - M * 2

const VERDE  = '#1a4a2e'
const TINTA  = '#1b1b1b'
const GRIS   = '#666666'
const BORDE  = '#bfbfbf'
const SUAVE  = '#f2f4f1'

/** Los once servicios del formato, en el orden impreso. */
const SERVICIOS = [
  ['CORO',                    'Coro'],
  ['CARROZA',                 'Carroza'],
  ['SALA_HOMENAJE',           'Sala de Homenaje'],
  ['EQ_NOVENARIO',            'Eq. de novenario'],
  ['EQ_ULTIMA_NOCHE',         'Eq. Última noche'],
  ['EQ_VELACION_NOVENARIO',   'Eq. Velación y novenario'],
  ['EQ_VELACION',             'Eq. Velación'],
  ['RAMOS',                   'Arreglo floral'],
  ['TRANSPORTE_ACOMPANANTES', 'Transporte de acompañantes'],
  ['TRANSPORTE_FLORES',       'Transporte de flores'],
  ['OTRO',                    'Otro'],
]

/**
 * Un campo que se llena a mano va vacío, no con raya: la raya dice "no hay
 * dato" y aquí lo que hay es un renglón para escribir.
 */
const BLANCO = Symbol('en blanco')

const texto = v => {
  if (v === BLANCO) return ''
  const s = String(v ?? '').trim()
  return s || '—'
}

/** "2026-10-08" o un Date → "8 de octubre de 2026". */
const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre']
function fechaLarga(v) {
  if (!v) return '—'
  const s = String(v)
  let d
  if (v instanceof Date) d = v
  else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [a, m, dia] = s.slice(0, 10).split('-').map(Number)
    d = new Date(a, m - 1, dia)
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dia, m, a] = s.split('/').map(Number)
    d = new Date(a, m - 1, dia)
  } else d = new Date(s)
  if (isNaN(d)) return s
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

function generarR34Pdf(r34) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [HOJA_W, HOJA_H], margin: M, autoFirstPage: true })
    const trozos = []
    doc.on('data', t => trozos.push(t))
    doc.on('end', () => resolve(Buffer.concat(trozos)))
    doc.on('error', reject)

    let y = M

    // ── Encabezado ─────────────────────────────────────────────────────────
    // El logo va sobre un recuadro blanco: el original es un PNG con fondo
    // claro y sobre el verde de la banda se vería un parche sucio.
    const ALTO_BANDA = 32
    const encabezado = (titulo) => {
      doc.save()
      doc.rect(M, y, CW, ALTO_BANDA).fill(VERDE)

      doc.rect(M + 5, y + 4, 44, ALTO_BANDA - 8).fill('#ffffff')
      try {
        doc.image(LOGO, M + 7, y + 6, { fit: [40, ALTO_BANDA - 12], align: 'center', valign: 'center' })
      } catch { /* sin logo el formato sigue siendo válido */ }

      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11.5)
         .text(titulo, M + 56, y + 7, { width: CW - 210 })
      doc.font('Helvetica').fontSize(7)
         .text('Código: R-34   Versión: 08', M + CW - 150, y + 6, { width: 140, align: 'right' })
         .font('Helvetica-Bold').fontSize(8.5)
         .text(texto(r34.consecutivo), M + CW - 150, y + 17, { width: 140, align: 'right' })
      doc.restore()
      y += ALTO_BANDA
    }

    // Un par etiqueta/valor dentro de una rejilla de columnas.
    const campo = (x, ancho, etiqueta, valor, alto = 23) => {
      doc.save()
      doc.rect(x, y, ancho, alto).lineWidth(0.6).strokeColor(BORDE).stroke()
      doc.fillColor(GRIS).font('Helvetica').fontSize(6.5)
         .text(etiqueta.toUpperCase(), x + 5, y + 3.5, { width: ancho - 10 })
      doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(8.5)
         .text(texto(valor), x + 5, y + 12, { width: ancho - 10, height: alto - 14, ellipsis: true })
      doc.restore()
    }

    /**
     * El pie va pegado al borde inferior, por fuera del margen. Hay que
     * soltar el margen mientras se dibuja: si no, pdfkit considera que el
     * texto no cabe y abre una página nueva solo para ponerlo ahí.
     */
    const pie = () => {
      const margenAbajo = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      doc.fillColor('#999999').font('Helvetica').fontSize(6.5)
         .text(`Homenajes360 · ${texto(r34.consecutivo)} · Serfunorte Los Olivos · Cúcuta`,
               M, HOJA_H - M - 4, { width: CW, align: 'center', lineBreak: false })
      doc.page.margins.bottom = margenAbajo
    }

    const fila = (campos, alto = 23) => {
      const total = campos.reduce((s, c) => s + c[2], 0)
      let x = M
      for (const [etiqueta, valor, peso] of campos) {
        const ancho = CW * (peso / total)
        campo(x, ancho, etiqueta, valor, alto)
        x += ancho
      }
      y += alto
    }

    encabezado('CONTRATACIÓN DE SERVICIOS')

    fila([['Fecha', fechaLarga(r34.created_at || new Date()), 2],
          ['Contrato', r34.contrato, 1],
          ['Fecha de entrega', fechaLarga(r34.fecha_entrega), 2]])

    fila([['Nombre del ser querido', r34.ser_querido, 1]])
    fila([['Nombre del contratante', r34.contratante, 3],
          ['Teléfono', r34.telefono_cliente, 2]])

    // ── Servicio: la rejilla de casillas ───────────────────────────────────
    doc.save()
    const altoRejilla = 50
    doc.rect(M, y, CW, altoRejilla).lineWidth(0.6).strokeColor(BORDE).stroke()
    doc.fillColor(GRIS).font('Helvetica').fontSize(6.5).text('SERVICIO', M + 5, y + 3.5)

    const COLS = 4
    const anchoCol = (CW - 10) / COLS
    SERVICIOS.forEach(([clave, etiqueta], i) => {
      const cx = M + 5 + (i % COLS) * anchoCol
      const cy = y + 13 + Math.floor(i / COLS) * 12.5
      const marcado = clave === r34.grupo
      doc.rect(cx, cy, 7.5, 7.5).lineWidth(0.7).strokeColor(marcado ? VERDE : BORDE).stroke()
      if (marcado) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(VERDE).text('X', cx + 1.4, cy + 0.9)
      }
      doc.font(marcado ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
         .fillColor(marcado ? VERDE : TINTA)
         .text(etiqueta, cx + 11, cy + 0.6, { width: anchoCol - 16, ellipsis: true })
    })
    doc.restore()
    y += altoRejilla

    fila([['Proveedor', r34.proveedor_nombre, 3],
          ['NIT / CC', r34.proveedor_nit, 1]])

    fila([['Dirección para la prestación del homenaje', r34.direccion_homenaje, 3],
          ['Hora', r34.hora_prestacion, 1]])

    fila([['Exequias', r34.lugar_exequias, 1],
          ['Cementerio', r34.cementerio, 1]])

    // Observaciones: es el campo que más texto lleva, así que va más alto.
    doc.save()
    const altoObs = 40
    doc.rect(M, y, CW, altoObs).lineWidth(0.6).strokeColor(BORDE).stroke()
    doc.fillColor(GRIS).font('Helvetica').fontSize(6.5).text('OBSERVACIONES', M + 5, y + 3.5)
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(9)
       .text(texto(r34.observaciones), M + 5, y + 14, { width: CW - 10, height: altoObs - 18 })
    doc.restore()
    y += altoObs + 12

    // ── Firmas ─────────────────────────────────────────────────────────────
    const firma = (x, ancho, valor, pie) => {
      doc.save()
      doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(9)
         .text(texto(valor), x, y, { width: ancho, align: 'center' })
      doc.moveTo(x, y + 16).lineTo(x + ancho, y + 16).lineWidth(0.7).strokeColor(TINTA).stroke()
      doc.fillColor(GRIS).font('Helvetica').fontSize(7)
         .text(pie, x, y + 20, { width: ancho, align: 'center' })
      doc.restore()
    }
    const anchoFirma = (CW - 40) / 2
    firma(M, anchoFirma, r34.autoriza_nombre || r34.autoriza_usuario, 'Nombre de quien autoriza')
    firma(M + anchoFirma + 40, anchoFirma, BLANCO, 'Firma del proveedor')
    y += 44

    pie()

    // ── Segunda hoja: el bloque de verificación, en blanco ─────────────────
    doc.addPage({ size: [HOJA_W, HOJA_H], margin: M })
    y = M

    encabezado('CONTRATACIÓN DE SERVICIOS · VERIFICACIÓN')

    doc.save()
    doc.rect(M, y, CW, 14).fill(SUAVE)
    doc.fillColor(GRIS).font('Helvetica-Oblique').fontSize(7)
       .text('Se diligencia a mano durante la prestación del servicio.', M + 6, y + 4)
    doc.restore()
    y += 14

    fila([['Hora de llegada al homenaje', BLANCO, 1],
          ['Funcionario que verifica', BLANCO, 2]])

    doc.save()
    const altoNov = 88
    doc.rect(M, y, CW, altoNov).lineWidth(0.6).strokeColor(BORDE).stroke()
    doc.fillColor(GRIS).font('Helvetica').fontSize(6.5)
       .text('NOVEDADES DURANTE EL CORTEJO Y DESTINO FINAL', M + 5, y + 3.5)
    // En esta hoja sobra espacio, así que van renglones de verdad para escribir.
    for (let i = 1; i <= 5; i++) {
      const ly = y + 10 + i * 14
      doc.moveTo(M + 5, ly).lineTo(M + CW - 5, ly).lineWidth(0.4).strokeColor('#dddddd').stroke()
    }
    doc.restore()
    y += altoNov

    fila([['Hora de ingreso al destino final', BLANCO, 1],
          ['Hora de retiro del destino final', BLANCO, 1]])

    y += 16
    firma(M, anchoFirma, BLANCO, 'Conductor — nombre y firma')
    firma(M + anchoFirma + 40, anchoFirma, BLANCO, 'Contratante / familiar autorizado')

    pie()

    doc.end()
  })
}

module.exports = { generarR34Pdf, SERVICIOS }
