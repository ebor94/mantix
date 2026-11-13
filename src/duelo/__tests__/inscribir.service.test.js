const { crearServicioInscripcion } = require('../services/inscribir.service');
const DueloError = require('../utils/DueloError');
const { EVENTO } = require('../dominio/evento');

const CONFIG = { abiertas: true, versionPolitica: 'borrador', contacto: '300 000 0000', correo: { canal: 'ninguno' } };
const cuerpo = (extra = {}) => ({
  nombre_completo: 'Ana Pérez', cedula: '1090000001', celular: '3001234567', correo: 'ana@correo.com',
  honra_companero: 'no', acepta_politica: 'true', version_politica: 'borrador', companeros: '[]', ...extra,
});
const conCompaneros = (nombres) => cuerpo({
  honra_companero: 'si', companeros: JSON.stringify(nombres.map((nombre) => ({ nombre }))),
});

function armar(extra = {}) {
  let n = 0;
  const deps = {
    repo: {
      existeCedula: jest.fn(async () => false),
      crear: jest.fn(async () => 7),
      marcarCorreo: jest.fn(async () => {}),
    },
    fotos: {
      procesar: jest.fn(async (b) => b),
      guardar: jest.fn(async (b) => ({ nombre: `foto-${++n}.jpg`, bytes: b.length })),
      borrar: jest.fn(async () => {}),
    },
    obtenerConfig: () => CONFIG,
    notificar: jest.fn(async () => ({ enviado: true, error: null })),
    ...extra,
  };
  return { deps, servicio: crearServicioInscripcion(deps) };
}

test('rama No: guarda sin tocar fotos', async () => {
  const { deps, servicio } = armar();
  const r = await servicio.inscribir({ cuerpo: cuerpo(), archivos: {}, ip: '1.2.3.4', userAgent: 'ua' });
  expect(r.id).toBe(7);
  expect(deps.fotos.procesar).not.toHaveBeenCalled();
  expect(deps.repo.crear).toHaveBeenCalledWith(
    expect.objectContaining({ cedula: '1090000001', honra_companero: false, ip: '1.2.3.4', user_agent: 'ua' }), [],
  );
});

test('rama Sí: procesa, guarda y registra cada foto', async () => {
  const { deps, servicio } = armar();
  await servicio.inscribir({
    cuerpo: conCompaneros(['Luna', 'Max']), archivos: { 1: Buffer.from('a'), 2: Buffer.from('bb') }, ip: null, userAgent: null,
  });
  expect(deps.repo.crear.mock.calls[0][1]).toEqual([
    { orden: 1, nombre: 'Luna', foto_ruta: 'foto-1.jpg', foto_mime: 'image/jpeg', foto_bytes: 1 },
    { orden: 2, nombre: 'Max', foto_ruta: 'foto-2.jpg', foto_mime: 'image/jpeg', foto_bytes: 2 },
  ]);
});

test('inscripciones cerradas', async () => {
  const { servicio } = armar({ obtenerConfig: () => ({ ...CONFIG, abiertas: false }) });
  await expect(servicio.inscribir({ cuerpo: cuerpo(), archivos: {} }))
    .rejects.toMatchObject({ statusCode: 403, motivo: 'CERRADAS' });
});

test('datos inválidos: 422 con errores por campo y sin escribir nada', async () => {
  const { deps, servicio } = armar();
  await expect(servicio.inscribir({ cuerpo: cuerpo({ cedula: 'abc' }), archivos: {} }))
    .rejects.toMatchObject({ statusCode: 422, motivo: 'VALIDACION', errores: { cedula: expect.any(String) } });
  expect(deps.repo.crear).not.toHaveBeenCalled();
});

test('cédula ya inscrita: 409 con el contacto y sin procesar fotos', async () => {
  const { deps, servicio } = armar();
  deps.repo.existeCedula.mockResolvedValue(true);
  await expect(servicio.inscribir({ cuerpo: conCompaneros(['Luna']), archivos: { 1: Buffer.from('a') } }))
    .rejects.toMatchObject({ statusCode: 409, motivo: 'CEDULA_DUPLICADA', message: expect.stringContaining('300 000 0000') });
  expect(deps.fotos.procesar).not.toHaveBeenCalled();
});

test('foto ilegible: 422 en el campo de esa foto y borra las ya guardadas', async () => {
  const { deps, servicio } = armar();
  deps.fotos.procesar
    .mockResolvedValueOnce(Buffer.from('a'))
    .mockRejectedValueOnce(new DueloError(422, 'FOTO_INVALIDA', 'No pudimos leer esta foto.'));
  await expect(servicio.inscribir({
    cuerpo: conCompaneros(['Luna', 'Max']), archivos: { 1: Buffer.from('a'), 2: Buffer.from('b') },
  })).rejects.toMatchObject({ statusCode: 422, errores: { companero_2_foto: 'No pudimos leer esta foto.' } });
  expect(deps.fotos.borrar).toHaveBeenCalledWith(['foto-1.jpg']);
  expect(deps.repo.crear).not.toHaveBeenCalled();
});

test('si el repositorio falla por duplicado simultáneo, borra las fotos y responde 409', async () => {
  const { deps, servicio } = armar();
  deps.repo.crear.mockRejectedValue(new DueloError(409, 'CEDULA_DUPLICADA', 'x'));
  await expect(servicio.inscribir({ cuerpo: conCompaneros(['Luna']), archivos: { 1: Buffer.from('a') } }))
    .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('300 000 0000') });
  expect(deps.fotos.borrar).toHaveBeenCalledWith(['foto-1.jpg']);
});

test('notificarInscripcion envía solo lo necesario y guarda el resultado', async () => {
  const { deps, servicio } = armar();
  const { id, datos } = await servicio.inscribir({
    cuerpo: conCompaneros(['Luna']), archivos: { 1: Buffer.from('a') },
  });
  await servicio.notificarInscripcion(id, datos);
  expect(deps.notificar).toHaveBeenCalledWith(CONFIG.correo, {
    nombre: 'Ana Pérez', correo: 'ana@correo.com', companeros: ['Luna'], evento: EVENTO,
  });
  expect(deps.repo.marcarCorreo).toHaveBeenCalledWith(7, true, null);
});

test('error interno al procesar una foto no se disfraza de 422: se propaga igual y borra lo guardado', async () => {
  const { deps, servicio } = armar();
  const interno = new Error('ENOMEM interno');
  deps.fotos.procesar
    .mockResolvedValueOnce(Buffer.from('a'))
    .mockRejectedValueOnce(interno);
  const resultado = servicio.inscribir({
    cuerpo: conCompaneros(['Luna', 'Max']), archivos: { 1: Buffer.from('a'), 2: Buffer.from('b') },
  });
  await expect(resultado).rejects.toBe(interno);
  await expect(resultado).rejects.not.toBeInstanceOf(DueloError);
  expect(deps.repo.crear).not.toHaveBeenCalled();
  expect(deps.fotos.borrar).toHaveBeenCalledWith(['foto-1.jpg']);
});

test('si borrar falla durante la limpieza, no enmascara el 409 original', async () => {
  const { deps, servicio } = armar();
  deps.repo.crear.mockRejectedValue(new DueloError(409, 'CEDULA_DUPLICADA', 'x'));
  deps.fotos.borrar.mockRejectedValue(new Error('disco lleno'));
  await expect(servicio.inscribir({ cuerpo: conCompaneros(['Luna']), archivos: { 1: Buffer.from('a') } }))
    .rejects.toMatchObject({ statusCode: 409, motivo: 'CEDULA_DUPLICADA', message: expect.stringContaining('300 000 0000') });
  expect(deps.fotos.borrar).toHaveBeenCalledWith(['foto-1.jpg']);
});
