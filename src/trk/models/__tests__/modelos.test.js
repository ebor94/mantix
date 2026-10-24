const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const definirModelosTrk = require('..');

const sequelize = new Sequelize({ dialect: 'mysql', logging: false });
const Usuario = sequelize.define('Usuario', {}, { tableName: 'usuarios' });
const modelos = definirModelosTrk(sequelize, DataTypes);
Object.values(modelos).forEach((m) => m.associate && m.associate({ ...modelos, Usuario }));

const sqlMigraciones = fs.readdirSync(path.join(__dirname, '..', '..', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', f), 'utf8'))
  .join('\n');

test('todos los modelos se llaman Trk* y usan tabla trk_* con freezeTableName', () => {
  expect(Object.keys(modelos).sort()).toEqual([
    'TrkAcceso', 'TrkAuditoria', 'TrkBorrador', 'TrkCalificacion', 'TrkCalificacionDetalle', 'TrkCategoria', 'TrkCriterio',
    'TrkEventoEstado', 'TrkImportacion', 'TrkParticipante', 'TrkRankingSnapshot', 'TrkRubrica'
  ]);
  for (const m of Object.values(modelos)) {
    expect(m.options.tableName).toMatch(/^trk_/);
    expect(m.options.freezeTableName).toBe(true);
  }
});

test('toda tabla de modelo la crea una migración (el esquema no depende de sync)', () => {
  for (const m of Object.values(modelos)) {
    expect(sqlMigraciones).toContain(`CREATE TABLE ${m.options.tableName} (`);
  }
});

test('todo atributo existe como columna en la migración de su tabla', () => {
  for (const m of Object.values(modelos)) {
    const tabla = m.options.tableName;
    const inicio = sqlMigraciones.indexOf(`CREATE TABLE ${tabla} (`);
    const bloque = sqlMigraciones.slice(inicio, sqlMigraciones.indexOf(') ENGINE', inicio));
    for (const attr of Object.values(m.rawAttributes)) {
      // En el CREATE TABLE o añadida después con ALTER TABLE ... ADD COLUMN (p. ej. 009: trk_categorias.color).
      const presente = new RegExp(`\\n\\s+${attr.field} `).test(bloque)
        || new RegExp(`ALTER TABLE ${tabla} ADD COLUMN ${attr.field} `).test(sqlMigraciones);
      expect({ tabla, columna: attr.field, presente })
        .toEqual({ tabla, columna: attr.field, presente: true });
    }
  }
});

test('participante usa UUID y timestamps snake_case', () => {
  const p = modelos.TrkParticipante;
  expect(p.rawAttributes.id.type.key).toBe('UUID');
  expect(p.rawAttributes.created_at.field).toBe('created_at');
  expect(p.associations.categoria.foreignKey).toBe('categoria_id');
  expect(p.associations.categoriaPropuesta.foreignKey).toBe('categoria_propuesta_id');
});

test('sync() de los modelos TRK no toca la BD (lo usa el arranque de Mantix)', async () => {
  for (const m of Object.values(modelos)) await expect(m.sync({ alter: true })).resolves.toBe(m);
});

test('calificación pertenece a usuarios como jurado', () => {
  expect(modelos.TrkCalificacion.associations.jurado.target.options.tableName).toBe('usuarios');
  expect(modelos.TrkCalificacion.associations.detalles.foreignKey).toBe('calificacion_id');
});

test('v2.1: borrador pertenece a participante, jurado (usuarios) y criterio; puntaje admite null', () => {
  const b = modelos.TrkBorrador;
  expect(b.options.tableName).toBe('trk_borradores');
  expect(b.rawAttributes.puntaje.allowNull).toBe(true);
  expect(b.rawAttributes.created_at).toBeUndefined();
  expect(b.associations.participante.foreignKey).toBe('participante_id');
  expect(b.associations.jurado.target.options.tableName).toBe('usuarios');
  expect(b.associations.criterio.foreignKey).toBe('criterio_id');
});
