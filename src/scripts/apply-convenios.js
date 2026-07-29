#!/usr/bin/env node
/**
 * Migración: convenios empresariales parametrizables.
 *
 *   node src/scripts/apply-convenios.js                # aplica DDL + siembra convenios nuevos
 *   node src/scripts/apply-convenios.js --forzar-seed  # ADEMÁS pisa la config de los ya existentes
 *
 * Qué hace:
 *   1. CREATE TABLE convenios — un convenio es un formulario público parametrizado
 *      por datos (reglas de beneficiarios, defaults comerciales, marca, contacto).
 *   2. ALTER afiliados.origen: agrega el valor 'CONVENIO' al ENUM.
 *      Un ÚNICO valor para todos los convenios; el convenio concreto se
 *      identifica con convenioId, para no tener que hacer un ALTER por cada
 *      empresa nueva.
 *   3. ALTER afiliados: agrega convenioId + índice + FK.
 *   4. Siembra las empresas y los convenios de src/seeds/convenios/*.json.
 *
 * ⚠️ ORDEN DE DESPLIEGUE: este script va ANTES de subir el código. server.js
 *    corre sequelize.sync({ alter: false }), que crea tablas faltantes pero NO
 *    altera columnas existentes: si el modelo ya declara origen con 'CONVENIO'
 *    y la columna sigue siendo el ENUM viejo, los INSERT fallan por truncamiento.
 *
 * Idempotente: se puede correr varias veces. Por defecto NO pisa la
 * configuración de un convenio ya sembrado — una vez en producción, la base es
 * la fuente de verdad y las reglas se editan ahí (ese es justamente el punto de
 * parametrizarlas). Usar --forzar-seed solo si se quiere volver al archivo.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const IDEMPOTENT = new Set([
  'ER_DUP_FIELDNAME',
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_KEYNAME',
  'ER_FK_DUP_NAME',
  'ER_CANT_CREATE_TABLE',
  'ER_DUP_ENTRY'
]);

const DIR_SEEDS = path.resolve(__dirname, '../seeds/convenios');

const STATEMENTS = [
  // 1. Tabla de convenios
  `CREATE TABLE IF NOT EXISTS convenios (
     id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
     slug        VARCHAR(60)  NOT NULL COMMENT 'Identificador de la URL pública /afiliados/convenio/:slug',
     nombre      VARCHAR(200) NOT NULL,
     nit         VARCHAR(20)  NULL DEFAULT NULL,
     empresaId   INT UNSIGNED NULL DEFAULT NULL,
     canal       ENUM('EMPRESARIAL','INDIVIDUAL','CENS') NULL DEFAULT NULL,
     producto    ENUM('VERDE','INTEGRAL','CENS')         NULL DEFAULT NULL,
     grupo       ENUM('UNIPERSONAL','UNIFAMILIAR','BASICO','CENS_II','INDIVIDUAL','TRADICIONAL') NULL DEFAULT NULL,
     planNombre  VARCHAR(120) NULL DEFAULT NULL,
     reglas      JSON         NOT NULL COMMENT 'Reglas de beneficiarios evaluadas por src/rules/convenioRules.js',
     branding    JSON         NULL DEFAULT NULL,
     formulario  JSON         NULL DEFAULT NULL,
     contacto    JSON         NULL DEFAULT NULL COMMENT 'No exponer completo al público',
     activo      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0 = el endpoint público responde 404',
     createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     UNIQUE KEY uq_convenios_slug (slug),
     KEY idx_convenios_activo (activo),
     KEY idx_convenios_empresa (empresaId),
     CONSTRAINT fk_convenios_empresa FOREIGN KEY (empresaId)
       REFERENCES empresas(id) ON DELETE SET NULL
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // 2. Nuevo valor del ENUM origen (agregar al final no reescribe los existentes)
  `ALTER TABLE afiliados
     MODIFY COLUMN origen ENUM('ASESOR','VEOLIA','CONVENIO') NOT NULL DEFAULT 'ASESOR'
     COMMENT 'ASESOR = registrado por asesor; VEOLIA y CONVENIO = registro público sin sesión'`,

  // 3. FK del convenio en afiliados
  `ALTER TABLE afiliados
     ADD COLUMN convenioId INT UNSIGNED NULL DEFAULT NULL AFTER nombreEmpresa`,

  `CREATE INDEX idx_afiliados_convenio ON afiliados (convenioId)`,

  `ALTER TABLE afiliados
     ADD CONSTRAINT fk_afiliados_convenio FOREIGN KEY (convenioId)
     REFERENCES convenios(id) ON DELETE SET NULL`
];

/** Quita las claves de documentación (_comentario, _pendientes) antes de guardar. */
function limpiar(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(limpiar);
  const salida = {};
  for (const clave of Object.keys(obj)) {
    if (clave.charAt(0) === '_') continue;
    salida[clave] = limpiar(obj[clave]);
  }
  return salida;
}

function cargarSeeds() {
  if (!fs.existsSync(DIR_SEEDS)) return [];
  return fs.readdirSync(DIR_SEEDS)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const seed = JSON.parse(fs.readFileSync(path.join(DIR_SEEDS, f), 'utf8'));
      if (!seed.slug || !seed.reglas) {
        throw new Error(`El seed ${f} no tiene slug o reglas.`);
      }
      return seed;
    });
}

async function sembrarConvenio(conn, seed, forzar) {
  const s = limpiar(seed);

  // Empresa: se resuelve o se crea por NIT.
  let empresaId = null;
  if (s.nit) {
    await conn.query(
      'INSERT IGNORE INTO empresas (nit, nombre, activo, createdAt, updatedAt) VALUES (?, ?, 1, NOW(), NOW())',
      [s.nit, s.nombre]
    );
    const [filas] = await conn.query('SELECT id FROM empresas WHERE nit = ?', [s.nit]);
    empresaId = filas.length ? filas[0].id : null;
  }

  const [existente] = await conn.query('SELECT id FROM convenios WHERE slug = ?', [s.slug]);

  if (existente.length && !forzar) {
    console.log(`   ⚠️  "${s.slug}" ya existe — se conserva la configuración de la base (usar --forzar-seed para pisarla)`);
    return;
  }

  const valores = [
    s.nombre, s.nit || null, empresaId,
    s.canal || null, s.producto || null, s.grupo || null, s.planNombre || null,
    JSON.stringify(s.reglas),
    s.branding ? JSON.stringify(s.branding) : null,
    s.formulario ? JSON.stringify(s.formulario) : null,
    s.contacto ? JSON.stringify(s.contacto) : null,
    s.activo === undefined ? 1 : s.activo
  ];

  if (existente.length) {
    await conn.query(
      `UPDATE convenios SET nombre=?, nit=?, empresaId=?, canal=?, producto=?, grupo=?,
              planNombre=?, reglas=?, branding=?, formulario=?, contacto=?, activo=?
         WHERE slug=?`,
      valores.concat([s.slug])
    );
    console.log(`   ♻️  "${s.slug}" actualizado desde el seed`);
  } else {
    await conn.query(
      `INSERT INTO convenios
         (slug, nombre, nit, empresaId, canal, producto, grupo, planNombre,
          reglas, branding, formulario, contacto, activo, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, NOW(), NOW())`,
      [s.slug].concat(valores)
    );
    console.log(
      `   ✅ "${s.slug}" sembrado (${s.nombre})` +
      (Number(s.activo) === 0 ? ' — INACTIVO, activar con UPDATE cuando se valide' : '')
    );
  }
}

(async () => {
  const forzar = process.argv.includes('--forzar-seed');

  const seeds = cargarSeeds();
  console.log(`📄 Seeds encontrados: ${seeds.length ? seeds.map(s => s.slug).join(', ') : '(ninguno)'}\n`);

  console.log('🔌 Conectando a BD...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
  });
  console.log(`✅ Conectado a ${process.env.DB_HOST}/${process.env.DB_NAME}\n`);

  let ok = 0, omitidos = 0, fallos = 0;
  for (let i = 0; i < STATEMENTS.length; i++) {
    const stmt = STATEMENTS[i];
    const resumen = stmt.split('\n')[0].slice(0, 80).trim();
    try {
      await conn.query(stmt);
      console.log(`✅ [${i + 1}/${STATEMENTS.length}] ${resumen}...`);
      ok++;
    } catch (e) {
      if (IDEMPOTENT.has(e.code)) {
        console.log(`⚠️  [${i + 1}/${STATEMENTS.length}] ya existía: ${resumen}  (${e.code})`);
        omitidos++;
      } else {
        console.error(`❌ [${i + 1}/${STATEMENTS.length}] FALLÓ: ${resumen}`);
        console.error(`    ${e.code}: ${e.message}`);
        fallos++;
      }
    }
  }

  if (fallos === 0 && seeds.length) {
    console.log('\n🌱 Sembrando convenios:');
    for (const seed of seeds) {
      try {
        await sembrarConvenio(conn, seed, forzar);
      } catch (e) {
        console.error(`   ❌ "${seed.slug}": ${e.code || ''} ${e.message}`);
        fallos++;
      }
    }
  }

  console.log(`\n📊 ${ok} ejecutados · ${omitidos} ya existían · ${fallos} fallos`);

  // ── Verificación ─────────────────────────────────────────────────────────
  console.log('\n🔍 Verificación:');

  const [tabla] = await conn.query("SHOW TABLES LIKE 'convenios'");
  console.log(`   ${tabla.length ? '✅' : '❌'} tabla convenios`);

  const [col] = await conn.query("SHOW COLUMNS FROM afiliados LIKE 'convenioId'");
  console.log(`   ${col.length ? '✅' : '❌'} afiliados.convenioId`);

  const [enumOrigen] = await conn.query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'afiliados' AND COLUMN_NAME = 'origen'`,
    [process.env.DB_NAME]
  );
  const tieneConvenio = enumOrigen.length && String(enumOrigen[0].t).includes('CONVENIO');
  console.log(`   ${tieneConvenio ? '✅' : '❌'} afiliados.origen admite 'CONVENIO'  →  ${enumOrigen.length ? enumOrigen[0].t : '?'}`);

  if (tabla.length) {
    const [filas] = await conn.query(
      `SELECT slug, nombre, nit, activo, JSON_VALID(reglas) AS reglasOk,
              JSON_UNQUOTE(JSON_EXTRACT(reglas, '$.version')) AS version
         FROM convenios ORDER BY slug`
    );
    console.log(`\n🏢 Convenios en base (${filas.length}):`);
    filas.forEach(f => {
      console.log(
        `   ${f.reglasOk ? '✅' : '❌'} ${f.slug.padEnd(16)} ${String(f.nombre).padEnd(28)} ` +
        `NIT ${String(f.nit || '-').padEnd(12)} reglas v${f.version}  ` +
        (Number(f.activo) === 1 ? 'ACTIVO' : 'inactivo')
      );
    });
    const inactivos = filas.filter(f => Number(f.activo) === 0);
    if (inactivos.length) {
      console.log(
        `\n   ℹ️  Para publicar un convenio inactivo:\n` +
        `      UPDATE convenios SET activo = 1 WHERE slug = '${inactivos[0].slug}';`
      );
    }
  }

  // Ningún afiliado existente debe haber quedado tocado por esta migración.
  const [afectados] = await conn.query(
    "SELECT COUNT(*) AS n FROM afiliados WHERE origen = 'CONVENIO' OR convenioId IS NOT NULL"
  );
  console.log(`\n   ℹ️  Afiliados con origen CONVENIO: ${afectados[0].n} (esperado 0 en la primera corrida)`);

  await conn.end();
  process.exit(fallos > 0 ? 1 : 0);
})().catch(e => {
  console.error('💥 Error fatal:', e.message);
  process.exit(1);
});
