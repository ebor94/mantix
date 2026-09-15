const { solicitarOtp, confirmarOtp } = require('../src/sv/validations/eventoOtp.validation');

describe('validations/eventoOtp', () => {
  describe('solicitarOtp', () => {
    it('acepta cambios objeto no vacío', () => {
      const { error } = solicitarOtp.body.validate({ cambios: { titulo: 'Nuevo' } });
      expect(error).toBeUndefined();
    });
    it('rechaza cambios vacío', () => {
      const { error } = solicitarOtp.body.validate({ cambios: {} });
      expect(error).toBeDefined();
    });
    it('rechaza sin cambios', () => {
      const { error } = solicitarOtp.body.validate({});
      expect(error).toBeDefined();
    });
  });
  describe('confirmarOtp', () => {
    it('acepta otp de 6 dígitos', () => {
      const { error } = confirmarOtp.body.validate({ otp_id: 42, otp: '493712' });
      expect(error).toBeUndefined();
    });
    it('rechaza otp de 5 dígitos', () => {
      const { error } = confirmarOtp.body.validate({ otp_id: 42, otp: '49371' });
      expect(error).toBeDefined();
    });
    it('rechaza otp no numérico', () => {
      const { error } = confirmarOtp.body.validate({ otp_id: 42, otp: 'abc123' });
      expect(error).toBeDefined();
    });
    it('rechaza sin otp_id', () => {
      const { error } = confirmarOtp.body.validate({ otp: '493712' });
      expect(error).toBeDefined();
    });
  });
});
