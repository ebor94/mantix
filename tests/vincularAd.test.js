const { proponerVinculos } = require('../src/identity/services/proponerVinculosAd');

const DIR = [
  { usuario: 'PSANTAFE', nombre: 'PATRICIA SANTAFE', mail: 'PSantafe@LosOlivos.co' },
  { usuario: 'jcortina', nombre: 'JORGE CORTINA',    mail: '' },
  { usuario: 'dup1',     nombre: 'DUPLICADO UNO',    mail: 'compartido@x.co' },
  { usuario: 'dup2',     nombre: 'DUPLICADO DOS',    mail: 'compartido@x.co' },
  { usuario: 'tomado',   nombre: 'YA TOMADO',        mail: 'tomado@x.co' }
];

test('segura: un solo candidato cuyo mail coincide (sin distinguir mayúsculas)', () => {
  const r = proponerVinculos([{ id_identidad: 1, email_norm: 'psantafe@losolivos.co' }], DIR);
  expect(r.seguras).toEqual([
    { id_identidad: 1, email: 'psantafe@losolivos.co', usuario: 'psantafe', nombreAd: 'PATRICIA SANTAFE' }
  ]);
  expect(r.revisar).toEqual([]);
  expect(r.sinCoincidencia).toEqual([]);
});

test('revisar: solo coincide el prefijo del correo con el usuario', () => {
  const r = proponerVinculos([{ id_identidad: 2, email_norm: 'jcortina@serfunorte.com' }], DIR);
  expect(r.seguras).toEqual([]);
  expect(r.revisar).toEqual([
    { id_identidad: 2, email: 'jcortina@serfunorte.com',
      candidatos: [{ usuario: 'jcortina', nombre: 'JORGE CORTINA', mail: '' }] }
  ]);
});

test('revisar: varias cuentas comparten el mismo mail', () => {
  const r = proponerVinculos([{ id_identidad: 3, email_norm: 'compartido@x.co' }], DIR);
  expect(r.seguras).toEqual([]);
  expect(r.revisar[0].candidatos.map(c => c.usuario)).toEqual(['dup1', 'dup2']);
});

test('sin coincidencia', () => {
  const r = proponerVinculos([{ id_identidad: 4, email_norm: 'nadie@x.co' }], DIR);
  expect(r.sinCoincidencia).toEqual([{ id_identidad: 4, email: 'nadie@x.co' }]);
});

test('las cuentas ya vinculadas a otra identidad no se proponen', () => {
  const r = proponerVinculos([{ id_identidad: 5, email_norm: 'tomado@x.co' }], DIR, new Set(['tomado']));
  expect(r.seguras).toEqual([]);
  expect(r.sinCoincidencia).toEqual([{ id_identidad: 5, email: 'tomado@x.co' }]);
});
