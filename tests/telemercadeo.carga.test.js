jest.mock('../src/sv/models', () => ({
  sequelize: { transaction: jest.fn() },
  SvArea: { findOne: jest.fn() },
  SvUsuario: { findAll: jest.fn(), findByPk: jest.fn() },
  SvEstado: { findAll: jest.fn(), findByPk: jest.fn() },
  SvFuente: { findAll: jest.fn() },
  SvPunto: { findAll: jest.fn() },
  SvProducto: { findAll: jest.fn() },
  SvPersona: { findOne: jest.fn(), create: jest.fn() },
  SvProspecto: { findOne: jest.fn(), create: jest.fn(), count: jest.fn() },
  SvProspectoProducto: { create: jest.fn() },
  SvGestion: { create: jest.fn() },
  SvLista: { findOne: jest.fn(), create: jest.fn() }
}));
jest.mock('../src/identity/models', () => ({ OrgIdentidad: { findAll: jest.fn() } }));

const { Op } = require('sequelize');
const M = require('../src/sv/models');
const { OrgIdentidad } = require('../src/identity/models');
const T = require('../src/sv/services/telemercadeo.traduccion');
const C = require('../src/sv/services/telemercadeo.carga');

const ASESORA = { ad: 'carmencontreras', usr_id: 50, nombre: 'Carmen Contreras', grupo_id: 1, area_id: 1 };
const ARCHIVO = '11. NOVIEMBRE 2026 TELEMERCADEO';
const NOMBRE_LISTA = `Telemercadeo carmencontreras — ${ARCHIVO}`;
const CATALOGOS = {
  estados: new Map([['INTERESADO', 13], ['CONTACTADO', 12], ['DESCARTADO', 16]]),
  fuentes: new Map([['LISTA_TELE', 21], ['REFERIDO', 22], ['ENCUESTA', 23], ['TITULO', 24], ['BASE_EXHUMACIONES', 25], ['OTROS', 26]]),
  puntos: new Map([['GC', 2], ['PARQUE', 3], ['SJ', 1]]),
  productos: new Map([
    ['PRE-OSR', { prod_id: 70, nombre: 'Osarios', precio: null }],
    ['PRE-CNZ', { prod_id: 71, nombre: 'Cenizarios', precio: null }],
    ['PRE-SCR-01', { prod_id: 72, nombre: 'Servicio exequial + cremación', precio: '5650000.00' }]
  ])
};
const fila = (extra = {}) => ({
  hoja: '28 DE NOVIEMBRE', fechaHoja: '2026-11-28', fila: 6, nombre: 'Ana Pérez',
  telefonoOriginal: '3001234567', telefonos: ['3001234567'], hora: 'venta', comentario: '24/11/2026 Se llama',
  producto: 'Osario y cenizario', interes: 'S', punto: 'REFERIDO', proxima: '2026-11-28', descarte: null, ...extra
});
const t = { commit: jest.fn(), rollback: jest.fn() };
const lista = { lista_id: 900, update: jest.fn() };
const correr = (filas, aplicar) => C.cargar({ filas, asesora: ASESORA, catalogos: CATALOGOS, archivo: ARCHIVO, hoy: '2026-11-27', aplicar });

beforeEach(() => {
  jest.resetAllMocks();
  M.sequelize.transaction.mockResolvedValue(t);
  M.SvLista.findOne.mockResolvedValue(null);
  M.SvLista.create.mockResolvedValue(lista);
  M.SvPersona.findOne.mockResolvedValue(null);
  M.SvPersona.create.mockResolvedValue({ persona_id: 300 });
  M.SvProspecto.findOne.mockResolvedValue(null);
  M.SvProspecto.create.mockResolvedValue({ prosp_id: 400 });
  M.SvProspecto.count.mockResolvedValue(1);
});

describe('resolverAsesora', () => {
  const usuario = (extra = {}) => ({ usr_id: 50, usr_nombre: 'Carmen', usr_apellido: 'Contreras', usr_area_id: 1, usr_grupo_id: 1, ...extra });
  beforeEach(() => { M.SvArea.findOne.mockResolvedValue({ area_id: 1 }); });

  it('la encuentra por su usuario de red', async () => {
    OrgIdentidad.findAll.mockResolvedValue([{ id_identidad: 7 }]);
    M.SvUsuario.findAll.mockResolvedValue([usuario()]);
    await expect(C.resolverAsesora('LOSOLIVOS\\CarmenContreras')).resolves.toEqual(ASESORA);
    expect(OrgIdentidad.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { ad_usuario: 'carmencontreras' } }));
    expect(M.SvUsuario.findAll).toHaveBeenCalledTimes(1);
    expect(M.SvUsuario.findAll.mock.calls[0][0].where).toEqual({ usr_activo: 1, usr_id_identidad: { [Op.in]: [7] } });
  });

  it('si no hay identidad con ese usuario, la busca por el correo', async () => {
    OrgIdentidad.findAll.mockResolvedValue([]);
    M.SvUsuario.findAll.mockResolvedValue([usuario()]);
    await expect(C.resolverAsesora('carmen_contreras')).resolves.toMatchObject({ usr_id: 50, ad: 'carmen_contreras' });
    expect(M.SvUsuario.findAll.mock.calls[0][0].where).toEqual({ usr_activo: 1, usr_email: { [Op.like]: 'carmen\\_contreras@%' } });
  });

  it.each([
    ['no existe', [], 'No hay un usuario activo'],
    ['es ambigua', [usuario(), usuario({ usr_id: 51 })], 'corresponde a 2 usuarios'],
    ['es de otra área', [usuario({ usr_area_id: 4 })], 'no es de Prenecesidad'],
    ['no tiene grupo', [usuario({ usr_grupo_id: null })], 'no tiene grupo']
  ])('se detiene si la asesora %s', async (_caso, usuarios, mensaje) => {
    OrgIdentidad.findAll.mockResolvedValue([{ id_identidad: 7 }]);
    M.SvUsuario.findAll.mockResolvedValue(usuarios);
    await expect(C.resolverAsesora('carmencontreras')).rejects.toThrow(mensaje);
  });

  it('se detiene si no existe el área PRENEC', async () => {
    M.SvArea.findOne.mockResolvedValue(null);
    await expect(C.resolverAsesora('carmencontreras')).rejects.toThrow('No existe el área PRENEC');
  });
});

describe('cargarCatalogos', () => {
  function completos() {
    M.SvEstado.findAll.mockResolvedValue([['INTERESADO', 13], ['CONTACTADO', 12], ['DESCARTADO', 16]]
      .map(([estado_codigo, estado_id]) => ({ estado_codigo, estado_id })));
    M.SvFuente.findAll.mockResolvedValue(T.CODIGOS_FUENTE.map((fuente_codigo, i) => ({ fuente_codigo, fuente_id: 21 + i })));
    M.SvPunto.findAll.mockResolvedValue(T.CODIGOS_PUNTO.map((punto_codigo, i) => ({ punto_codigo, punto_id: 1 + i })));
    M.SvProducto.findAll.mockResolvedValue(T.CODIGOS_PRODUCTO.map((prod_codigo, i) => ({
      prod_codigo, prod_id: 70 + i, prod_nombre: `Nombre ${prod_codigo}`,
      prod_es_generico: prod_codigo.endsWith('-01') ? 0 : 1,
      prod_precio_base: { 'PRE-SCR-01': '5650000.00', 'PRE-SOL-01': '0.00' }[prod_codigo] ?? null
    })));
  }

  it('arma los mapas y aplica la regla del precio ofrecido', async () => {
    completos();
    const cat = await C.cargarCatalogos(ASESORA);
    expect(cat.estados.get('INTERESADO')).toBe(13);
    expect(cat.fuentes.get('LISTA_TELE')).toBe(21);
    expect(cat.puntos.get('GC')).toBe(1);
    expect(cat.productos.get('PRE-SCR-01')).toEqual({ prod_id: 70, nombre: 'Nombre PRE-SCR-01', precio: '5650000.00' });
    expect(cat.productos.get('PRE-SOL-01').precio).toBeNull(); // con precio 0
    expect(cat.productos.get('PRE-OSR').precio).toBeNull(); // genérico
    expect(M.SvEstado.findAll.mock.calls[0][0].where).toEqual({ estado_grupo_id: 1, estado_codigo: { [Op.in]: T.CODIGOS_ESTADO }, estado_activo: 1 });
    expect(M.SvFuente.findAll.mock.calls[0][0].where).toEqual({ fuente_area_id: 1, fuente_codigo: { [Op.in]: T.CODIGOS_FUENTE }, fuente_activa: 1 });
    expect(M.SvPunto.findAll.mock.calls[0][0].where).toEqual({ punto_codigo: { [Op.in]: T.CODIGOS_PUNTO }, punto_activo: 1 });
    expect(M.SvProducto.findAll.mock.calls[0][0].where).toEqual({ prod_area_id: 1, prod_codigo: { [Op.in]: T.CODIGOS_PRODUCTO }, prod_activo: 1 });
  });

  it('se detiene y nombra lo que falta', async () => {
    completos();
    M.SvPunto.findAll.mockResolvedValue([{ punto_codigo: 'GC', punto_id: 1 }]);
    await expect(C.cargarCatalogos(ASESORA)).rejects.toThrow('Faltan en los catálogos de GenFlow: punto PARQUE, punto SJ.');
  });
});

describe('cargar', () => {
  it('en simulación consulta pero no escribe', async () => {
    const { resultados, avisos, lista: l } = await correr([fila()], false);
    expect(resultados).toEqual([expect.objectContaining({ resultado: 'se crearía', detalle: 'persona nueva' })]);
    expect(avisos).toEqual([]);
    expect(l).toBeNull();
    expect(M.SvLista.findOne).toHaveBeenCalledWith({ where: { lista_area_id: 1, lista_nombre: NOMBRE_LISTA, lista_activa: 1 } });
    for (const escritura of [M.SvLista.create, M.SvPersona.create, M.SvProspecto.create, M.SvProspectoProducto.create, M.SvGestion.create, M.sequelize.transaction]) {
      expect(escritura).not.toHaveBeenCalled();
    }
  });

  it('con aplicar crea lista, persona, prospecto, productos y gestión en una transacción', async () => {
    const { resultados } = await correr([fila({ telefonos: ['3001234567', '3109998877'] })], true);
    expect(resultados[0]).toMatchObject({ resultado: 'se crea', detalle: 'persona nueva' });
    expect(M.SvLista.create).toHaveBeenCalledWith({
      lista_area_id: 1, lista_grupo_id: 1, lista_fuente_id: 21, lista_cargada_por: 50,
      lista_nombre: NOMBRE_LISTA, lista_estado: 'procesando'
    });
    expect(M.SvPersona.create).toHaveBeenCalledWith({
      persona_nombre: 'Ana Pérez', persona_telefono_principal: '3001234567',
      persona_telefono_norm: '3001234567', persona_telefono_alterno: '3109998877'
    }, { transaction: t });
    expect(M.SvProspecto.create).toHaveBeenCalledWith({
      prosp_area_id: 1, prosp_grupo_id: 1, prosp_persona_id: 300, prosp_asesor_id: 50, prosp_estado_id: 13,
      prosp_fuente_id: 22, prosp_punto_id: null, prosp_lista_id: 900, prosp_prox_gestion_fecha: '2026-11-28',
      prosp_prioridad: 2, prosp_nota_inicial: 'Producto en el Excel: Osario y cenizario', prosp_activo: 1
    }, { transaction: t });
    expect(M.SvProspectoProducto.create.mock.calls).toEqual([
      [{ pp_prosp_id: 400, pp_prod_id: 70, pp_es_principal: 1, pp_precio_ofrecido: null }, { transaction: t }],
      [{ pp_prosp_id: 400, pp_prod_id: 71, pp_es_principal: 0, pp_precio_ofrecido: null }, { transaction: t }]
    ]);
    expect(M.SvGestion.create).toHaveBeenCalledWith({
      gest_prosp_id: 400, gest_asesor_id: 50, gest_estado_nuevo_id: 13, gest_canal: 'llamada',
      gest_comentario: `24/11/2026 Se llama\n\nCargado del Excel «${ARCHIVO}», hoja 28 DE NOVIEMBRE, fila 6.`,
      gest_fecha_hora: new Date('2026-11-24T12:00:00'), gest_prox_fecha: '2026-11-28'
    }, { transaction: t });
    expect(t.commit).toHaveBeenCalledTimes(1);
    expect(t.rollback).not.toHaveBeenCalled();
    expect(M.SvProspecto.count).toHaveBeenCalledWith({ where: { prosp_lista_id: 900, prosp_activo: 1 } });
    expect(lista.update).toHaveBeenCalledWith({
      lista_total_registros: 1, lista_importadas: 1, lista_duplicados_omit: 0, lista_errores: 0, lista_estado: 'completada',
      lista_log: expect.objectContaining({ leidos: 1, creados: 1, omitidos: 0, errores: 0, avisos: 0 })
    });
  });

  it('pone el precio vigente a los productos que lo tienen', async () => {
    await correr([fila({ producto: 'Servicio y cremacion' })], true);
    expect(M.SvProspectoProducto.create).toHaveBeenCalledWith(
      { pp_prosp_id: 400, pp_prod_id: 72, pp_es_principal: 1, pp_precio_ofrecido: '5650000.00' }, { transaction: t });
  });

  it('omite al cliente que ya tiene prospecto activo en Prenecesidad, sin tocarlo', async () => {
    M.SvPersona.findOne.mockResolvedValue({ persona_id: 301 });
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 401, prosp_lista_id: 12, prosp_asesor_id: 60, prosp_estado_id: 13 });
    M.SvUsuario.findByPk.mockResolvedValue({ usr_nombre: 'Ana', usr_apellido: 'Ruiz' });
    M.SvEstado.findByPk.mockResolvedValue({ estado_nombre: 'Interesado' });
    const { resultados } = await correr([fila()], true);
    expect(resultados[0]).toMatchObject({ resultado: 'omitido', detalle: 'ya tiene prospecto activo en Prenecesidad (Ana Ruiz, Interesado)' });
    expect(M.SvProspecto.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { prosp_persona_id: 301, prosp_area_id: 1, prosp_activo: 1 } }));
    expect(M.SvProspecto.create).not.toHaveBeenCalled();
    expect(M.sequelize.transaction).not.toHaveBeenCalled();
    expect(lista.update).toHaveBeenCalledWith(expect.objectContaining({ lista_duplicados_omit: 1 }));
  });

  it('al volver a correr el libro reutiliza la lista y no duplica', async () => {
    M.SvLista.findOne.mockResolvedValue(lista);
    M.SvPersona.findOne.mockResolvedValue({ persona_id: 301 });
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 401, prosp_lista_id: 900, prosp_asesor_id: 50, prosp_estado_id: 13 });
    const { resultados } = await correr([fila()], true);
    expect(resultados[0]).toMatchObject({ resultado: 'omitido', detalle: 'ya cargado por esta lista' });
    expect(M.SvLista.create).not.toHaveBeenCalled();
    expect(lista.update).toHaveBeenCalledTimes(1);
  });

  it('reutiliza la persona que ya existe sin cambiarle datos', async () => {
    M.SvPersona.findOne.mockResolvedValue({ persona_id: 301, persona_nombre: 'Ana', persona_apellido: 'Pérez' });
    const { resultados } = await correr([fila()], true);
    expect(resultados[0]).toMatchObject({ resultado: 'se crea', detalle: 'persona existente: Ana Pérez' });
    expect(M.SvPersona.create).not.toHaveBeenCalled();
    expect(M.SvProspecto.create.mock.calls[0][0].prosp_persona_id).toBe(301);
  });

  it('si la persona existente tiene otro nombre, lo dice y deja el nombre del Excel en la gestión', async () => {
    M.SvPersona.findOne.mockResolvedValue({ persona_id: 301, persona_nombre: 'Juan', persona_apellido: 'López' });
    const { resultados } = await correr([fila()], true);
    expect(resultados[0]).toMatchObject({ resultado: 'se crea', detalle: 'persona existente: Juan López' });
    expect(M.SvPersona.findOne).toHaveBeenCalledWith(expect.objectContaining({ attributes: ['persona_id', 'persona_nombre', 'persona_apellido'] }));
    const comentario = M.SvGestion.create.mock.calls[0][0].gest_comentario;
    expect(comentario.endsWith('\nNombre en el Excel: Ana Pérez')).toBe(true);
    expect(resultados[0].plan.gestion.comentario).toBe(comentario);
  });

  it('si el nombre es el mismo con otras tildes y mayúsculas, no agrega la línea', async () => {
    M.SvPersona.findOne.mockResolvedValue({ persona_id: 301, persona_nombre: 'ana perez', persona_apellido: null });
    const { resultados } = await correr([fila()], true);
    expect(resultados[0]).toMatchObject({ resultado: 'se crea', detalle: 'persona existente: ana perez' });
    expect(M.SvGestion.create.mock.calls[0][0].gest_comentario).not.toContain('Nombre en el Excel');
  });

  it('en simulación con persona existente también muestra el nombre de GenFlow', async () => {
    M.SvPersona.findOne.mockResolvedValue({ persona_id: 301, persona_nombre: 'Juan', persona_apellido: 'López' });
    const { resultados } = await correr([fila()], false);
    expect(resultados[0]).toMatchObject({ resultado: 'se crearía', detalle: 'persona existente: Juan López' });
  });

  it('si un cliente falla, se deshace solo ese y la carga sigue', async () => {
    M.SvProspecto.create.mockReset();
    M.SvProspecto.create.mockRejectedValueOnce(new Error('Data too long')).mockResolvedValueOnce({ prosp_id: 402 });
    const { resultados } = await correr([fila(), fila({ fila: 7, telefonos: ['3109998877'] })], true);
    expect(resultados.map((r) => [r.resultado, r.detalle])).toEqual([['error', 'Data too long'], ['se crea', 'persona nueva']]);
    expect(t.rollback).toHaveBeenCalledTimes(1);
    expect(t.commit).toHaveBeenCalledTimes(1);
    expect(lista.update).toHaveBeenCalledWith(expect.objectContaining({ lista_total_registros: 2, lista_errores: 1 }));
  });

  it('las filas descartadas al leer pasan tal cual, sin consultar la base', async () => {
    const descartada = fila({ telefonos: [], descarte: { resultado: 'error', detalle: 'teléfono inválido' } });
    const { resultados } = await correr([descartada], false);
    expect(resultados).toEqual([{ fila: descartada, plan: null, resultado: 'error', detalle: 'teléfono inválido' }]);
    expect(M.SvPersona.findOne).not.toHaveBeenCalled();
  });

  it('junta los avisos de la traducción con su hoja y su fila', async () => {
    const { avisos } = await correr([fila({ punto: '', producto: 'Mantenimiento' })], false);
    expect(avisos).toEqual([
      { hoja: '28 DE NOVIEMBRE', fila: 6, tipo: 'aviso', mensaje: 'sin punto de atención' },
      { hoja: '28 DE NOVIEMBRE', fila: 6, tipo: 'aviso', mensaje: 'producto no reconocido: Mantenimiento' }
    ]);
  });
});

describe('nombreLista', () => {
  it('recorta a 150 caracteres', () => {
    expect(C.nombreLista('carmencontreras', 'x'.repeat(200))).toHaveLength(150);
  });
});
