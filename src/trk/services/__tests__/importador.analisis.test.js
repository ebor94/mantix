const fs = require('fs');
const path = require('path');
const { analizarCsv } = require('../importador.service');

const csv = fs.readFileSync(path.join(__dirname, '..', '..', 'testing', 'fixtures', 'inscripciones-anonimizadas.csv'));
const { filas, resumen } = analizarCsv(csv);
const fila = (i) => filas[i];
const codigos = (i) => fila(i).advertencias.map((a) => a.codigo).sort();

test('lee todas las filas, mapeando columnas por nombre y no por posición', () => {
  expect(resumen.total).toBe(9);
  expect(fila(0).linea).toBe(2);
  expect(fila(0).datos).toMatchObject({
    responsable_nombre: 'Laura Gómez Ruiz', mascota_nombre: 'Canela', mascota_nombre_norm: 'canela',
    especie: 'PERRO', sexo: 'HEMBRA', categoria_codigo: 'PEQ_MED', autoriza_datos: true, autoriza_reglamento: true,
    fecha_inscripcion: '2026-10-05', disfraz_nombre: 'Bruja de Oz',
    foto_inscripcion_url: 'https://drive.google.com/open?id=FICTICIO1'
  });
});

test('documento con formato se normaliza a dígitos con advertencia', () => {
  expect(fila(0).datos.responsable_documento).toBe('1234567890');
  expect(codigos(0)).toEqual(['DOCUMENTO_NORMALIZADO']);
});

test('§13.10 "Perro(cupo lleno)" en "Gaticos." → texto extra + incoherencia con sugerencia por raza', () => {
  expect(fila(1).datos.especie).toBe('PERRO');
  expect(codigos(1)).toEqual(['ESPECIE_CATEGORIA_INCOHERENTE', 'ESPECIE_TEXTO_EXTRA']);
  expect(fila(1).advertencias.find((a) => a.codigo === 'ESPECIE_CATEGORIA_INCOHERENTE').sugerencia).toBe('PEQ_MED');
  expect(fila(1).datos.notas_importacion).toContain('Perro(cupo lleno)');
});

test('gato inscrito en perros pequeños → sugiere FELINOS', () => {
  const a = fila(2).advertencias.find((x) => x.codigo === 'ESPECIE_CATEGORIA_INCOHERENTE');
  expect(a.sugerencia).toBe('FELINOS');
});

test('perro grande en Gaticos → sugiere GRANDES', () => {
  const a = fila(8).advertencias.find((x) => x.codigo === 'ESPECIE_CATEGORIA_INCOHERENTE');
  expect(a.sugerencia).toBe('GRANDES');
});

test('misma mascota en dos categorías → grupo de posible duplicado, conserva la primera por defecto', () => {
  expect(fila(3).grupo_duplicado).toEqual(expect.any(String));
  expect(fila(4).grupo_duplicado).toBe(fila(3).grupo_duplicado);
  expect(fila(3).conservar_por_defecto).toBe(true);
  expect(fila(4).conservar_por_defecto).toBe(false);
  expect(codigos(4)).toContain('POSIBLE_DUPLICADO');
  expect(resumen.grupos_duplicados).toBe(1);
});

test('una fila con varias mascotas se marca para dividir', () => {
  expect(codigos(5)).toContain('VARIAS_MASCOTAS');
});

test('raza pequeña en Perros grandes', () => {
  expect(codigos(6)).toEqual(['RAZA_PEQUENA_EN_GRANDES']);
});

test('teléfono inválido', () => {
  expect(codigos(7)).toEqual(['TELEFONO_INVALIDO']);
  expect(fila(7).datos.responsable_telefono).toBe('302268158');
});

test('notas de columnas sin encabezado quedan visibles', () => {
  expect(codigos(8)).toContain('NOTA_IMPORTACION');
  expect(fila(8).datos.notas_importacion).toBe('confirmar si es uno o dos y categoría | validar en cual categoría ira');
  expect(fila(8).datos.autoriza_reglamento).toBe(false);
});

test('las advertencias no bloquean: ninguna fila del fixture tiene errores', () => {
  expect(filas.every((f) => f.errores.length === 0)).toBe(true);
  expect(resumen.con_errores).toBe(0);
});

test('categoría desconocida o sin mascota → error de fila', () => {
  const malo = Buffer.from('Nombre del responsable,Nombre de la mascota,Cateogoría de participación\nAna,,Gaticos.\nBeto,Rex,Conejos\n');
  const r = analizarCsv(malo);
  expect(r.filas[0].errores.map((e) => e.codigo)).toEqual(['MASCOTA_SIN_NOMBRE']);
  expect(r.filas[1].errores.map((e) => e.codigo)).toEqual(['CATEGORIA_DESCONOCIDA']);
});

test('archivo sin columnas obligatorias → 400', () => {
  expect(() => analizarCsv(Buffer.from('a,b\n1,2\n'))).toThrow(expect.objectContaining({ statusCode: 400, motivo: 'VALIDACION' }));
});

test('tolera BOM de Excel', () => {
  const r = analizarCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv]));
  expect(r.resumen.total).toBe(9);
});
