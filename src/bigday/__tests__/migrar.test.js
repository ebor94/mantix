const path = require('node:path');
const { listarMigraciones, mensajeError, DIR_MIGRACIONES } = require('../scripts/migrar');

describe('listarMigraciones', () => {
  it('devuelve 001 y 002 en orden y excluye la 003 (manual)', () => {
    const lista = listarMigraciones();
    expect(lista.map((m) => m.nombre)).toEqual(['001_init.sql', '002_vista_superset.sql']);
    expect(lista.every((m) => path.isAbsolute(m.ruta) && m.ruta.startsWith(DIR_MIGRACIONES))).toBe(true);
  });
});

describe('mensajeError', () => {
  it('añade la pista de permisos solo en errores de acceso denegado', () => {
    for (const code of ['ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR']) {
      const l = mensajeError({ code, sqlMessage: 'denegado' });
      expect(l).toHaveLength(2);
      expect(l[1]).toMatch(/CREATE y CREATE VIEW/);
    }
  });
  it('no la añade en otros errores (conexión, sintaxis)', () => {
    expect(mensajeError({ code: 'ECONNREFUSED', message: 'no conecta' })).toEqual(['bigday: la migración falló (ECONNREFUSED): no conecta']);
    expect(mensajeError({ code: 'ER_PARSE_ERROR', sqlMessage: 'sintaxis' })).toHaveLength(1);
  });
});
