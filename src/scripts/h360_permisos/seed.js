/**
 * Fase 1 — Crea las tablas h360_* de permisos y carga el seed desde catalogo.json.
 *
 * Idempotente: puede correrse varias veces. Reconstruye h360_rol_permisos
 * desde cero en cada ejecución; h360_roles y h360_permisos se hacen upsert.
 *
 * Prefijo h360_ deliberado: la base ya tiene una tabla `roles` del core de
 * Mantix (afiliaciones/mantenimientos) con esquema distinto — no debe tocarse.
 *
 * Uso:  node src/scripts/h360_permisos/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') })
const db = require('../../h360/config/db')
const { catalogo } = require('./catalogo.json')

const ROLES = [
  { codigo: 'asesor',               nombre: 'Asesor de Homenajes',   ldap_group: 'Asesores_Funerarios' },
  { codigo: 'asistente',            nombre: 'Asistente Funerario',   ldap_group: 'Asistentes_Funerarios' },
  { codigo: 'tanatologo',           nombre: 'Tanatólogo',            ldap_group: 'Tanatologos_Turno' },
  { codigo: 'asistente_tanatologo', nombre: 'Asistente Tanatólogo',  ldap_group: null },
  { codigo: 'supervisora',          nombre: 'Supervisora Protocolo', ldap_group: 'Supervisoras_Protocolo' },
  { codigo: 'coordinador',          nombre: 'Coordinador Operativo', ldap_group: 'Coordinacion_Operativa' },
  { codigo: 'contabilidad',         nombre: 'Contabilidad',          ldap_group: 'Contabilidad_Homenajes' },
  { codigo: 'recepcion',            nombre: 'Recepción',             ldap_group: 'Recepcion_360' },
  { codigo: 'admin',                nombre: 'Administrador',         ldap_group: null },
]

const DDL = [
  `CREATE TABLE IF NOT EXISTS h360_roles (
     id         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     codigo     VARCHAR(40)  NOT NULL UNIQUE,
     nombre     VARCHAR(100) NOT NULL,
     ldap_group VARCHAR(150) NULL,
     activo     TINYINT(1)   NOT NULL DEFAULT 1,
     es_sistema TINYINT(1)   NOT NULL DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     INDEX idx_activo (activo)
   )`,
  `CREATE TABLE IF NOT EXISTS h360_permisos (
     id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     clave       VARCHAR(120) NOT NULL UNIQUE,
     modulo      VARCHAR(40)  NOT NULL,
     descripcion VARCHAR(255) NULL,
     activo      TINYINT(1)   NOT NULL DEFAULT 1,
     created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_modulo (modulo)
   )`,
  `CREATE TABLE IF NOT EXISTS h360_rol_permisos (
     rol_id     INT UNSIGNED NOT NULL,
     permiso_id INT UNSIGNED NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (rol_id, permiso_id),
     FOREIGN KEY (rol_id)     REFERENCES h360_roles(id)    ON DELETE CASCADE,
     FOREIGN KEY (permiso_id) REFERENCES h360_permisos(id) ON DELETE CASCADE
   )`,
  `CREATE TABLE IF NOT EXISTS h360_permiso_auditoria (
     id         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
     rol_codigo VARCHAR(40)  NOT NULL,
     permiso    VARCHAR(120) NOT NULL,
     accion     ENUM('OTORGADO','REVOCADO') NOT NULL,
     usuario_id VARCHAR(50)  NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_rol (rol_codigo),
     INDEX idx_fecha (created_at)
   )`,
]

;(async () => {
  for (const ddl of DDL) await db.query(ddl)

  for (const r of ROLES)
    await db.query(
      `INSERT INTO h360_roles (codigo, nombre, ldap_group, es_sistema) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)`,
      [r.codigo, r.nombre, r.ldap_group, r.codigo === 'admin' ? 1 : 0])

  for (const p of catalogo)
    await db.query(
      `INSERT INTO h360_permisos (clave, modulo) VALUES (?,?)
       ON DUPLICATE KEY UPDATE modulo = VALUES(modulo)`,
      [p.clave, p.modulo])

  const [rr] = await db.query('SELECT id, codigo FROM h360_roles')
  const [pr] = await db.query('SELECT id, clave FROM h360_permisos')
  const rolId  = Object.fromEntries(rr.map(r => [r.codigo, r.id]))
  const permId = Object.fromEntries(pr.map(p => [p.clave, p.id]))

  await db.query('DELETE FROM h360_rol_permisos')
  let n = 0
  for (const p of catalogo)
    for (const rol of p.roles) {
      if (!rolId[rol]) { console.warn(`  rol desconocido en catálogo: ${rol}`); continue }
      await db.query('INSERT IGNORE INTO h360_rol_permisos (rol_id, permiso_id) VALUES (?,?)',
        [rolId[rol], permId[p.clave]])
      n++
    }

  console.log(`roles: ${ROLES.length} · permisos: ${catalogo.length} · asignaciones: ${n}\n`)
  const [chk] = await db.query(
    `SELECT r.codigo, COUNT(*) AS permisos FROM h360_rol_permisos rp
       JOIN h360_roles r ON r.id = rp.rol_id
      GROUP BY r.codigo ORDER BY permisos DESC`)
  chk.forEach(r => console.log(`  ${r.codigo.padEnd(22)} ${r.permisos}`))

  await db.end()
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
