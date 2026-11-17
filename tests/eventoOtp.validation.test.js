const { solicitarOtp, confirmarOtp } = require('../src/sv/validations/eventoOtp.validation');
const { validate } = require('../src/sv/middleware/validate');

function correrMiddleware(schema, body) {
  const req = { body };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { return this; } };
  const next = jest.fn();
  validate(schema)(req, res, next);
  return { req, res, next };
}

describe('validations/eventoOtp', () => {
  describe('solicitarOtp', () => {
    it('acepta cambios objeto no vacío', () => {
      const { error } = solicitarOtp.validate({ cambios: { titulo: 'Nuevo' } });
      expect(error).toBeUndefined();
    });
    it('rechaza cambios vacío', () => {
      const { error } = solicitarOtp.validate({ cambios: {} });
      expect(error).toBeDefined();
    });
    it('rechaza sin cambios', () => {
      const { error } = solicitarOtp.validate({});
      expect(error).toBeDefined();
    });
  });
  describe('confirmarOtp', () => {
    it('acepta otp de 6 dígitos', () => {
      const { error } = confirmarOtp.validate({ otp_id: 42, otp: '493712' });
      expect(error).toBeUndefined();
    });
    it('rechaza otp de 5 dígitos', () => {
      const { error } = confirmarOtp.validate({ otp_id: 42, otp: '49371' });
      expect(error).toBeDefined();
    });
    it('rechaza otp no numérico', () => {
      const { error } = confirmarOtp.validate({ otp_id: 42, otp: 'abc123' });
      expect(error).toBeDefined();
    });
    it('rechaza sin otp_id', () => {
      const { error } = confirmarOtp.validate({ otp: '493712' });
      expect(error).toBeDefined();
    });
  });
  describe('con el middleware validate real', () => {
    it('confirmarOtp válido llama next', () => {
      const { next, res } = correrMiddleware(confirmarOtp, { otp_id: 7, otp: '123456' });
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });
    it('solicitarOtp inválido responde 422 sin llamar next', () => {
      const { next, res } = correrMiddleware(solicitarOtp, { cambios: {} });
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(422);
    });
  });
});
