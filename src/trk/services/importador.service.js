// ============================================
// Importador TRIKIPELUDOS (HU-1). analizarCsv no toca la BD: solo produce la vista previa.
// ============================================
const { parse } = require('csv-parse/sync');
const TrkError = require('../utils/TrkError');
const db = require('../../models');
const previewCache = require('./previewCache');
const { registrarAuditoria } = require('./auditoria.service');
const {
  normalizarTexto, soloDigitos, normalizarEspecie, normalizarSexo, mapearCategoria, telefonoValido,
  parsearFechaInscripcion, parsearAutorizacion, campoDeEncabezado, esRazaPequena, esRazaGrande
} = require('../utils/normalizar');

const OBLIGATORIAS = ['responsable_nombre', 'mascota_nombre', 'categoria'];
const PATRON_VARIAS_MASCOTAS = /(\sy\s|,|&|\+|\bdos\b|\btres\b)/;

const coherente = (especie, categoria) => (especie === 'GATO'
  ? ['FELINOS', 'FAMILIAR'].includes(categoria)
  : ['PEQ_MED', 'GRANDES', 'FAMILIAR'].includes(categoria));

function sugerirCategoria(especie, raza) {
  if (especie === 'GATO') return 'FELINOS';
  if (esRazaGrande(raza)) return 'GRANDES';
  if (esRazaPequena(raza)) return 'PEQ_MED';
  return null;
}

function analizarFila(celdas, campos, indice) {
  const crudo = {};
  const notas = [];
  campos.forEach((campo, j) => {
    const valor = String(celdas[j] ?? '').trim();
    if (!campo) return;
    if (campo === 'notas') {
      if (valor) notas.push(valor);
      return;
    }
    crudo[campo] = valor;
  });

  const advertencias = [];
  const errores = [];

  const documento = soloDigitos(crudo.responsable_documento);
  if (crudo.responsable_documento && documento !== crudo.responsable_documento) {
    advertencias.push({ codigo: 'DOCUMENTO_NORMALIZADO', mensaje: `Documento "${crudo.responsable_documento}" normalizado a ${documento}` });
  }

  const telefono = soloDigitos(crudo.responsable_telefono);
  if (crudo.responsable_telefono && !telefonoValido(telefono)) {
    advertencias.push({ codigo: 'TELEFONO_INVALIDO', mensaje: `El teléfono ${crudo.responsable_telefono} no tiene 10 dígitos` });
  }

  const { especie, extra } = normalizarEspecie(crudo.especie);
  if (extra) advertencias.push({ codigo: 'ESPECIE_TEXTO_EXTRA', mensaje: `La especie traía texto adicional: "${extra}"` });

  const categoriaCodigo = mapearCategoria(crudo.categoria);
  if (!crudo.mascota_nombre) errores.push({ codigo: 'MASCOTA_SIN_NOMBRE', mensaje: 'La fila no tiene nombre de mascota' });
  if (!crudo.responsable_nombre) errores.push({ codigo: 'RESPONSABLE_SIN_NOMBRE', mensaje: 'La fila no tiene nombre del responsable' });
  if (!categoriaCodigo) errores.push({ codigo: 'CATEGORIA_DESCONOCIDA', mensaje: `Categoría no reconocida: "${crudo.categoria || ''}"` });

  if (categoriaCodigo && especie && !coherente(especie, categoriaCodigo)) {
    advertencias.push({
      codigo: 'ESPECIE_CATEGORIA_INCOHERENTE',
      mensaje: `${especie === 'PERRO' ? 'Perro' : 'Gato'} inscrito en ${categoriaCodigo}`,
      sugerencia: sugerirCategoria(especie, crudo.raza)
    });
  }
  if (categoriaCodigo === 'GRANDES' && esRazaPequena(crudo.raza)) {
    advertencias.push({ codigo: 'RAZA_PEQUENA_EN_GRANDES', mensaje: `Raza "${crudo.raza}" inscrita en Caninos grandes`, sugerencia: 'PEQ_MED' });
  }
  if (PATRON_VARIAS_MASCOTAS.test(normalizarTexto(crudo.mascota_nombre))) {
    advertencias.push({ codigo: 'VARIAS_MASCOTAS', mensaje: 'La fila parece tener varias mascotas; divídela manualmente' });
  }
  if (notas.length) advertencias.push({ codigo: 'NOTA_IMPORTACION', mensaje: notas.join(' | ') });

  const notasImportacion = [extra ? `Especie original: ${crudo.especie}` : null, ...notas].filter(Boolean).join(' | ') || null;

  return {
    indice,
    linea: indice + 2,
    datos: {
      responsable_nombre: crudo.responsable_nombre || '',
      responsable_documento: documento || null,
      responsable_telefono: telefono || null,
      responsable_correo: crudo.responsable_correo || null,
      mascota_nombre: crudo.mascota_nombre || '',
      mascota_nombre_norm: normalizarTexto(crudo.mascota_nombre),
      especie,
      raza: crudo.raza || null,
      edad_texto: crudo.edad_texto || null,
      sexo: normalizarSexo(crudo.sexo),
      categoria_codigo: categoriaCodigo,
      autoriza_datos: parsearAutorizacion(crudo.autoriza_datos),
      autoriza_reglamento: parsearAutorizacion(crudo.autoriza_reglamento),
      fecha_inscripcion: parsearFechaInscripcion(crudo.fecha_inscripcion),
      disfraz_nombre: crudo.disfraz_nombre || null,
      foto_inscripcion_url: crudo.foto_inscripcion_url || null,
      notas_importacion: notasImportacion
    },
    advertencias,
    errores,
    grupo_duplicado: null,
    conservar_por_defecto: true
  };
}

function marcarDuplicados(filas) {
  const grupos = new Map();
  for (const f of filas) {
    if (!f.datos.responsable_documento || !f.datos.mascota_nombre_norm) continue;
    const clave = `${f.datos.responsable_documento}|${f.datos.mascota_nombre_norm}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(f);
  }
  let n = 0;
  for (const miembros of grupos.values()) {
    if (miembros.length < 2) continue;
    const id = `dup-${++n}`;
    const lineas = miembros.map((m) => `${m.linea} (${m.datos.categoria_codigo || '?'})`).join(', ');
    miembros.forEach((m, i) => {
      m.grupo_duplicado = id;
      m.conservar_por_defecto = i === 0;
      m.advertencias.push({ codigo: 'POSIBLE_DUPLICADO', mensaje: `Misma mascota en las líneas ${lineas}. Una mascota compite en una sola categoría.` });
    });
  }
  return n;
}

function analizarCsv(buffer) {
  const texto = buffer.toString('utf8').replace(/^﻿/, '');
  const registros = parse(texto, { columns: false, skip_empty_lines: true, relax_column_count: true, trim: true });
  if (!registros.length) throw new TrkError(400, 'VALIDACION', 'El archivo está vacío');

  const campos = registros[0].map(campoDeEncabezado);
  const faltan = OBLIGATORIAS.filter((c) => !campos.includes(c));
  if (faltan.length) throw new TrkError(400, 'VALIDACION', `Faltan columnas obligatorias: ${faltan.join(', ')}`);

  const filas = registros.slice(1).map((celdas, i) => analizarFila(celdas, campos, i));
  const gruposDuplicados = marcarDuplicados(filas);

  return {
    filas,
    resumen: {
      total: filas.length,
      ok: filas.filter((f) => !f.advertencias.length && !f.errores.length).length,
      con_advertencias: filas.filter((f) => f.advertencias.length).length,
      con_errores: filas.filter((f) => f.errores.length).length,
      grupos_duplicados: gruposDuplicados
    }
  };
}

// Campos que una reimportación puede llenar si están vacíos (CA3). Nunca foto oficial, estado ni categoría.
const CAMPOS_RELLENABLES = [
  'responsable_nombre', 'responsable_documento', 'responsable_telefono', 'responsable_correo', 'especie', 'raza',
  'edad_texto', 'sexo', 'disfraz_nombre', 'foto_inscripcion_url', 'fecha_inscripcion', 'notas_importacion'
];
const vacio = (v) => v === null || v === undefined || v === '';

function buscarExistente(datos, transaction) {
  const where = datos.responsable_documento
    ? { responsable_documento: datos.responsable_documento, mascota_nombre_norm: datos.mascota_nombre_norm }
    : { responsable_documento: null, mascota_nombre_norm: datos.mascota_nombre_norm, responsable_nombre: datos.responsable_nombre };
  return db.TrkParticipante.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
}

function cambiosParaVacios(existente, datos, advertencias) {
  const cambios = {};
  for (const campo of CAMPOS_RELLENABLES) {
    if (vacio(existente[campo]) && !vacio(datos[campo])) cambios[campo] = datos[campo];
  }
  if (vacio(existente.advertencias_importacion) && advertencias.length) cambios.advertencias_importacion = advertencias;
  return cambios;
}

async function confirmarImportacion({ token, decisiones = {} }, ctx) {
  const entrada = previewCache.obtener(token);
  if (!entrada) throw new TrkError(409, 'PREVIEW_VENCIDO', 'La vista previa venció; vuelve a cargar el archivo');

  const omitir = new Set(decisiones.omitir || []);
  const conservar = decisiones.conservar || {};
  const categoriaDecidida = decisiones.categoria || {};

  const categorias = await db.TrkCategoria.findAll();
  const idPorCodigo = Object.fromEntries(categorias.map((c) => [c.codigo, c.id]));
  for (const codigo of Object.values(categoriaDecidida)) {
    if (!idPorCodigo[codigo]) throw new TrkError(400, 'VALIDACION', `Categoría desconocida: ${codigo}`);
  }

  const { filas, resumen } = entrada.analisis;
  const primeraDelGrupo = {};
  for (const f of filas) if (f.grupo_duplicado && f.conservar_por_defecto) primeraDelGrupo[f.grupo_duplicado] = f.indice;

  const resultado = { creados: 0, actualizados: 0, omitidos: 0 };
  await db.sequelize.transaction(async (transaction) => {
    for (const fila of filas) {
      const codigo = categoriaDecidida[String(fila.indice)] || fila.datos.categoria_codigo;
      const elegidaDelGrupo = fila.grupo_duplicado
        ? Number(conservar[fila.grupo_duplicado] ?? primeraDelGrupo[fila.grupo_duplicado])
        : fila.indice;
      const importable = !omitir.has(fila.indice) && idPorCodigo[codigo] && fila.datos.mascota_nombre
        && fila.datos.responsable_nombre && elegidaDelGrupo === fila.indice;
      if (!importable) {
        resultado.omitidos += 1;
        continue;
      }

      const { categoria_codigo: _ignorada, ...datos } = fila.datos;
      const existente = await buscarExistente(datos, transaction);
      if (existente) {
        const cambios = cambiosParaVacios(existente, datos, fila.advertencias);
        if (Object.keys(cambios).length) await existente.update(cambios, { transaction });
        resultado.actualizados += 1;
      } else {
        await db.TrkParticipante.create({
          ...datos,
          categoria_id: idPorCodigo[codigo],
          advertencias_importacion: fila.advertencias.length ? fila.advertencias : null,
          estado: 'INSCRITO',
          origen: 'IMPORTACION'
        }, { transaction });
        resultado.creados += 1;
      }
    }

    await db.TrkImportacion.create({
      usuario_id: ctx.usuarioId,
      archivo_nombre: entrada.meta.archivoNombre,
      archivo_sha256: token,
      filas_total: resumen.total,
      filas_ok: resultado.creados + resultado.actualizados,
      filas_advertencia: resumen.con_advertencias
    }, { transaction });
    await registrarAuditoria(ctx, {
      entidad: 'importacion', entidadId: token.slice(0, 36), accion: 'IMPORTAR',
      despues: { archivo: entrada.meta.archivoNombre, ...resultado }
    }, { transaction });
  });

  previewCache.borrar(token);
  return resultado;
}

module.exports = { analizarCsv, confirmarImportacion };
