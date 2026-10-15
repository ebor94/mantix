/**
 * licencias.controller.js — Licencia de inhumación DANE (forma D631).
 *
 * Se arma con los datos del ERP buscando por contrato, se revisa y se corrige
 * en pantalla, y lo que quedó impreso se guarda. Lo que se guarda es el
 * documento, no una referencia: la licencia se entrega al cementerio y la ley
 * obliga a conservarla, así que importa qué decía el papel, no qué dice el
 * ERP hoy.
 *
 * El ERP no es la última palabra en varios campos —el tipo de documento se
 * deduce de la edad cuando no está, y el destino final a veces sale con el
 * nombre del servicio en vez del cementerio—, y por eso todo es editable.
 */
const db         = require('../config/db')
const karingsoft = require('../services/karingsoft.service')

const texto = (v, max) => String(v ?? '').trim().slice(0, max)
const numeroCasilla = (v, validos) => {
  const n = Number(v)
  return validos.includes(n) ? n : null
}

/**
 * GET /licencias/contrato/:contrato
 * Lo que el ERP sabe del caso, más las licencias que ya se generaron.
 */
async function porContrato(req, res, next) {
  try {
    const contrato = texto(req.params.contrato, 20)
    if (!contrato) return res.status(400).json({ mensaje: 'Falta el número de contrato' })

    const datos = await karingsoft.licenciaInhumacion(contrato)
    if (!datos)
      return res.status(404).json({
        mensaje: `El ERP no tiene una orden de servicio con el contrato ${contrato}.`, contrato,
      })

    const [emitidas] = await db.query(
      `SELECT id, created_at, generada_por, generada_nombre,
              primer_apellido, segundo_apellido, nombres, permiso_inhumar_en
         FROM h360_licencia_inhumacion
        WHERE contrato = ? ORDER BY created_at DESC`, [contrato])

    res.json({ contrato, datos, emitidas })
  } catch (err) {
    console.warn('[licencias] porContrato:', err.message)
    res.status(502).json({ mensaje: `No se pudo consultar el ERP: ${err.message}` })
  }
}

// POST /licencias — guarda lo que se imprimió
async function crear(req, res, next) {
  try {
    const { usuario, nombre } = req.user
    const b = req.body

    const contrato = texto(b.contrato, 20)
    if (!contrato) return res.status(400).json({ mensaje: 'Falta el número de contrato' })
    if (!texto(b.primer_apellido, 80) && !texto(b.nombres, 120))
      return res.status(400).json({ mensaje: 'Falta el nombre del fallecido' })

    const fila = {
      contrato,
      exp_anio:  texto(b.exp_anio, 4)  || null,
      exp_mes:   texto(b.exp_mes, 2)   || null,
      exp_dia:   texto(b.exp_dia, 2)   || null,
      departamento: texto(b.departamento, 80) || null,
      municipio:    texto(b.municipio, 80)    || null,
      inspeccion:   texto(b.inspeccion, 120)  || null,
      solicitante:     texto(b.solicitante, 150)    || null,
      solicitante_nit: texto(b.solicitante_nit, 40) || null,
      primer_apellido:  texto(b.primer_apellido, 80)   || null,
      segundo_apellido: texto(b.segundo_apellido, 80)  || null,
      nombres:          texto(b.nombres, 120)          || null,
      sexo_casilla: numeroCasilla(b.sexo_casilla, [1, 2, 3]),
      fall_anio: texto(b.fall_anio, 4) || null,
      fall_mes:  texto(b.fall_mes, 2)  || null,
      fall_dia:  texto(b.fall_dia, 2)  || null,
      manera_muerte_casilla: numeroCasilla(b.manera_muerte_casilla, [1, 2, 3]),
      certificado_defuncion: texto(b.certificado_defuncion, 30) || null,
      documento_casilla: numeroCasilla(b.documento_casilla, [1, 2, 3, 4, 5, 9]),
      documento_no:      texto(b.documento_no, 30) || null,
      edad_casilla: numeroCasilla(b.edad_casilla, [1, 2, 3, 4]),
      edad_valor:   texto(b.edad_valor, 4) || null,
      permiso_inhumar_en: texto(b.permiso_inhumar_en, 200) || null,
      generada_por: usuario,
      generada_nombre: texto(nombre, 150) || null,
    }

    const [r] = await db.query('INSERT INTO h360_licencia_inhumacion SET ?', [fila])
    const [[creada]] = await db.query('SELECT * FROM h360_licencia_inhumacion WHERE id = ?', [r.insertId])
    res.status(201).json(creada)
  } catch (err) { next(err) }
}

// GET /licencias/:id — para reimprimir una tal como se generó
async function obtener(req, res, next) {
  try {
    const [[l]] = await db.query('SELECT * FROM h360_licencia_inhumacion WHERE id = ?', [req.params.id])
    if (!l) return res.status(404).json({ mensaje: 'Licencia no encontrada' })
    res.json(l)
  } catch (err) { next(err) }
}

// GET /licencias  ?contrato=&desde=&hasta=
async function listar(req, res, next) {
  try {
    const filtros = []
    const params  = []
    const { contrato, desde, hasta, q } = req.query
    if (contrato) { filtros.push('contrato = ?');          params.push(texto(contrato, 20)) }
    if (desde)    { filtros.push('DATE(created_at) >= ?'); params.push(texto(desde, 10)) }
    if (hasta)    { filtros.push('DATE(created_at) <= ?'); params.push(texto(hasta, 10)) }
    if (q) {
      filtros.push(`(contrato LIKE ? OR CONCAT_WS(' ', primer_apellido, segundo_apellido, nombres) LIKE ?)`)
      const t = `%${texto(q, 60)}%`
      params.push(t, t)
    }
    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `SELECT id, contrato, primer_apellido, segundo_apellido, nombres,
              permiso_inhumar_en, generada_por, generada_nombre, created_at
         FROM h360_licencia_inhumacion ${where}
        ORDER BY created_at DESC LIMIT 200`, params)
    res.json(rows)
  } catch (err) { next(err) }
}

module.exports = { porContrato, crear, obtener, listar }
