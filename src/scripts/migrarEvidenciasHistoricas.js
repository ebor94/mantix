// =============================================================
// src/scripts/migrarEvidenciasHistoricas.js
//
// FASE 2: Actualiza drive_jornada_url y drive_informe_url de los
// MantenimientoEjecutado existentes, extrayendo las URLs que
// están en el texto de trabajo_realizado / observaciones /
// nombre_recibe.
//
// Reglas:
//   - folder (/drive/folders/) → drive_jornada_url
//   - file   (/file/d/, docs, sheets, slides) → drive_informe_url
//   - Si ya hay valor en el campo, NO se sobreescribe (idempotente).
//   - trabajo_realizado y los demás campos quedan intactos.
//   - Se corre en una transacción. --apply la commitea.
//
// Uso:
//   node src/scripts/migrarEvidenciasHistoricas.js \
//     [--apply]                 (sin esto es dry-run)
//     [--desde=YYYY-MM-DD]
//     [--hasta=YYYY-MM-DD]
//     [--out=docs/migracion-evidencias-historicas.csv]
// =============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { Op } = require('sequelize');
const db = require('../models');
const { MantenimientoEjecutado, MantenimientoProgramado } = db;

const argv = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  acc[k] = v === undefined ? true : v;
  return acc;
}, {});

const APPLY = !!argv.apply;
const DESDE = argv.desde || null;
const HASTA = argv.hasta || null;
const OUT = argv.out || path.join(__dirname, '..', '..', 'docs', 'migracion-evidencias-historicas.csv');

// ---- Helpers ----
const DRIVE_RE = /https?:\/\/(?:drive\.google\.com|docs\.google\.com)\/[^\s<>")\]]+/gi;

const extractUrls = (texto) => {
  if (!texto) return [];
  const matches = String(texto).match(DRIVE_RE) || [];
  return Array.from(new Set(matches.map(u => u.replace(/[.,;)\]]+$/, ''))));
};

const detectDriveType = (url) => {
  if (/\/drive\/folders\//.test(url) || /\/folders\//.test(url)) return 'folder';
  if (/\/file\/d\//.test(url)) return 'file';
  if (/\/document\/d\//.test(url)) return 'file';
  if (/\/spreadsheets\/d\//.test(url)) return 'file';
  if (/\/presentation\/d\//.test(url)) return 'file';
  return 'other';
};

const extractDriveId = (url) => {
  const m =
    url.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]{15,})/) ||
    url.match(/\/folders\/([a-zA-Z0-9_-]{15,})/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  return m ? m[1] : '';
};

const csvEscape = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
};

// ---- Main ----
(async () => {
  const t = await db.sequelize.transaction();
  try {
    console.log(`🔧 Modo: ${APPLY ? 'APPLY (commit al final)' : 'DRY-RUN (no commitea)'}`);
    console.log('🔍 Conectando a la DB...');

    const whereProg = {};
    if (DESDE || HASTA) {
      whereProg.fecha_programada = {};
      if (DESDE) whereProg.fecha_programada[Op.gte] = DESDE;
      if (HASTA) whereProg.fecha_programada[Op.lte] = HASTA;
    }

    const ejecutados = await MantenimientoEjecutado.findAll({
      attributes: [
        'id', 'mantenimiento_programado_id',
        'trabajo_realizado', 'observaciones', 'nombre_recibe',
        'drive_jornada_url', 'drive_jornada_folder_id', 'drive_informe_url'
      ],
      include: [{
        model: MantenimientoProgramado,
        as: 'mantenimiento_programado',
        attributes: ['id', 'codigo', 'fecha_programada'],
        where: Object.keys(whereProg).length ? whereProg : undefined
      }],
      transaction: t
    });

    console.log(`📥 ${ejecutados.length} registros a evaluar.`);

    const filas = [];
    const stats = {
      sinUrl: 0,
      yaCompletos: 0,
      actualizaJornadaOnly: 0,
      actualizaInformeOnly: 0,
      actualizaAmbos: 0,
      multiplesFolders: 0,
      multiplesFiles: 0,
      errores: 0
    };

    for (const ej of ejecutados) {
      const texto = [ej.trabajo_realizado, ej.observaciones, ej.nombre_recibe]
        .filter(Boolean).join(' | ');
      const urls = extractUrls(texto);

      if (urls.length === 0) {
        stats.sinUrl++;
        continue;
      }

      const folders = urls.filter(u => detectDriveType(u) === 'folder');
      const files = urls.filter(u => detectDriveType(u) === 'file');

      if (folders.length > 1) stats.multiplesFolders++;
      if (files.length > 1) stats.multiplesFiles++;

      // Si ya tiene ambos, nada que hacer
      const yaJornada = !!ej.drive_jornada_url;
      const yaInforme = !!ej.drive_informe_url;
      if (yaJornada && yaInforme) {
        stats.yaCompletos++;
        continue;
      }

      const updates = {};
      let aplicoJornada = false;
      let aplicoInforme = false;

      if (!yaJornada && folders.length > 0) {
        updates.drive_jornada_url = folders[0];
        const fid = extractDriveId(folders[0]);
        if (fid) updates.drive_jornada_folder_id = fid;
        aplicoJornada = true;
      }

      if (!yaInforme && files.length > 0) {
        updates.drive_informe_url = files[0];
        aplicoInforme = true;
      }

      if (Object.keys(updates).length === 0) {
        continue;
      }

      if (aplicoJornada && aplicoInforme) stats.actualizaAmbos++;
      else if (aplicoJornada) stats.actualizaJornadaOnly++;
      else if (aplicoInforme) stats.actualizaInformeOnly++;

      filas.push({
        mnt_ejecutado_id: ej.id,
        mnt_codigo: ej.mantenimiento_programado?.codigo || `MNT-${ej.mantenimiento_programado_id}`,
        drive_jornada_url: updates.drive_jornada_url || '',
        drive_jornada_folder_id: updates.drive_jornada_folder_id || '',
        drive_informe_url: updates.drive_informe_url || '',
        folders_detectados: folders.length,
        files_detectados: files.length,
        folders_extras: folders.slice(1).join(' | '),
        files_extras: files.slice(1).join(' | ')
      });

      if (APPLY) {
        try {
          await MantenimientoEjecutado.update(updates, {
            where: { id: ej.id },
            transaction: t
          });
        } catch (e) {
          stats.errores++;
          console.error(`❌ Error actualizando id=${ej.id}: ${e.message}`);
        }
      }
    }

    // Reporte CSV
    const header = [
      'mnt_ejecutado_id', 'mnt_codigo',
      'drive_jornada_url', 'drive_jornada_folder_id', 'drive_informe_url',
      'folders_detectados', 'files_detectados',
      'folders_extras', 'files_extras'
    ];
    const rows = [header.join(',')]
      .concat(filas.map(f => header.map(k => csvEscape(f[k])).join(',')));
    fs.writeFileSync(OUT, rows.join('\n'), 'utf-8');

    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log(`RESUMEN  (${APPLY ? 'APLICADO' : 'DRY-RUN'})`);
    console.log('════════════════════════════════════════════════');
    console.log(`Evaluados                       : ${ejecutados.length}`);
    console.log(`Sin URL en texto                : ${stats.sinUrl}`);
    console.log(`Ya tenían ambos drive_*         : ${stats.yaCompletos}`);
    console.log(`A actualizar: solo jornada      : ${stats.actualizaJornadaOnly}`);
    console.log(`A actualizar: solo informe      : ${stats.actualizaInformeOnly}`);
    console.log(`A actualizar: ambos             : ${stats.actualizaAmbos}`);
    console.log(`TOTAL registros tocados         : ${filas.length}`);
    console.log('');
    console.log(`⚠️  MNT con múltiples folders    : ${stats.multiplesFolders}`);
    console.log(`⚠️  MNT con múltiples files      : ${stats.multiplesFiles}`);
    if (stats.errores) console.log(`❌ Errores durante update       : ${stats.errores}`);
    console.log('');
    console.log(`📄 Reporte CSV → ${OUT}`);

    if (APPLY && stats.errores === 0) {
      await t.commit();
      console.log('✅ Transacción commiteada.');
    } else if (APPLY && stats.errores > 0) {
      await t.rollback();
      console.log('🔙 Hubo errores: transacción revertida.');
    } else {
      await t.rollback();
      console.log('ℹ️  DRY-RUN: ningún cambio fue persistido.');
      console.log('    Volvé a correr con --apply para aplicar.');
    }

    await db.sequelize.close();
    process.exit(stats.errores ? 1 : 0);
  } catch (e) {
    console.error('💥 Error fatal:', e);
    try { await t.rollback(); } catch (_) { /* ignore */ }
    try { await db.sequelize.close(); } catch (_) { /* ignore */ }
    process.exit(1);
  }
})();
