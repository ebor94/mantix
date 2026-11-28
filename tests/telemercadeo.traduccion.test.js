const T = require('../src/sv/services/telemercadeo.traduccion');

const ARCHIVO = '11. NOVIEMBRE 2026 TELEMERCADEO';
const fila = (extra = {}) => ({
  hoja: '28 DE NOVIEMBRE', fechaHoja: '2026-11-28', fila: 8, nombre: 'Ana Pérez',
  telefonoOriginal: '3001234567  -3109998877', telefonos: ['3001234567', '3109998877'], hora: 'venta',
  comentario: '24/11/2026 Se llama //13/11/2026 Se escribe', producto: 'Exhumacion y Osario',
  interes: 'S', punto: 'GRAN COLOMBIA', proxima: '2026-11-28', descarte: null, ...extra
});

describe('productosDeTexto', () => {
  // Los 18 textos reales del libro de Carmen y tres casos más.
  it.each([
    ['Columbario', ['PRE-CLM']],
    ['Prorroga', ['PRE-PRR']],
    ['Servicio e inhumacion  o cremacion', ['PRE-SCR-01', 'PRE-INL']],
    ['Servicio y cremacion', ['PRE-SCR-01']],
    ['Columbario  cenizario', ['PRE-CLM', 'PRE-CNZ']],
    ['2 Servicios y cremacion', ['PRE-SCR-01']],
    ['Exhumacion, Osario, cremacion y cenizario', ['PRE-EXL', 'PRE-OSR', 'PRE-CRR', 'PRE-CNZ']],
    ['Osario, cremacion y cenizario', ['PRE-OSR', 'PRE-CRT', 'PRE-CNZ']],
    ['Servicio, cremacion  y uso de lote en arrendamiento', ['PRE-SCR-01', 'PRE-UT']],
    ['Servicio e inhumacion', ['PRE-SOL-01', 'PRE-INL']],
    ['Exhumacion, Osario, cremacion, Prorroga', ['PRE-EXL', 'PRE-OSR', 'PRE-CRR', 'PRE-PRR']],
    ['Servicio, cremacion y Lote en arriendo', ['PRE-SCR-01', 'PRE-UT']],
    ['Exhumacion y Osario', ['PRE-EXL', 'PRE-OSR']],
    ['Osario', ['PRE-OSR']],
    ['Cenizario', ['PRE-CNZ']],
    ['Exhumacion, cremaicon', ['PRE-EXL', 'PRE-CRR']],
    ['Osario y Exhumacion', ['PRE-OSR', 'PRE-EXL']],
    ['Osairo', ['PRE-OSR']],
    ['Lote doble', ['PRE-LOT']],
    ['Mantenimiento', []],
    ['', []]
  ])('%p → %p', (texto, esperado) => expect(T.productosDeTexto(texto)).toEqual(esperado));
});

describe('estadoDe', () => {
  it.each([
    ['S', '2026-11-28', { codigo: 'INTERESADO', proxima: '2026-11-28', avisos: [] }],
    ['S', null, { codigo: 'INTERESADO', proxima: null, avisos: ['interesado sin próxima gestión'] }],
    ['N', null, { codigo: 'DESCARTADO', proxima: null, avisos: [] }],
    ['N', '2026-12-01', { codigo: 'CONTACTADO', proxima: '2026-12-01', avisos: [] }],
    ['', '2026-12-01', { codigo: 'CONTACTADO', proxima: '2026-12-01', avisos: [] }],
    ['SN', '2026-12-01', { codigo: 'CONTACTADO', proxima: '2026-12-01', avisos: ['marcado S y N a la vez'] }]
  ])('interés %p con próxima %p', (interes, proxima, esperado) => expect(T.estadoDe(interes, proxima)).toEqual(esperado));
});

describe('prioridadDe', () => {
  it.each([['venta', 2], ['VENTA', 2], ['venta, llamar tarde', 2], ['tiene a su padre delicado', 3], ['', 3]])(
    '%p → %p', (hora, esperado) => expect(T.prioridadDe(hora)).toBe(esperado)
  );
});

describe('fuenteYPunto', () => {
  const tele = (punto) => ({ fuente: 'LISTA_TELE', punto, aviso: null });
  const fuente = (codigo) => ({ fuente: codigo, punto: null, aviso: null });
  it.each([
    ['TELEMERCADEO', fuente('LISTA_TELE')],
    ['REFERIDO', fuente('REFERIDO')],
    ['ENCUESTA', fuente('ENCUESTA')],
    ['TITULO', fuente('TITULO')],
    ['BASE DE EXHUMACION', fuente('BASE_EXHUMACIONES')],
    ['OTRO', fuente('OTROS')],
    ['GRAN COLOMBIA', tele('GC')],
    ['PARQUE', tele('PARQUE')],
    ['San José', tele('SJ')],
    ['', { fuente: 'LISTA_TELE', punto: null, aviso: 'sin punto de atención' }],
    ['KIOSCO NORTE', { fuente: 'LISTA_TELE', punto: null, aviso: 'punto de atención no reconocido: KIOSCO NORTE' }]
  ])('%p', (texto, esperado) => expect(T.fuenteYPunto(texto)).toEqual(esperado));
});

describe('fechaGestion', () => {
  const HOY = '2026-11-27';
  it('toma la fecha más reciente del comentario', () => {
    expect(T.fechaGestion('24/11/2026 Se llama //13/11/2026 Se escribe', '2026-11-28', HOY)).toBe('2026-11-24');
  });
  it('ignora las fechas futuras del comentario', () => {
    expect(T.fechaGestion('vuelve el 05/12/2026 //20/11/2026 Se llama', '2026-11-28', HOY)).toBe('2026-11-20');
  });
  it('sin fecha en el comentario usa la de la hoja si no es futura', () => {
    expect(T.fechaGestion('Se llama', '2026-11-25', HOY)).toBe('2026-11-25');
  });
  it('si la hoja es futura usa el día de la carga', () => {
    expect(T.fechaGestion('Se llama', '2026-11-30', HOY)).toBe(HOY);
  });
});

describe('comentarioGestion', () => {
  const base = { archivo: ARCHIVO, hoja: '28 DE NOVIEMBRE', fila: 6 };
  const origen = `Cargado del Excel «${ARCHIVO}», hoja 28 DE NOVIEMBRE, fila 6.`;
  it('con "venta" en HORA no agrega la hora', () => {
    expect(T.comentarioGestion({ ...base, hora: 'venta', comentario: 'Se llama' })).toBe(`Se llama\n\n${origen}`);
  });
  it('con otro texto en HORA lo pone primero', () => {
    expect(T.comentarioGestion({ ...base, hora: 'tiene a su padre delicado', comentario: 'Se llama' }))
      .toBe(`HORA: tiene a su padre delicado\nSe llama\n\n${origen}`);
  });
  it('sin hora ni comentario queda solo la línea de origen', () => {
    expect(T.comentarioGestion({ ...base, hora: '', comentario: '' })).toBe(origen);
  });
});

describe('traducirFila', () => {
  it('arma el plan completo de una fila', () => {
    expect(T.traducirFila(fila(), { archivo: ARCHIVO, hoy: '2026-11-27' })).toEqual({
      persona: { nombre: 'Ana Pérez', telefono: '3001234567', alterno: '3109998877' },
      estado: 'INTERESADO',
      proxima: '2026-11-28',
      prioridad: 2,
      fuente: 'LISTA_TELE',
      punto: 'GC',
      productos: ['PRE-EXL', 'PRE-OSR'],
      notaInicial: 'Producto en el Excel: Exhumacion y Osario',
      gestion: {
        fecha: '2026-11-24',
        comentario: `24/11/2026 Se llama //13/11/2026 Se escribe\n\nCargado del Excel «${ARCHIVO}», hoja 28 DE NOVIEMBRE, fila 8.`
      },
      avisos: []
    });
  });

  it('junta los avisos y nombra al cliente sin nombre', () => {
    const plan = T.traducirFila(fila({ nombre: '', telefonos: ['3001234567'], producto: 'Mantenimiento', interes: 'SN', punto: 'XYZ' }),
      { archivo: ARCHIVO, hoy: '2026-11-27' });
    expect(plan.persona).toEqual({ nombre: '(sin nombre)', telefono: '3001234567', alterno: null });
    expect(plan.productos).toEqual([]);
    expect(plan.avisos).toEqual([
      'marcado S y N a la vez',
      'punto de atención no reconocido: XYZ',
      'producto no reconocido: Mantenimiento',
      'sin nombre'
    ]);
  });

  it('recorta el nombre a 100 caracteres y deja sin nota inicial si no hay producto', () => {
    const plan = T.traducirFila(fila({ nombre: 'A'.repeat(120), producto: '' }), { archivo: ARCHIVO, hoy: '2026-11-27' });
    expect(plan.persona.nombre).toHaveLength(100);
    expect(plan.notaInicial).toBeNull();
  });
});

describe('códigos de catálogo', () => {
  it('lista todo lo que usa la traducción', () => {
    expect(T.CODIGOS_ESTADO).toEqual(['INTERESADO', 'CONTACTADO', 'DESCARTADO']);
    expect(T.CODIGOS_FUENTE).toEqual(['LISTA_TELE', 'REFERIDO', 'ENCUESTA', 'TITULO', 'BASE_EXHUMACIONES', 'OTROS']);
    expect(T.CODIGOS_PUNTO).toEqual(['GC', 'PARQUE', 'SJ']);
    expect(T.CODIGOS_PRODUCTO).toEqual(['PRE-SCR-01', 'PRE-SOL-01', 'PRE-CRR', 'PRE-CRT', 'PRE-CLM', 'PRE-CNZ',
      'PRE-OSR', 'PRE-EXL', 'PRE-INL', 'PRE-PRR', 'PRE-UT', 'PRE-LOT']);
  });
});
