// Defensa en profundidad: para el empleado, la propia consulta ya excluye borradores y no lee datos de
// beneficiarios. El dominio vuelve a filtrar, pero la BD no debe entregar nada que luego haya que esconder.
const { crearServicioDisponibilidad } = require('../services/disponibilidad.service');
const { configDePrueba } = require('../testing/appPrueba');

function bdQueRegistra() {
  const sqls = [];
  const ejecutor = { execute: async (sql) => { sqls.push(sql.replace(/\s+/g, ' ')); return [[]]; } };
  return { sqls, bd: { obtener: () => ejecutor } };
}

const consultar = async (esAdmin) => {
  const { sqls, bd } = bdQueRegistra();
  await crearServicioDisponibilidad({ bd, obtenerConfig: configDePrueba, reloj: () => new Date('2026-11-20T13:00:00Z') })
    .consultar({ desde: '2026-11-23', hasta: '2026-11-27', esAdmin });
  return sqls;
};

test('empleado: la consulta de semanas solo trae publicadas', async () => {
  const semanas = (await consultar(false)).find((s) => s.includes('FROM msj_semanas'));
  expect(semanas).toMatch(/estado = 'publicada'/);
});

test('empleado: la consulta de citas no toca msj_beneficiarios ni pide beneficiario_id', async () => {
  const citas = (await consultar(false)).find((s) => s.includes('FROM msj_citas'));
  expect(citas).not.toMatch(/msj_beneficiarios|beneficiario_id|nombre/);
});

test('un esAdmin que no es exactamente true se trata como empleado', async () => {
  for (const valor of ['true', 1, {}]) {
    const sqls = await consultar(valor);
    expect(sqls.find((s) => s.includes('FROM msj_citas'))).not.toMatch(/msj_beneficiarios/);
  }
});

test('admin: ve todas las semanas y el nombre del beneficiario', async () => {
  const sqls = await consultar(true);
  expect(sqls.find((s) => s.includes('FROM msj_semanas'))).not.toMatch(/estado = 'publicada'/);
  expect(sqls.find((s) => s.includes('FROM msj_citas'))).toMatch(/JOIN msj_beneficiarios/);
});
