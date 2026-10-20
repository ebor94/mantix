// ============================================
// Importador TRIKIPELUDOS (HU-1). analizarCsv no toca la BD: solo produce la vista previa.
// ============================================
const { parse } = require('csv-parse/sync');
const TrkError = require('../utils/TrkError');
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

module.exports = { analizarCsv };
