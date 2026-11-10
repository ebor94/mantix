const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar } = require('../testing/fabricas');
const { crearXlsx, fila } = require('../testing/xlsx');
const { crearServicioBeneficiarios } = require('../services/beneficiarios.service');

let conn;
let bd;
let servicio;
beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  servicio = crearServicioBeneficiarios({ bd });
});
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(() => limpiar(conn));

const LISTADO = [
  fila(1, 'EDWIN BRANDON ORTEGA RAMIREZ', 'Coordinador TIC', '3152884079', 'eortega@losolivos.co'),
  fila(2, 'ANA MARIA PEREZ', 'Asesora comercial', '3001234567', 'coordcomercialcucuta@losolivos.co'),
  fila(3, 'LUIS GOMEZ', 'Asesor comercial', '3001234568', 'coordcomercialcucuta@losolivos.co'), // buzón compartido
  fila(4, 'MARTA DIAZ', 'Guía', '6075551234', 'marta.diaz@gmail.com'), // fijo → sin celular
  fila(5, 'JOSE ALVAREZ', 'Guía', '3001234569', ''),
];
const todos = async () => (await conn.query('SELECT nombre, cargo, celular, correo, ad_usuario, activo, updated_by FROM msj_beneficiarios ORDER BY id'))[0];

test('importa el listado: crea, normaliza y deja ad_usuario sin vincular', async () => {
  const r = await servicio.importar({ buffer: await crearXlsx({ filas: LISTADO }), actor: 'admin1' });
  expect(r).toEqual({
    aplicado: true, creados: 5, actualizados: 0, sinCambios: 0, errores: [], advertencias: [{ fila: 6, motivo: 'CELULAR_INVALIDO' }],
  });
  const filas = await todos();
  expect(filas[0]).toEqual({
    nombre: 'Edwin Brandon Ortega Ramirez', cargo: 'Coordinador TIC', celular: '573152884079', correo: 'eortega@losolivos.co',
    ad_usuario: null, activo: 1, updated_by: 'admin1',
  });
  expect(filas[3]).toMatchObject({ nombre: 'Marta Diaz', celular: null });
});

test('reimportar el mismo archivo no duplica', async () => {
  const buffer = await crearXlsx({ filas: LISTADO });
  await servicio.importar({ buffer, actor: 'admin1' });
  const r = await servicio.importar({ buffer, actor: 'admin2' });
  expect(r).toMatchObject({ aplicado: true, creados: 0, actualizados: 0, sinCambios: 5 });
  expect(await todos()).toHaveLength(5);
  expect((await todos())[0].updated_by).toBe('admin1'); // sin cambios: no se toca
});

test('reimportar con cambios actualiza cargo y correo (match por nombre + celular, sin importar tildes ni mayúsculas)', async () => {
  await servicio.importar({ buffer: await crearXlsx({ filas: LISTADO }), actor: 'admin1' });
  const cambiado = [fila(1, 'Edwin Brandón Ortega Ramírez', 'Jefe TIC', '315 288 4079', 'edwin.ortega@losolivos.co'), ...LISTADO.slice(1)];
  const r = await servicio.importar({ buffer: await crearXlsx({ filas: cambiado }), actor: 'admin2' });
  expect(r).toMatchObject({ creados: 0, actualizados: 1, sinCambios: 4 });
  expect((await todos())[0]).toMatchObject({ nombre: 'Edwin Brandón Ortega Ramírez', cargo: 'Jefe TIC', correo: 'edwin.ortega@losolivos.co', updated_by: 'admin2' });
});

test('no toca la vinculación AD ni la baja lógica que hizo el admin', async () => {
  await servicio.importar({ buffer: await crearXlsx({ filas: LISTADO }), actor: 'admin1' });
  await conn.execute("UPDATE msj_beneficiarios SET ad_usuario = 'eortega', activo = 0 WHERE celular = '573152884079'");
  const cambiado = [fila(1, 'EDWIN BRANDON ORTEGA RAMIREZ', 'Jefe TIC', '3152884079', 'eortega@losolivos.co'), ...LISTADO.slice(1)];
  await servicio.importar({ buffer: await crearXlsx({ filas: cambiado }), actor: 'admin2' });
  expect((await todos())[0]).toMatchObject({ cargo: 'Jefe TIC', ad_usuario: 'eortega', activo: 0 });
});

test('una fila con error bloquea toda la importación: no queda nada a medias', async () => {
  const conError = [...LISTADO.slice(0, 2), fila(3, 'X'.repeat(151), 'Guía', '3001112222', ''), ...LISTADO.slice(2)];
  const r = await servicio.importar({ buffer: await crearXlsx({ filas: conError }), actor: 'admin1' });
  expect(r).toMatchObject({ aplicado: false, creados: 0, actualizados: 0, errores: [{ fila: 5, motivo: 'NOMBRE_MUY_LARGO' }] });
  expect(await todos()).toEqual([]);
});

test('simular: calcula el resumen sin escribir nada', async () => {
  const r = await servicio.importar({ buffer: await crearXlsx({ filas: LISTADO }), actor: 'admin1', simular: true });
  expect(r).toMatchObject({ aplicado: false, creados: 5, actualizados: 0 });
  expect(await todos()).toEqual([]);
});

test('un fallo de la BD a mitad de la importación revierte todo', async () => {
  // Ya existe alguien con el ad_usuario que no se toca; forzamos un fallo con un nombre que la BD rechaza.
  const bdQueFalla = {
    obtener: () => {
      const pool = bd.obtener();
      return {
        getConnection: async () => {
          const c = await pool.getConnection();
          let inserts = 0;
          const execute = c.execute.bind(c);
          c.execute = async (sql, params) => {
            if (/^INSERT INTO msj_beneficiarios/.test(sql) && ++inserts === 3) throw Object.assign(new Error('fallo simulado'), { code: 'ER_LOCK_DEADLOCK' });
            return execute(sql, params);
          };
          return c;
        },
      };
    },
  };
  const s = crearServicioBeneficiarios({ bd: bdQueFalla });
  await expect(s.importar({ buffer: await crearXlsx({ filas: LISTADO }), actor: 'admin1' })).rejects.toMatchObject({ code: 'ER_LOCK_DEADLOCK' });
  expect(await todos()).toEqual([]);
});

test('dos beneficiarios en la BD con el mismo nombre y celular → error, no se adivina cuál actualizar', async () => {
  for (let i = 0; i < 2; i++) {
    await conn.execute("INSERT INTO msj_beneficiarios (nombre, celular) VALUES ('Ana Maria Perez', '573001234567')");
  }
  const r = await servicio.importar({ buffer: await crearXlsx({ filas: LISTADO }), actor: 'admin1' });
  expect(r).toMatchObject({ aplicado: false, errores: [{ fila: 4, motivo: 'COINCIDE_CON_VARIOS' }] });
  expect(await todos()).toHaveLength(2);
});

test('exige actor (para la auditoría)', async () => {
  await expect(servicio.importar({ buffer: await crearXlsx({ filas: LISTADO }) })).rejects.toThrow('ACTOR_REQUERIDO');
});
