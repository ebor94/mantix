const { Op } = require('sequelize');

// ─────────────────────────────────────────────────────────────────────────
// NOTA DE IMPLEMENTACIÓN (desvío respecto al brief del plan SP-3 Task 4):
// El brief original pedía `sequelize.sync({ force: true })` contra los
// modelos reales + crear filas de SvRol/SvArea/SvGrupo/SvUsuario. Este
// backend NO tiene una config de test aislada (sqlite en memoria o DB de
// test dedicada): `src/config/database.js` sólo define `development` y
// `production`, ambos apuntando al MySQL remoto compartido
// (DB_HOST=192.9.17.30, DB_NAME=serfuweb) que usan TODOS los módulos del
// backend (Mantenimiento, Afiliados, Votaciones, CYM, R44, CRM...).
// `sequelize.sync({force:true})` haría DROP+CREATE de *todas* esas tablas
// porque comparten la misma instancia `sequelize` singleton — una operación
// destructiva e irreversible contra una base compartida, inaceptable para
// un test unitario. Además, cada test *.service.test.js existente en este
// repo (eventosMulti, eventoPool, agendaSemana, jornadaObligatoria, etc.)
// sigue el mismo patrón: `jest.mock('../src/sv/models', ...)` con mocks
// planos, nunca DB real. Este archivo sigue esa misma convención: en vez de
// una tabla MySQL real, `SvEventoOtp` se simula con un store en memoria que
// implementa sólo las operaciones que el service realmente usa
// (create/count/findByPk/destroy estático/update de instancia), lo
// suficiente para ejercitar la lógica real de rate-limit, expiración e
// intentos sin tocar ninguna base de datos.
// ─────────────────────────────────────────────────────────────────────────

function crearFakeEventoOtpModel() {
  let rows = [];
  let nextId = 1;

  function toInstance(row) {
    row.update = jest.fn(async (patch) => {
      Object.assign(row, patch);
      return row;
    });
    row.destroy = jest.fn(async () => {
      rows = rows.filter((r) => r !== row);
      return 1;
    });
    return row;
  }

  return {
    create: jest.fn(async (data) => {
      const row = toInstance({
        otp_id:           nextId++,
        otp_evento_id:    data.otp_evento_id,
        otp_usr_id:       data.otp_usr_id,
        otp_hash:         data.otp_hash,
        otp_expires_at:   data.otp_expires_at,
        otp_consumed_at:  data.otp_consumed_at ?? null,
        otp_intentos:     data.otp_intentos ?? 0,
        otp_payload_json: data.otp_payload_json ?? null,
        otp_created_at:   data.otp_created_at ?? new Date()
      });
      rows.push(row);
      return row;
    }),
    count: jest.fn(async ({ where } = {}) => {
      return rows.filter((r) => {
        if (where.otp_evento_id !== undefined && r.otp_evento_id !== where.otp_evento_id) return false;
        if (where.otp_usr_id !== undefined && r.otp_usr_id !== where.otp_usr_id) return false;
        if ('otp_consumed_at' in where && where.otp_consumed_at === null && r.otp_consumed_at != null) return false;
        if (where.otp_expires_at && where.otp_expires_at[Op.gt] &&
            !(r.otp_expires_at.getTime() > where.otp_expires_at[Op.gt].getTime())) return false;
        return true;
      }).length;
    }),
    findByPk: jest.fn(async (id) => rows.find((r) => r.otp_id === id) || null),
    update: jest.fn(async (patch, { where } = {}) => {
      const afectadas = rows.filter((r) => where?.otp_id === undefined || r.otp_id === where.otp_id);
      afectadas.forEach((r) => Object.assign(r, patch));
      return [afectadas.length];
    }),
    destroy: jest.fn(async ({ where } = {}) => {
      const lt = where?.otp_expires_at?.[Op.lt];
      const aBorrar = lt ? rows.filter((r) => r.otp_expires_at.getTime() < lt.getTime()) : [...rows];
      rows = rows.filter((r) => !aBorrar.includes(r));
      return aBorrar.length;
    }),
    __reset() { rows = []; nextId = 1; },
    __count() { return rows.length; }
  };
}

const mockEventoOtp    = crearFakeEventoOtpModel();
const mockEventoAgenda = { findByPk: jest.fn() };
const mockUsuario      = { findByPk: jest.fn() };

jest.mock('../src/sv/models', () => ({
  SvEventoOtp:    mockEventoOtp,
  SvEventoAgenda: mockEventoAgenda,
  SvUsuario:      mockUsuario
}));

jest.mock('../src/sv/services/googleChat.service', () => ({ enviarOtp: jest.fn() }));
jest.mock('../src/sv/services/eventosAgenda.service', () => ({ actualizar: jest.fn() }));

const gchat         = require('../src/sv/services/googleChat.service');
const eventosAgenda = require('../src/sv/services/eventosAgenda.service');
const eventoOtp     = require('../src/sv/services/eventoOtp.service');

const ASESOR_ID = 10;
const EVENTO_ID = 500;

const actorAsesor = () => ({ usr_id: ASESOR_ID, rol: { rol_codigo: 'ASESOR' } });

beforeEach(() => {
  mockEventoOtp.__reset();
  mockEventoAgenda.findByPk.mockReset().mockResolvedValue({
    evento_id: EVENTO_ID, evento_asesor_id: ASESOR_ID, evento_titulo: 'T'
  });
  mockUsuario.findByPk.mockReset().mockResolvedValue({
    usr_id: ASESOR_ID, usr_nombre: 'Pepe', usr_apellido: 'S'
  });
  gchat.enviarOtp.mockReset().mockResolvedValue({ ok: true, ms: 42 });
  eventosAgenda.actualizar.mockReset().mockImplementation(async (id, payload) => ({
    evento_id: id, evento_titulo: payload.titulo, evento_asesor_id: ASESOR_ID
  }));
});

describe('services/eventoOtp', () => {
  it('solicitar: crea registro, envía a gchat y devuelve otp_id + expires_at', async () => {
    const r = await eventoOtp.solicitar({
      eventoId: EVENTO_ID, cambios: { titulo: 'Nuevo' }, actor: actorAsesor()
    });
    expect(r.otp_id).toBeGreaterThan(0);
    expect(r.expires_at).toBeInstanceOf(Date);
    expect(r.canal).toBe('google_chat');
    expect(gchat.enviarOtp).toHaveBeenCalledTimes(1);
    const row = await mockEventoOtp.findByPk(r.otp_id);
    expect(row.otp_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.otp_intentos).toBe(0);
    expect(row.otp_payload_json).toMatchObject({ titulo: 'Nuevo' });
  });

  it('solicitar: rollback y GCHAT_FAIL si el webhook falla', async () => {
    gchat.enviarOtp.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'GCHAT_FAIL' }));
    await expect(eventoOtp.solicitar({
      eventoId: EVENTO_ID, cambios: { titulo: 'X' }, actor: actorAsesor()
    })).rejects.toMatchObject({ code: 'GCHAT_FAIL' });
    expect(mockEventoOtp.__count()).toBe(0);
  });

  it('solicitar: 429 al 4to activo', async () => {
    for (let i = 0; i < 3; i++) {
      await eventoOtp.solicitar({ eventoId: EVENTO_ID, cambios: { titulo: 'x' + i }, actor: actorAsesor() });
    }
    await expect(eventoOtp.solicitar({
      eventoId: EVENTO_ID, cambios: { titulo: 'z' }, actor: actorAsesor()
    })).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });

  it('solicitar: FORBIDDEN si actor no es dueño', async () => {
    const otro = { usr_id: 999, rol: { rol_codigo: 'ASESOR' } };
    await expect(eventoOtp.solicitar({
      eventoId: EVENTO_ID, cambios: { titulo: 'x' }, actor: otro
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('confirmar: código correcto aplica cambios y marca consumed_at', async () => {
    let capturado;
    gchat.enviarOtp.mockImplementationOnce(async ({ otp }) => { capturado = otp; return { ok: true, ms: 1 }; });
    const { otp_id } = await eventoOtp.solicitar({
      eventoId: EVENTO_ID, cambios: { titulo: 'Editado' }, actor: actorAsesor()
    });
    const r = await eventoOtp.confirmar({ eventoId: EVENTO_ID, otpId: otp_id, otp: capturado, actor: actorAsesor() });
    expect(r.evento_titulo).toBe('Editado');
    expect(eventosAgenda.actualizar).toHaveBeenCalledWith(
      EVENTO_ID, { titulo: 'Editado' }, expect.objectContaining({ rol: { rol_codigo: 'SUPER_ADMIN' } })
    );
    const row = await mockEventoOtp.findByPk(otp_id);
    expect(row.otp_consumed_at).toBeInstanceOf(Date);
  });

  it('confirmar: código incorrecto incrementa intentos; al 3er fallo → 401 y OTP invalidado', async () => {
    const { otp_id } = await eventoOtp.solicitar({
      eventoId: EVENTO_ID, cambios: { titulo: 'X' }, actor: actorAsesor()
    });
    for (let i = 0; i < 3; i++) {
      await expect(eventoOtp.confirmar({
        eventoId: EVENTO_ID, otpId: otp_id, otp: '000000', actor: actorAsesor()
      })).rejects.toMatchObject({ code: 'OTP_INVALID' });
    }
    const row = await mockEventoOtp.findByPk(otp_id);
    expect(row.otp_intentos).toBe(3);
    expect(row.otp_consumed_at).toBeInstanceOf(Date); // invalidado marcando consumed
  });

  it('confirmar: OTP expirado → 410 GONE', async () => {
    const { otp_id } = await eventoOtp.solicitar({
      eventoId: EVENTO_ID, cambios: { titulo: 'X' }, actor: actorAsesor()
    });
    await mockEventoOtp.update({ otp_expires_at: new Date(Date.now() - 60_000) }, { where: { otp_id } });
    await expect(eventoOtp.confirmar({
      eventoId: EVENTO_ID, otpId: otp_id, otp: '123456', actor: actorAsesor()
    })).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('confirmar: OTP ya consumido → 409 CONFLICT', async () => {
    let capturado;
    gchat.enviarOtp.mockImplementationOnce(async ({ otp }) => { capturado = otp; return { ok: true }; });
    const { otp_id } = await eventoOtp.solicitar({
      eventoId: EVENTO_ID, cambios: { titulo: 'A' }, actor: actorAsesor()
    });
    await eventoOtp.confirmar({ eventoId: EVENTO_ID, otpId: otp_id, otp: capturado, actor: actorAsesor() });
    await expect(eventoOtp.confirmar({
      eventoId: EVENTO_ID, otpId: otp_id, otp: capturado, actor: actorAsesor()
    })).rejects.toMatchObject({ code: 'OTP_CONSUMED' });
  });

  it('cleanupVencidos: borra sólo los > 24h después de expirar', async () => {
    const viejo = await mockEventoOtp.create({
      otp_evento_id: EVENTO_ID, otp_usr_id: ASESOR_ID, otp_hash: 'a'.repeat(64),
      otp_expires_at: new Date(Date.now() - 25 * 3600 * 1000)
    });
    const reciente = await mockEventoOtp.create({
      otp_evento_id: EVENTO_ID, otp_usr_id: ASESOR_ID, otp_hash: 'b'.repeat(64),
      otp_expires_at: new Date(Date.now() - 10 * 3600 * 1000)
    });
    const n = await eventoOtp.cleanupVencidos();
    expect(n).toBe(1);
    expect(await mockEventoOtp.findByPk(viejo.otp_id)).toBeNull();
    expect(await mockEventoOtp.findByPk(reciente.otp_id)).not.toBeNull();
  });
});
