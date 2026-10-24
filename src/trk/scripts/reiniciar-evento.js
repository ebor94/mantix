/**
 * src/trk/scripts/reiniciar-evento.js
 * Deja el evento listo para cargar el CSV real: borra mascotas (incluidas las fusionadas), sus fotos
 * oficiales y todas las calificaciones (finales, detalle, borradores y rankings publicados).
 *
 * CONSERVA: categorías, rúbricas/criterios, roles, usuarios y PINs (trk_accesos), trk_auditoria,
 * trk_importaciones (historial) y trk_migraciones.
 * REINICIA: trk_evento_estado (nadie en pasarela, modo PASARELA, sin categoría en pantalla) y
 * trk_categorias (ranking_publicado = 0, abierta = 1).
 *
 * Uso: npm run trk:reiniciar               → solo muestra lo que se borraría (sale con código 1)
 *      npm run trk:reiniciar -- --confirmar → borra
 * Usa la misma configuración DB_* que setup.js / migrador.js.
 */
const fs = require('fs');
const path = require('path');
const { dirFotos: dirFotosPorDefecto } = require('../services/fotos.service');

const CONTEOS = [
  ['trk_participantes', 'SELECT COUNT(*) AS n FROM trk_participantes'],
  ['trk_participantes (fusionados)', 'SELECT COUNT(*) AS n FROM trk_participantes WHERE fusionado_en_id IS NOT NULL'],
  ['trk_calificaciones', 'SELECT COUNT(*) AS n FROM trk_calificaciones'],
  ['trk_calificacion_detalle', 'SELECT COUNT(*) AS n FROM trk_calificacion_detalle'],
  ['trk_borradores', 'SELECT COUNT(*) AS n FROM trk_borradores'],
  ['trk_ranking_snapshots', 'SELECT COUNT(*) AS n FROM trk_ranking_snapshots'],
  ['trk_categorias con ranking publicado', 'SELECT COUNT(*) AS n FROM trk_categorias WHERE ranking_publicado = 1'],
  ['trk_categorias cerradas', 'SELECT COUNT(*) AS n FROM trk_categorias WHERE abierta = 0']
];

// Solo archivos regulares directamente dentro del directorio de fotos; nunca el directorio ni subcarpetas.
function archivosDeFotos(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
}

async function contar(conn) {
  const salida = {};
  for (const [etiqueta, sql] of CONTEOS) {
    const [[fila]] = await conn.query(sql);
    salida[etiqueta] = Number(fila.n);
  }
  return salida;
}

/**
 * @param conn conexión mysql2/promise
 * @param {{ confirmar?: boolean, dirFotos?: string, log?: Function }} opciones
 * @returns {{ confirmado: boolean, conteos: object, fotos: number, fotosBorradas?: number, erroresFotos?: string[] }}
 */
async function reiniciarEvento(conn, { confirmar = false, dirFotos = dirFotosPorDefecto(), log = () => {} } = {}) {
  const conteos = await contar(conn);
  const fotos = archivosDeFotos(dirFotos);
  log(`Directorio de fotos: ${dirFotos}`);
  for (const [etiqueta, n] of Object.entries(conteos)) log(`  ${etiqueta}: ${n}`);
  log(`  archivos de fotos: ${fotos.length}`);
  if (!confirmar) return { confirmado: false, conteos, fotos: fotos.length };

  await conn.beginTransaction();
  try {
    // Orden de FKs: el evento deja de apuntar a participantes/categorías; luego hijos antes que padres.
    await conn.query("UPDATE trk_evento_estado SET participante_en_pasarela_id = NULL, modo_pantalla = 'PASARELA', categoria_pantalla_id = NULL");
    await conn.query('DELETE FROM trk_borradores');
    await conn.query('DELETE FROM trk_calificacion_detalle');
    await conn.query('DELETE FROM trk_calificaciones');
    await conn.query('DELETE FROM trk_ranking_snapshots');
    await conn.query('UPDATE trk_participantes SET fusionado_en_id = NULL WHERE fusionado_en_id IS NOT NULL');
    await conn.query('DELETE FROM trk_participantes');
    await conn.query('UPDATE trk_categorias SET ranking_publicado = 0, abierta = 1');
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  }

  // Tras el commit: los archivos ya no los referencia nadie. Un fallo aquí no deshace la BD.
  let fotosBorradas = 0;
  const erroresFotos = [];
  for (const archivo of fotos) {
    try {
      fs.unlinkSync(archivo);
      fotosBorradas += 1;
    } catch (e) {
      erroresFotos.push(`${path.basename(archivo)}: ${e.message}`);
    }
  }
  return { confirmado: true, conteos, fotos: fotos.length, fotosBorradas, erroresFotos };
}

if (require.main === module) {
  require('dotenv').config();
  const mysql = require('mysql2/promise');
  const confirmar = process.argv.includes('--confirmar');
  (async () => {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true,
      charset: 'utf8mb4'
    });
    console.log(`Conectado a ${process.env.DB_HOST}/${process.env.DB_NAME}`);
    try {
      console.log(confirmar ? 'Se borrará:' : 'Se borraría (simulación, nada cambia):');
      const r = await reiniciarEvento(conn, { confirmar, log: (m) => console.log(m) });
      if (!r.confirmado) {
        console.log('\nNo se borró nada. Para ejecutar: npm run trk:reiniciar -- --confirmar');
        process.exitCode = 1;
        return;
      }
      console.log(`\n✔ Evento reiniciado: ${r.conteos.trk_participantes} participante(s), ${r.conteos.trk_calificaciones} calificación(es), `
        + `${r.conteos.trk_borradores} borrador(es), ${r.conteos.trk_ranking_snapshots} ranking(s) publicado(s), ${r.fotosBorradas}/${r.fotos} foto(s).`);
      console.log('  Conservados: categorías, rúbricas, usuarios/roles/PINs, auditoría, importaciones y migraciones.');
      if (r.erroresFotos.length) {
        console.error(`⚠ No se pudieron borrar ${r.erroresFotos.length} foto(s):\n  ${r.erroresFotos.join('\n  ')}`);
        process.exitCode = 2;
      }
    } catch (e) {
      console.error('❌ Falló el reinicio (la BD quedó como estaba):', e.message);
      process.exitCode = 1;
    } finally {
      await conn.end();
    }
  })();
}

module.exports = { reiniciarEvento, archivosDeFotos };
