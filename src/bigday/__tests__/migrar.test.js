const path = require('node:path');
const { listarMigraciones, DIR_MIGRACIONES } = require('../scripts/migrar');

describe('listarMigraciones', () => {
  it('devuelve 001 y 002 en orden y excluye la 003 (manual)', () => {
    const lista = listarMigraciones();
    expect(lista.map((m) => m.nombre)).toEqual(['001_init.sql', '002_vista_superset.sql']);
    expect(lista.every((m) => path.isAbsolute(m.ruta) && m.ruta.startsWith(DIR_MIGRACIONES))).toBe(true);
  });
});
