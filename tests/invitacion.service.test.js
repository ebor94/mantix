/**
 * Tests de src/services/invitacion.service.js — nómina de convenios e
 * invitaciones de autoafiliación (Task 3).
 *
 * Se mockea la capa de modelos (mismo patrón que tests/convenioService.test.js
 * y tests/afiliadoScope.test.js) para no necesitar base de datos, y los
 * servicios de envío (whatsappService/emailService) para no hacer llamadas
 * de red reales.
 *
 * NO se levanta el servidor ni se abre una conexión real a MySQL — todo el
 * archivo trabaja contra dobles de Sequelize.
 */

const mockConvenioEmpleado = {
  findAll: jest.fn(),
  bulkCreate: jest.fn(),
  update: jest.fn()
};
const mockConvenioInvitacion = {
  findOne: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
  update: jest.fn()
};

jest.mock('../src/models', () => ({
  ConvenioEmpleado: mockConvenioEmpleado,
  ConvenioInvitacion: mockConvenioInvitacion,
  Convenio: {}
}));

jest.mock('../src/services/whatsappService', () => ({
  sendInvitacion: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('../src/services/emailService', () => ({
  enviarNotificacion: jest.fn().mockResolvedValue(true)
}));

const whatsappService = require('../src/services/whatsappService');
const emailService = require('../src/services/emailService');
const invitacionService = require('../src/services/invitacion.service');
const { ENGINE_VERSION } = require('../src/rules/convenioRules');

beforeEach(() => {
  mockConvenioEmpleado.findAll.mockReset();
  mockConvenioEmpleado.bulkCreate.mockReset().mockResolvedValue([]);
  mockConvenioEmpleado.update.mockReset();
  mockConvenioInvitacion.findOne.mockReset();
  mockConvenioInvitacion.findByPk.mockReset();
  mockConvenioInvitacion.create.mockReset();
  mockConvenioInvitacion.update.mockReset();
  whatsappService.sendInvitacion.mockClear();
  emailService.enviarNotificacion.mockClear();
});

// ─────────────────────────────────────────────
// importarEmpleados
// ─────────────────────────────────────────────

describe('importarEmpleados', () => {
  const filaBase = {
    tipoDocumento: 'CC',
    primerNombre: 'Ana',
    primerApellido: 'Pérez',
    celular: '3001234567',
    email: 'ana@example.com',
    cargo: 'Auxiliar',
    unidadNegocio: 'Planta 1'
  };

  test('5 filas con 1 duplicado (mismo documento dos veces) y 1 fila sin documento', async () => {
    mockConvenioEmpleado.findAll.mockResolvedValue([]); // nada existe todavía

    const filas = [
      { ...filaBase, numeroDocumento: '111' },              // fila 1 — válida
      { ...filaBase, numeroDocumento: '222' },              // fila 2 — válida
      { ...filaBase, numeroDocumento: '111', celular: '3009999999' }, // fila 3 — duplica fila 1
      { ...filaBase, numeroDocumento: '' },                 // fila 4 — sin documento
      { ...filaBase, numeroDocumento: '333' }               // fila 5 — válida
    ];

    const resultado = await invitacionService.importarEmpleados(10, filas, { id: 1 });

    expect(resultado.creados).toBe(3);       // 111, 222, 333
    expect(resultado.actualizados).toBe(0);
    expect(resultado.ignorados).toBe(1);     // la fila 3, repetida de la fila 1
    expect(resultado.errores).toEqual([
      { fila: 4, motivo: 'El número de documento es obligatorio' }
    ]);

    // Se conserva la ÚLTIMA ocurrencia del documento duplicado (fila 3, no la 1)
    const [registros] = mockConvenioEmpleado.bulkCreate.mock.calls[0];
    const doc111 = registros.find(r => r.numeroDocumento === '111');
    expect(doc111.celular).toBe('3009999999');
    expect(registros).toHaveLength(3);
  });

  test('fila sin primer nombre y fila sin primer apellido también van a errores', async () => {
    mockConvenioEmpleado.findAll.mockResolvedValue([]);

    const filas = [
      { ...filaBase, numeroDocumento: '444', primerNombre: '' },
      { ...filaBase, numeroDocumento: '555', primerApellido: '   ' }
    ];

    const resultado = await invitacionService.importarEmpleados(10, filas);

    expect(resultado.creados).toBe(0);
    expect(resultado.errores).toEqual([
      { fila: 1, motivo: 'El primer nombre es obligatorio' },
      { fila: 2, motivo: 'El primer apellido es obligatorio' }
    ]);
  });

  // Regresión: tipoDocumento es ENUM NOT NULL en ConvenioEmpleado — una fila
  // con valor vacío o inválido debe ir a errores[] sin abortar el bulkCreate
  // completo (antes de este fix, una sola fila así hacía fallar el
  // bulkCreate entero a nivel de BD, sin que ninguna fila del lote se
  // procesara — ni siquiera las válidas).
  test('tipoDocumento vacío o inválido va a errores[] y no aborta el resto del lote', async () => {
    mockConvenioEmpleado.findAll.mockResolvedValue([]);

    const filas = [
      { ...filaBase, numeroDocumento: '666', tipoDocumento: '' },   // fila 1 — vacío
      { ...filaBase, numeroDocumento: '777', tipoDocumento: 'XX' }, // fila 2 — inválido
      { ...filaBase, numeroDocumento: '888' }                      // fila 3 — válida (CC)
    ];

    const resultado = await invitacionService.importarEmpleados(10, filas);

    expect(resultado.errores).toEqual([
      { fila: 1, motivo: 'tipoDocumento inválido o vacío (debe ser CC, TI, CE, PA, NIT o PPT)' },
      { fila: 2, motivo: 'tipoDocumento inválido o vacío (debe ser CC, TI, CE, PA, NIT o PPT)' }
    ]);
    expect(resultado.creados).toBe(1); // solo la fila 3 llega a bulkCreate
    expect(resultado.actualizados).toBe(0);

    const [registros] = mockConvenioEmpleado.bulkCreate.mock.calls[0];
    expect(registros).toHaveLength(1);
    expect(registros[0].numeroDocumento).toBe('888');
  });

  test('reimportar el mismo lote es idempotente: creados 0, actualizados N', async () => {
    const filas = [
      { ...filaBase, numeroDocumento: '111' },
      { ...filaBase, numeroDocumento: '222' },
      { ...filaBase, numeroDocumento: '333' }
    ];

    // Segunda importación: los tres documentos ya existen en el convenio
    mockConvenioEmpleado.findAll.mockResolvedValue([
      { numeroDocumento: '111' },
      { numeroDocumento: '222' },
      { numeroDocumento: '333' }
    ]);

    const resultado = await invitacionService.importarEmpleados(10, filas);

    expect(resultado.creados).toBe(0);
    expect(resultado.actualizados).toBe(3);
    expect(resultado.errores).toEqual([]);
    expect(mockConvenioEmpleado.bulkCreate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ updateOnDuplicate: expect.arrayContaining(['primerNombre', 'celular']) })
    );
  });

  test('lote vacío no llama a bulkCreate', async () => {
    const resultado = await invitacionService.importarEmpleados(10, []);
    expect(resultado).toEqual({ creados: 0, actualizados: 0, ignorados: 0, errores: [] });
    expect(mockConvenioEmpleado.bulkCreate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// generarInvitaciones
// ─────────────────────────────────────────────

describe('generarInvitaciones', () => {
  test('reutiliza una invitación vigente en vez de crear otra', async () => {
    mockConvenioEmpleado.findAll.mockResolvedValue([{ id: 5, activo: 1 }]);
    const vigente = {
      id: 99, convenioId: 10, empleadoId: 5, token: 'token-vigente',
      usadoEn: null, expiraEn: new Date(Date.now() + 1000 * 60 * 60)
    };
    mockConvenioInvitacion.findOne.mockResolvedValue(vigente);

    const resultado = await invitacionService.generarInvitaciones(10, [5]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toEqual(vigente);
    expect(resultado.omitidos).toEqual([]);
    expect(mockConvenioInvitacion.create).not.toHaveBeenCalled();
  });

  test('crea una invitación nueva con token base64url de 43 caracteres cuando no hay una vigente', async () => {
    mockConvenioEmpleado.findAll.mockResolvedValue([{ id: 5, activo: 1 }]);
    mockConvenioInvitacion.findOne.mockResolvedValue(null);
    mockConvenioInvitacion.create.mockImplementation(async (datos) => ({ id: 1, ...datos }));

    const [invitacion] = await invitacionService.generarInvitaciones(10, [5], { diasVigencia: 7 });

    expect(mockConvenioInvitacion.create).toHaveBeenCalledTimes(1);
    const [datosCreados] = mockConvenioInvitacion.create.mock.calls[0];
    expect(datosCreados.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(datosCreados.convenioId).toBe(10);
    expect(datosCreados.empleadoId).toBe(5);
    expect(invitacion.token).toBe(datosCreados.token);

    const diasReales = (datosCreados.expiraEn.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diasReales).toBeGreaterThan(6.9);
    expect(diasReales).toBeLessThan(7.1);
  });

  test('usa 15 días de vigencia por defecto', async () => {
    mockConvenioEmpleado.findAll.mockResolvedValue([{ id: 5, activo: 1 }]);
    mockConvenioInvitacion.findOne.mockResolvedValue(null);
    mockConvenioInvitacion.create.mockImplementation(async (datos) => ({ id: 1, ...datos }));

    await invitacionService.generarInvitaciones(10, [5]);

    const [datosCreados] = mockConvenioInvitacion.create.mock.calls[0];
    const diasReales = (datosCreados.expiraEn.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diasReales).toBeGreaterThan(14.9);
    expect(diasReales).toBeLessThan(15.1);
  });

  test('lote vacío de empleadoIds no consulta ConvenioEmpleado y devuelve arrays vacíos', async () => {
    const resultado = await invitacionService.generarInvitaciones(10, []);

    expect(resultado).toHaveLength(0);
    expect(resultado.omitidos).toEqual([]);
    expect(mockConvenioEmpleado.findAll).not.toHaveBeenCalled();
  });

  // Regresión: ConvenioEmpleado.activo = 0 ("el empleado ya no está en la
  // nómina; no se le puede invitar", comment del modelo) debe bloquear la
  // generación de la invitación — un empleado dado de baja no debe recibir
  // un link nuevo de autoafiliación.
  test('mezcla de empleados activos e inactivos: los activos reciben invitación, los inactivos van a omitidos', async () => {
    mockConvenioEmpleado.findAll.mockResolvedValue([
      { id: 1, activo: 1 }, // activo
      { id: 2, activo: 0 }, // inactivo — no se le invita
      { id: 3, activo: 1 }  // activo
    ]);
    mockConvenioInvitacion.findOne.mockResolvedValue(null);
    mockConvenioInvitacion.create.mockImplementation(async (datos) => ({ id: Math.random(), ...datos }));

    const resultado = await invitacionService.generarInvitaciones(10, [1, 2, 3]);

    expect(resultado).toHaveLength(2);
    expect(resultado.map(r => r.empleadoId)).toEqual([1, 3]);
    expect(resultado.omitidos).toEqual([
      { empleadoId: 2, motivo: 'Empleado inactivo en la nómina' }
    ]);
    // Solo se crea invitación (o se consulta reutilización) para los dos activos
    expect(mockConvenioInvitacion.create).toHaveBeenCalledTimes(2);
    expect(mockConvenioInvitacion.create.mock.calls.map(([d]) => d.empleadoId)).toEqual([1, 3]);
  });

  // Fix 1 (CRITICAL, ronda de revisión) — regresión de cross-tenant: antes
  // de este fix, el bucle iteraba sobre `empleadoIds` crudo en vez de sobre
  // las filas ya consultadas y acotadas por `convenioId`. Un id de OTRO
  // convenio (o inexistente) no aparece en el `findAll` (mockeado acá para
  // simular exactamente eso: el WHERE real de Sequelize ya excluye esas
  // filas), así que antes del fix `activoPorEmpleadoId.get(empleadoId)`
  // devolvía `undefined` — ni inactivo ni activo reconocido — y el código
  // seguía de largo, creando una invitación que enlazaba el convenio con el
  // empleado de OTRA empresa (PII cruzada + roster corrompido). Ahora
  // cualquier id que no resuelve a una fila propia del convenio se reporta
  // en `omitidos[]`, igual que un inactivo, y nunca se procesa.
  test('id de un empleado de OTRO convenio (o inexistente) va a omitidos, no crea invitación, y los ids propios sí se procesan', async () => {
    // Solo las filas 1 y 3 pertenecen al convenio 10 — el 99 es de otro
    // convenio (o no existe): el WHERE { id: In([1,99,3]), convenioId: 10 }
    // de Sequelize simplemente no lo trae de vuelta.
    mockConvenioEmpleado.findAll.mockResolvedValue([
      { id: 1, activo: 1 },
      { id: 3, activo: 1 }
    ]);
    mockConvenioInvitacion.findOne.mockResolvedValue(null);
    mockConvenioInvitacion.create.mockImplementation(async (datos) => ({ id: Math.random(), ...datos }));

    const resultado = await invitacionService.generarInvitaciones(10, [1, 99, 3]);

    expect(resultado).toHaveLength(2);
    expect(resultado.map(r => r.empleadoId)).toEqual([1, 3]);
    expect(resultado.omitidos).toEqual([
      { empleadoId: 99, motivo: 'Empleado no pertenece a este convenio' }
    ]);
    expect(mockConvenioInvitacion.create).toHaveBeenCalledTimes(2);
    expect(mockConvenioInvitacion.create.mock.calls.map(([d]) => d.empleadoId)).toEqual([1, 3]);
    // Nunca se llama a create con el id ajeno.
    expect(mockConvenioInvitacion.create.mock.calls.some(([d]) => d.empleadoId === 99)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// enviarInvitacion
// ─────────────────────────────────────────────

describe('enviarInvitacion', () => {
  function invitacionFalsa(overrides) {
    return Object.assign({
      id: 1,
      token: 'tok-123',
      empleado: { primerNombre: 'Ana', celular: '3001234567', email: 'ana@example.com' },
      save: jest.fn().mockResolvedValue(true)
    }, overrides);
  }

  test('WHATSAPP: llama a whatsappService.sendInvitacion con el link y marca enviadoEn/canalEnvio', async () => {
    const invitacion = invitacionFalsa();
    mockConvenioInvitacion.findByPk.mockResolvedValue(invitacion);

    const resultado = await invitacionService.enviarInvitacion(1, 'WHATSAPP', { id: 2 });

    expect(whatsappService.sendInvitacion).toHaveBeenCalledWith(
      '3001234567',
      expect.stringContaining('/afiliados/invitacion/tok-123'),
      'tu empresa' // invitacionFalsa() no incluye `convenio` -> cae al fallback
    );
    expect(resultado.canalEnvio).toBe('WHATSAPP');
    expect(resultado.enviadoEn).toBeInstanceOf(Date);
    expect(invitacion.save).toHaveBeenCalled();
  });

  test('WHATSAPP: pasa el nombre real del convenio cuando la invitación lo incluye', async () => {
    const invitacion = invitacionFalsa({ convenio: { id: 5, slug: 'conyca', nombre: 'CONYCA SOLUCIONES SAS' } });
    mockConvenioInvitacion.findByPk.mockResolvedValue(invitacion);

    await invitacionService.enviarInvitacion(1, 'WHATSAPP', { id: 2 });

    expect(whatsappService.sendInvitacion).toHaveBeenCalledWith(
      '3001234567',
      expect.stringContaining('/afiliados/invitacion/tok-123'),
      'CONYCA SOLUCIONES SAS'
    );
  });

  test('EMAIL: llama a emailService.enviarNotificacion', async () => {
    const invitacion = invitacionFalsa();
    mockConvenioInvitacion.findByPk.mockResolvedValue(invitacion);

    await invitacionService.enviarInvitacion(1, 'EMAIL', { id: 2 });

    expect(emailService.enviarNotificacion).toHaveBeenCalledWith(
      'ana@example.com',
      expect.any(String),
      expect.stringContaining('tok-123')
    );
    expect(invitacion.canalEnvio).toBe('EMAIL');
  });

  test('MANUAL: no envía nada por ningún canal, solo marca enviadoEn/canalEnvio', async () => {
    const invitacion = invitacionFalsa();
    mockConvenioInvitacion.findByPk.mockResolvedValue(invitacion);

    await invitacionService.enviarInvitacion(1, 'MANUAL', { id: 2 });

    expect(whatsappService.sendInvitacion).not.toHaveBeenCalled();
    expect(emailService.enviarNotificacion).not.toHaveBeenCalled();
    expect(invitacion.canalEnvio).toBe('MANUAL');
  });

  test('canal inválido lanza AppError 400', async () => {
    mockConvenioInvitacion.findByPk.mockResolvedValue(invitacionFalsa());

    await expect(
      invitacionService.enviarInvitacion(1, 'SMS', {})
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('invitación inexistente lanza AppError 404', async () => {
    mockConvenioInvitacion.findByPk.mockResolvedValue(null);

    await expect(
      invitacionService.enviarInvitacion(999, 'MANUAL', {})
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('WHATSAPP sin celular registrado lanza AppError 400', async () => {
    mockConvenioInvitacion.findByPk.mockResolvedValue(
      invitacionFalsa({ empleado: { primerNombre: 'Ana', celular: null, email: 'ana@example.com' } })
    );

    await expect(
      invitacionService.enviarInvitacion(1, 'WHATSAPP', {})
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(whatsappService.sendInvitacion).not.toHaveBeenCalled();
  });

  test('EMAIL sin correo registrado lanza AppError 400', async () => {
    mockConvenioInvitacion.findByPk.mockResolvedValue(
      invitacionFalsa({ empleado: { primerNombre: 'Ana', celular: '3001234567', email: null } })
    );

    await expect(
      invitacionService.enviarInvitacion(1, 'EMAIL', {})
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(emailService.enviarNotificacion).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// resolverToken
// ─────────────────────────────────────────────

describe('resolverToken', () => {
  function convenioFalso(overrides) {
    return Object.assign({
      id: 10, slug: 'conyca', nombre: 'CONYCA', activo: 1,
      toPublicJSON(engineVersion) {
        return { slug: this.slug, nombre: this.nombre, engineVersion };
      }
    }, overrides);
  }

  function empleadoFalso(overrides) {
    return Object.assign({
      tipoDocumento: 'CC', numeroDocumento: '123',
      primerNombre: 'Ana', primerApellido: 'Pérez',
      celular: '3001234567', email: 'ana@example.com', cargo: 'Auxiliar'
    }, overrides);
  }

  test('token inexistente → AppError 404 "Invitación no válida"', async () => {
    mockConvenioInvitacion.findOne.mockResolvedValue(null);

    await expect(invitacionService.resolverToken('no-existe')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Invitación no válida'
    });
  });

  test('token ya usado → AppError 410', async () => {
    mockConvenioInvitacion.findOne.mockResolvedValue({
      usadoEn: new Date(),
      expiraEn: new Date(Date.now() + 100000),
      convenio: convenioFalso(),
      empleado: empleadoFalso()
    });

    await expect(invitacionService.resolverToken('tok')).rejects.toMatchObject({
      statusCode: 410,
      message: 'Esta invitación ya fue utilizada'
    });
  });

  test('token vencido → AppError 410 con mensaje de vencimiento', async () => {
    mockConvenioInvitacion.findOne.mockResolvedValue({
      usadoEn: null,
      expiraEn: new Date(Date.now() - 100000), // ya venció
      convenio: convenioFalso(),
      empleado: empleadoFalso()
    });

    await expect(invitacionService.resolverToken('tok')).rejects.toMatchObject({
      statusCode: 410,
      message: 'Esta invitación venció, contacta a talento humano de tu empresa'
    });
  });

  test('convenio no activo → AppError 404', async () => {
    mockConvenioInvitacion.findOne.mockResolvedValue({
      usadoEn: null,
      expiraEn: new Date(Date.now() + 100000),
      convenio: convenioFalso({ activo: 0 }),
      empleado: empleadoFalso()
    });

    await expect(invitacionService.resolverToken('tok')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Este convenio no está disponible actualmente'
    });
  });

  // Regresión: ConvenioEmpleado.activo = 0 debe rechazar el token aunque no
  // esté usado, no haya vencido y el convenio siga activo — un empleado dado
  // de baja de la nómina no puede completar la autoafiliación con un token
  // que se generó cuando todavía trabajaba ahí.
  test('empleado inactivo en la nómina → AppError 410', async () => {
    mockConvenioInvitacion.findOne.mockResolvedValue({
      usadoEn: null,
      expiraEn: new Date(Date.now() + 100000),
      convenio: convenioFalso(),
      empleado: empleadoFalso({ activo: 0 })
    });

    await expect(invitacionService.resolverToken('tok')).rejects.toMatchObject({
      statusCode: 410,
      message: 'Este empleado ya no hace parte de la nómina de la empresa, contacta a talento humano'
    });
  });

  test('caso exitoso: devuelve convenio (toPublicJSON) y datos del empleado', async () => {
    mockConvenioInvitacion.findOne.mockResolvedValue({
      usadoEn: null,
      expiraEn: new Date(Date.now() + 100000),
      convenio: convenioFalso(),
      empleado: empleadoFalso()
    });

    const resultado = await invitacionService.resolverToken('tok');

    expect(resultado.convenio).toEqual({ slug: 'conyca', nombre: 'CONYCA', engineVersion: ENGINE_VERSION });
    expect(resultado.empleado).toEqual({
      tipoDocumento: 'CC',
      numeroDocumento: '123',
      primerNombre: 'Ana',
      primerApellido: 'Pérez',
      celular: '3001234567',
      email: 'ana@example.com',
      cargo: 'Auxiliar'
    });
  });
});

// ─────────────────────────────────────────────
// marcarUsada
// ─────────────────────────────────────────────

describe('marcarUsada', () => {
  const transaccionFalsa = { id: 'tx-1' };

  test('token ya usado por otro submit concurrente (0 filas afectadas) → AppError 410, y NO toca ConvenioEmpleado', async () => {
    mockConvenioInvitacion.update.mockResolvedValue([0]);

    await expect(
      invitacionService.marcarUsada('tok', 55, transaccionFalsa)
    ).rejects.toMatchObject({ statusCode: 410, message: 'Esta invitación ya fue utilizada' });

    expect(mockConvenioInvitacion.update).toHaveBeenCalledWith(
      { usadoEn: expect.any(Date), afiliadoId: 55 },
      { where: { token: 'tok', usadoEn: null }, transaction: transaccionFalsa }
    );
    // Las dos actualizaciones deben ir acopladas: si la invitación no se pudo
    // marcar (carrera concurrente), la nómina tampoco debe tocarse.
    expect(mockConvenioInvitacion.findOne).not.toHaveBeenCalled();
    expect(mockConvenioEmpleado.update).not.toHaveBeenCalled();
  });

  // Regresión: marcarUsada marcaba ConvenioInvitacion.usadoEn/afiliadoId pero
  // nunca reflejaba el registro en ConvenioEmpleado.afiliadoId — la pantalla
  // de RRHH que lista el estado de la nómina (GET /convenios/:slug/empleados)
  // seguía viendo al empleado como "sin invitar" para siempre, aunque ya
  // se hubiera autoafiliado con éxito.
  test('caso exitoso: además de marcar la invitación, actualiza ConvenioEmpleado.afiliadoId en la misma transacción', async () => {
    mockConvenioInvitacion.update.mockResolvedValue([1]);
    mockConvenioInvitacion.findOne.mockResolvedValue({ empleadoId: 77 });
    mockConvenioEmpleado.update.mockResolvedValue([1]);

    await expect(
      invitacionService.marcarUsada('tok', 55, transaccionFalsa)
    ).resolves.toBeUndefined();

    // Se busca el empleadoId de la invitación ya marcada, en la misma transacción.
    expect(mockConvenioInvitacion.findOne).toHaveBeenCalledWith({
      where: { token: 'tok' },
      attributes: ['empleadoId'],
      transaction: transaccionFalsa
    });

    // ConvenioEmpleado se actualiza con el mismo afiliadoId, el empleadoId
    // correcto y la MISMA transacción que el UPDATE de ConvenioInvitacion.
    expect(mockConvenioEmpleado.update).toHaveBeenCalledWith(
      { afiliadoId: 55 },
      { where: { id: 77 }, transaction: transaccionFalsa }
    );
  });
});
