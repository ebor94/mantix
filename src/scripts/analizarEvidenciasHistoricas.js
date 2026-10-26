// =============================================================
// src/scripts/analizarEvidenciasHistoricas.js
//
// FASE 1 (análisis): Lee todos los MantenimientoEjecutado,
// extrae URLs de Drive de trabajo_realizado + observaciones +
// nombre_recibe, los agrupa en "jornadas" (fecha + proveedor +
// categoría + sedes) y escupe un CSV con el detalle.
//
// NO toca Drive ni modifica la base. Es solo lectura.
//
// Uso:
//   node src/scripts/analizarEvidenciasHistoricas.js \
//     [--desde=YYYY-MM-DD] [--hasta=YYYY-MM-DD] \
//     [--out=docs/reporte-evidencias-historicas.csv]
// =============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { Op } = require('sequelize');
const db = require('../models');
const {
  MantenimientoEjecutado,
  MantenimientoProgramado,
  PlanActividad,
  Sede,
  Equipo,
  CategoriaMantenimiento,
  Usuario,
  Proveedor
} = db;

// ------------ CLI args ------------
const argv = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  acc[k] = v === undefined ? true : v;
  return acc;
}, {});

const DESDE = argv.desde || null;
const HASTA = argv.hasta || null;
const OUT = argv.out || path.join(__dirname, '..', '..', 'docs', 'reporte-evidencias-historicas.csv');

// ------------ Helpers ------------
const DRIVE_RE = /https?:\/\/(?:drive\.google\.com|docs\.google\.com)\/[^\s<>")\]]+/gi;

const extractUrls = (texto) => {
  if (!texto) return [];
  const matches = String(texto).match(DRIVE_RE) || [];
  return Array.from(new Set(matches.map(u => u.replace(/[.,;)\]]+$/, ''))));
};

const detectDriveType = (url) => {
  if (/\/file\/d\//.test(url)) return 'file';
  if (/\/drive\/folders\//.test(url) || /\/folders\//.test(url)) return 'folder';
  if (/\/document\/d\//.test(url)) return 'gdoc';
  if (/\/spreadsheets\/d\//.test(url)) return 'gsheet';
  if (/\/presentation\/d\//.test(url)) return 'gslides';
  return 'other';
};

const extractDriveId = (url) => {
  // /file/d/ID/view, /document/d/ID/edit, /drive/folders/ID
  const m =
    url.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]{15,})/) ||
    url.match(/\/folders\/([a-zA-Z0-9_-]{15,})/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  return m ? m[1] : '';
};

const slug = (s) => (s || '').toString()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '').trim();

const toISODate = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const resolverProveedor = (act) => {
  if (act?.responsable_proveedor?.nombre) return act.responsable_proveedor.nombre;
  if (act?.responsable_usuario) {
    const u = act.responsable_usuario;
    return [u.nombre, u.apellido].filter(Boolean).join(' ');
  }
  return 'SinProveedor';
};

const csvEscape = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
};

// ------------ Main ------------
(async () => {
  try {
    console.log('🔍 Conectando a la DB...');
    await db.sequelize.authenticate();

    const whereProg = {};
    if (DESDE || HASTA) {
      whereProg.fecha_programada = {};
      if (DESDE) whereProg.fecha_programada[Op.gte] = DESDE;
      if (HASTA) whereProg.fecha_programada[Op.lte] = HASTA;
    }

    console.log('📥 Trayendo mantenimientos ejecutados...');
    const ejecutados = await MantenimientoEjecutado.findAll({
      attributes: [
        'id', 'mantenimiento_programado_id', 'fecha_ejecucion',
        'trabajo_realizado', 'observaciones', 'nombre_recibe',
        'drive_jornada_url'
      ],
      include: [
        {
          model: MantenimientoProgramado,
          as: 'mantenimiento_programado',
          attributes: ['id', 'codigo', 'fecha_programada'],
          where: Object.keys(whereProg).length ? whereProg : undefined,
          include: [
            {
              model: PlanActividad,
              as: 'actividad',
              attributes: ['id', 'nombre'],
              include: [
                { model: Sede, as: 'sede', attributes: ['id', 'codigo'] },
                { model: Equipo, as: 'equipo', attributes: ['id', 'nombre'] },
                { model: CategoriaMantenimiento, as: 'categoria', attributes: ['id', 'nombre'] },
                { model: Proveedor, as: 'responsable_proveedor', attributes: ['id', 'nombre'], required: false },
                { model: Usuario, as: 'responsable_usuario', attributes: ['id', 'nombre', 'apellido'], required: false }
              ]
            }
          ]
        }
      ]
    });

    console.log(`✅ ${ejecutados.length} registros leídos.`);

    const filas = [];
    const jornadas = new Map(); // key → { fecha, proveedor, categoria, sedes:Set, equipos:Set, mantenimientos:[] }
    const urlsUnicas = new Map(); // url → { driveId, tipo, mnts:Set, fechas:Set, proveedores:Set, categorias:Set, sedes:Set }

    let conUrl = 0;
    let yaMigrados = 0;
    let sinUrl = 0;

    for (const ej of ejecutados) {
      const prog = ej.mantenimiento_programado;
      const act = prog?.actividad;
      if (!act) continue;

      const textoCompleto = [ej.trabajo_realizado, ej.observaciones, ej.nombre_recibe]
        .filter(Boolean).join(' | ');
      const urls = extractUrls(textoCompleto);
      const fecha = toISODate(ej.fecha_ejecucion);
      const proveedor = resolverProveedor(act);
      const categoria = act.categoria?.nombre || 'SinCategoria';
      const sedeCod = act.sede?.codigo || 'SIN';
      const equipoNombre = act.equipo?.nombre || '';
      const mntCodigo = prog.codigo || `MNT-${prog.id}`;
      const yaMigrado = !!ej.drive_jornada_url;
      if (yaMigrado) yaMigrados++;

      if (urls.length === 0) {
        sinUrl++;
        filas.push({
          mnt_ejecutado_id: ej.id,
          mnt_codigo: mntCodigo,
          fecha_ejecucion: fecha,
          equipo: equipoNombre,
          sede: sedeCod,
          categoria,
          proveedor,
          ya_migrado: yaMigrado ? 'si' : 'no',
          urls_detectadas: 0,
          url: '',
          tipo: '',
          drive_id: '',
          jornada_sugerida: ''
        });
        continue;
      }

      conUrl++;

      // Jornada: fecha + proveedor + categoría. Sedes y equipos se acumulan.
      const jkey = `${fecha}__${slug(proveedor)}__${slug(categoria)}`;
      const nombreJornada = `${fecha}_${slug(proveedor)}_${slug(categoria)}`;
      if (!jornadas.has(jkey)) {
        jornadas.set(jkey, {
          fecha, proveedor, categoria,
          sedes: new Set(), equipos: new Set(),
          mantenimientos: new Set(),
          urls: new Set()
        });
      }
      const j = jornadas.get(jkey);
      if (sedeCod) j.sedes.add(sedeCod);
      if (equipoNombre) j.equipos.add(equipoNombre);
      j.mantenimientos.add(mntCodigo);
      urls.forEach(u => j.urls.add(u));

      for (const u of urls) {
        const driveId = extractDriveId(u);
        const tipo = detectDriveType(u);

        if (!urlsUnicas.has(u)) {
          urlsUnicas.set(u, {
            driveId, tipo,
            mnts: new Set(), fechas: new Set(),
            proveedores: new Set(), categorias: new Set(), sedes: new Set()
          });
        }
        const ur = urlsUnicas.get(u);
        ur.mnts.add(mntCodigo);
        ur.fechas.add(fecha);
        ur.proveedores.add(proveedor);
        ur.categorias.add(categoria);
        ur.sedes.add(sedeCod);

        filas.push({
          mnt_ejecutado_id: ej.id,
          mnt_codigo: mntCodigo,
          fecha_ejecucion: fecha,
          equipo: equipoNombre,
          sede: sedeCod,
          categoria,
          proveedor,
          ya_migrado: yaMigrado ? 'si' : 'no',
          urls_detectadas: urls.length,
          url: u,
          tipo,
          drive_id: driveId,
          jornada_sugerida: `${nombreJornada}_${[...j.sedes].join('-') || sedeCod}`
        });
      }
    }

    // CSV detalle
    const headerDet = Object.keys(filas[0] || {
      mnt_ejecutado_id: '', mnt_codigo: '', fecha_ejecucion: '', equipo: '',
      sede: '', categoria: '', proveedor: '', ya_migrado: '',
      urls_detectadas: '', url: '', tipo: '', drive_id: '', jornada_sugerida: ''
    });
    const detallePath = OUT;
    const detalleRows = [headerDet.join(',')]
      .concat(filas.map(f => headerDet.map(k => csvEscape(f[k])).join(',')));
    fs.writeFileSync(detallePath, detalleRows.join('\n'), 'utf-8');

    // CSV resumen por jornada
    const resumenPath = detallePath.replace(/\.csv$/, '-jornadas.csv');
    const headerRes = [
      'fecha', 'proveedor', 'categoria', 'sedes',
      'cant_mantenimientos', 'cant_urls', 'cant_equipos', 'nombre_sugerido'
    ];
    const jornadaRows = [headerRes.join(',')];
    const jornadasOrdenadas = Array.from(jornadas.values()).sort((a, b) =>
      a.fecha.localeCompare(b.fecha)
    );
    for (const j of jornadasOrdenadas) {
      const sedes = [...j.sedes].join('-') || 'SIN';
      const nombre = `${j.fecha}_${slug(j.proveedor)}_${slug(j.categoria)}_${sedes}`;
      jornadaRows.push([
        j.fecha, j.proveedor, j.categoria, sedes,
        j.mantenimientos.size, j.urls.size, j.equipos.size,
        nombre
      ].map(csvEscape).join(','));
    }
    fs.writeFileSync(resumenPath, jornadaRows.join('\n'), 'utf-8');

    // CSV URLs únicas (cuántos MNT comparten cada archivo)
    const urlsPath = detallePath.replace(/\.csv$/, '-urls-unicas.csv');
    const headerUrls = [
      'url', 'drive_id', 'tipo',
      'cant_mantenimientos', 'cant_fechas',
      'cant_proveedores', 'cant_categorias', 'cant_sedes',
      'proveedor', 'categoria', 'fecha_min', 'fecha_max', 'sedes'
    ];
    const urlRows = [headerUrls.join(',')];
    const urlsOrdenadas = Array.from(urlsUnicas.entries())
      .sort((a, b) => b[1].mnts.size - a[1].mnts.size);
    for (const [u, info] of urlsOrdenadas) {
      const fechas = [...info.fechas].sort();
      urlRows.push([
        u, info.driveId, info.tipo,
        info.mnts.size, info.fechas.size,
        info.proveedores.size, info.categorias.size, info.sedes.size,
        [...info.proveedores].join(' | '),
        [...info.categorias].join(' | '),
        fechas[0] || '', fechas[fechas.length - 1] || '',
        [...info.sedes].join('-')
      ].map(csvEscape).join(','));
    }
    fs.writeFileSync(urlsPath, urlRows.join('\n'), 'utf-8');

    // Resumen por pantalla
    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('RESUMEN');
    console.log('════════════════════════════════════════════════');
    console.log(`Total ejecutados leídos         : ${ejecutados.length}`);
    console.log(`Con al menos 1 URL de Drive     : ${conUrl}`);
    console.log(`Sin URL                         : ${sinUrl}`);
    console.log(`Ya migrados (drive_jornada_url) : ${yaMigrados}`);
    console.log(`Jornadas únicas detectadas      : ${jornadas.size}`);
    console.log(`URLs únicas de Drive            : ${urlsUnicas.size}`);
    console.log('');
    console.log('🔝 Top 5 URLs más reutilizadas:');
    urlsOrdenadas.slice(0, 5).forEach(([u, info], i) => {
      console.log(`   ${i + 1}. ${info.driveId} → ${info.mnts.size} MNT (${[...info.proveedores].join(', ')})`);
    });
    console.log('');
    console.log('📄 Archivos generados:');
    console.log(`   detalle   → ${detallePath}`);
    console.log(`   jornadas  → ${resumenPath}`);
    console.log(`   urls      → ${urlsPath}`);
    console.log('');
    console.log('✅ Fase 1 completa. Revisá los CSV y después decidimos la Fase 2 (copia).');

    await db.sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('💥 Error:', e);
    try { await db.sequelize.close(); } catch (_) { /* ignore */ }
    process.exit(1);
  }
})();
