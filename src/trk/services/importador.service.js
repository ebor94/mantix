// ============================================
// Importador TRIKIPELUDOS (HU-1). analizarCsv no toca la BD: solo produce la vista previa.
// ============================================
const { parse } = require('csv-parse/sync');
const TrkError = require('../utils/TrkError');
const db = require('../../models');

const { Op } = db.Sequelize;
const previewCache = require('./previewCache');
const { registrarAuditoria } = require('./auditoria.service');
const { emitir } = require('../sockets/bus');
const {
  normalizarTexto, soloDigitos, normalizarEspecie, normalizarSexo, mapearCategoria, esCategoriaCombinada, telefonoValido,
  parsearFechaInscripcion, parsearAutorizacion, campoDeEncabezado, esRazaPequena, esRazaGrande
} = require('../utils/normalizar');

const OBLIGATORIAS = ['responsable_nombre', 'mascota_nombre', 'categoria'];
const PATRON_VARIAS_MASCOTAS = /(\sy\s|,|&|\+|\bdos\b|\btres\b)/;

const coherente = (especie, categoria) => (especie === 'GATO'
  ? ['FELINOS', 'FAMILIAR'].includes(categoria)
  : ['PEQUENOS', 'MEDIANOS', 'GRANDES', 'FAMILIAR'].includes(categoria));

function sugerirCategoria(especie, raza) {
  if (especie === 'GATO') return 'FELINOS';
  if (esRazaGrande(raza)) return 'GRANDES';
  if (esRazaPequena(raza)) return 'PEQUENOS';
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
  if (categoriaCodigo === 'PEQUENOS' && especie !== 'GATO' && esCategoriaCombinada(crudo.categoria)) {
    advertencias.push({
      codigo: 'CATEGORIA_COMBINADA',
      mensaje: "Categoría antigua 'pequeños y medianos': revisa si es mediano",
      sugerencia: 'MEDIANOS'
    });
  }
  if (categoriaCodigo === 'GRANDES' && esRazaPequena(crudo.raza)) {
    advertencias.push({ codigo: 'RAZA_PEQUENA_EN_GRANDES', mensaje: `Raza "${crudo.raza}" inscrita en Caninos grandes`, sugerencia: 'PEQUENOS' });
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

// Bytes del archivo → texto. Quita BOM UTF-8; si los bytes no son UTF-8 válido (Excel "CSV" en Windows),
// se decodifica como windows-1252 (superconjunto práctico de Latin-1: ñ, tildes).
function decodificarCsv(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? '');
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.replace(/^\ufeff/, '');
}

const DELIMITADORES = [',', ';', '\t'];

// Excel en español exporta con ";". Se elige el delimitador cuyo encabezado reconoce más columnas
// conocidas; a igualdad, el que produce más columnas; a igualdad, la coma.
function detectarDelimitador(texto) {
  let mejor = { delimitador: ',', conocidas: -1, columnas: -1 };
  for (const delimitador of DELIMITADORES) {
    let encabezado;
    try {
      [encabezado] = parse(texto, { delimiter: delimitador, to_line: 1, relax_column_count: true, relax_quotes: true, trim: true });
    } catch {
      continue;
    }
    if (!encabezado) continue;
    const conocidas = encabezado.filter((h) => { const c = campoDeEncabezado(h); return c && c !== 'notas'; }).length;
    if (conocidas > mejor.conocidas || (conocidas === mejor.conocidas && encabezado.length > mejor.columnas)) {
      mejor = { delimitador, conocidas, columnas: encabezado.length };
    }
  }
  return mejor.delimitador;
}

function analizarCsv(buffer) {
  const texto = decodificarCsv(buffer);
  const registros = parse(texto, { delimiter: detectarDelimitador(texto), columns: false, skip_empty_lines: true, relax_column_count: true, trim: true });
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

// Campos que una reimportación puede llenar si están vacíos (CA3). Nunca foto oficial ni estado; la categoría
// tiene su propia regla (decidirCategoria).
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

const API_IMPORTAR = 'TRK-IMP-002';

// ¿Alguien cambió (o propuso) la categoría fuera del importador? Entonces la hoja no manda sobre ese arreglo manual.
async function categoriaTocadaAMano(participanteId, transaction) {
  const n = await db.TrkAuditoria.count({
    where: {
      entidad: 'participante',
      entidad_id: String(participanteId),
      accion: ['CAMBIAR_CATEGORIA', 'PROPONER_CATEGORIA'],
      [Op.or]: [{ api_codigo: { [Op.ne]: API_IMPORTAR } }, { api_codigo: null }]
    },
    transaction
  });
  return n > 0;
}

// La propuesta pendiente la dejó el importador (la última PROPONER_CATEGORIA es de TRK-IMP-002). Solo esas las
// puede descartar una hoja nueva; una propuesta hecha a mano por el admin no se toca.
async function propuestaDelImportador(participanteId, transaction) {
  const ultima = await db.TrkAuditoria.findOne({
    where: { entidad: 'participante', entidad_id: String(participanteId), accion: 'PROPONER_CATEGORIA' },
    order: [['id', 'DESC']],
    transaction
  });
  return Boolean(ultima && ultima.api_codigo === API_IMPORTAR);
}

// Categorías v2: si la fila trae otra categoría, la mascota se mueve directamente solo si nada depende de la
// categoría actual (sin calificaciones, sin salir a pasarela, sin fusionar) y nadie la cambió a mano. Si no, el cambio
// queda propuesto y el admin lo confirma en TRK-PAR-007 (que avisa del borrado de calificaciones). El destino
// cerrado o publicado se revisa al bloquear las categorías (confirmarImportacion). Devuelve 'MOVER', 'PROPONER',
// 'DESCARTAR' (la hoja ya coincide con la categoría actual y la propuesta pendiente era del importador) o null.
async function decidirCategoria(existente, nuevaId, transaction) {
  if (existente.fusionado_en_id) return null;
  if (existente.categoria_id === nuevaId) {
    return existente.categoria_propuesta_id && await propuestaDelImportador(existente.id, transaction) ? 'DESCARTAR' : null;
  }
  if (existente.categoria_propuesta_id === nuevaId) return null;
  const calificaciones = await db.TrkCalificacion.count({ where: { participante_id: existente.id }, transaction });
  if (calificaciones || ['EN_PASARELA', 'PRESENTADO'].includes(existente.estado)) return 'PROPONER';
  return (await categoriaTocadaAMano(existente.id, transaction)) ? 'PROPONER' : 'MOVER';
}

async function proponerCategoria(existente, nuevaId, ctx, transaction) {
  await existente.update({ categoria_propuesta_id: nuevaId }, { transaction });
  await registrarAuditoria(ctx, {
    entidad: 'participante', entidadId: existente.id, accion: 'PROPONER_CATEGORIA',
    antes: { categoria_id: existente.categoria_id }, despues: { categoria_propuesta_id: nuevaId }
  }, { transaction });
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

  const resultado = { creados: 0, actualizados: 0, omitidos: 0, recategorizados: 0, propuestas: 0 };
  const tocados = [];
  await db.sequelize.transaction(async (transaction) => {
    // Orden de bloqueo del módulo: evento → participantes → categoría (como confirmarCategoria y finalizarCategoria).
    // Las categorías destino se bloquean al final, después de todos los participantes, para no invertirlo.
    await db.TrkEventoEstado.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
    const movidos = [];
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
        // "pequeños y medianos" sin decisión en la vista previa: el tamaño es incierto, no se toca la categoría.
        const combinadaSinDecidir = !categoriaDecidida[String(fila.indice)]
          && fila.advertencias.some((a) => a.codigo === 'CATEGORIA_COMBINADA');
        const nuevaId = idPorCodigo[codigo];
        const decision = combinadaSinDecidir ? null : await decidirCategoria(existente, nuevaId, transaction);
        if (decision === 'MOVER') {
          movidos.push({ participante: existente, nuevaId });
        } else if (decision === 'PROPONER') {
          await proponerCategoria(existente, nuevaId, ctx, transaction);
          resultado.propuestas += 1;
          tocados.push(existente);
        } else if (decision === 'DESCARTAR') {
          const pendiente = existente.categoria_propuesta_id;
          await existente.update({ categoria_propuesta_id: null }, { transaction });
          await registrarAuditoria(ctx, {
            entidad: 'participante', entidadId: existente.id, accion: 'DESCARTAR_PROPUESTA_CATEGORIA',
            antes: { categoria_propuesta_id: pendiente }, despues: { categoria_propuesta_id: null }
          }, { transaction });
          tocados.push(existente);
        }
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

    // Categorías destino en orden de id; MAX+1 como confirmarCategoria (sin orden previo, sigue sin orden).
    // Un destino cerrado o con ranking publicado no recibe mascotas directamente: queda como propuesta.
    const destinos = [...new Set(movidos.map((m) => m.nuevaId))].sort((a, b) => a - b);
    const bloqueados = new Set();
    for (const id of destinos) {
      const cat = await db.TrkCategoria.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!cat.abierta || cat.ranking_publicado) bloqueados.add(id);
    }
    for (const { participante, nuevaId } of movidos) {
      if (bloqueados.has(nuevaId)) {
        await proponerCategoria(participante, nuevaId, ctx, transaction);
        resultado.propuestas += 1;
        tocados.push(participante);
        continue;
      }
      const antes = { categoria_id: participante.categoria_id, orden_pasarela: participante.orden_pasarela };
      const maximo = await db.TrkParticipante.max('orden_pasarela', { where: { categoria_id: nuevaId }, transaction });
      await participante.update({
        categoria_id: nuevaId, categoria_propuesta_id: null, desempate_manual: null,
        orden_pasarela: participante.orden_pasarela == null ? null : (maximo || 0) + 1
      }, { transaction });
      await registrarAuditoria(ctx, {
        entidad: 'participante', entidadId: participante.id, accion: 'CAMBIAR_CATEGORIA',
        antes, despues: { categoria_id: nuevaId, orden_pasarela: participante.orden_pasarela }
      }, { transaction });
      resultado.recategorizados += 1;
      tocados.push(participante);
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
  for (const p of tocados) emitir('participante:actualizado', { participante: p.get({ plain: true }) });
  return resultado;
}

module.exports = { analizarCsv, confirmarImportacion, decodificarCsv, detectarDelimitador };
