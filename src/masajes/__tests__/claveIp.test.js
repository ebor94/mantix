const { claveIp, usuarioParaLog } = require('../routes/auth.routes');

test('IPv4 tal cual (también la forma ::ffff:)', () => {
  expect(claveIp('10.1.2.3')).toBe('10.1.2.3');
  expect(claveIp('::ffff:10.1.2.3')).toBe('10.1.2.3');
});

test('IPv6 se agrupa por /64: rotar direcciones dentro del bloque no da contadores nuevos', () => {
  const a = claveIp('2001:db8:abcd:12:1::5');
  expect(a).toBe('2001:db8:abcd:12::/64');
  expect(claveIp('2001:db8:abcd:12:ffff:ffff:ffff:9')).toBe(a);
  expect(claveIp('2001:0DB8:ABCD:0012::1')).toBe(a);
  expect(claveIp('2001:db8:abcd:13::1')).not.toBe(a);
});

test('usuario para el log: solo con forma de usuario', () => {
  expect(usuarioParaLog('OLIVOS\\EOrtega')).toBe('eortega');
  expect(usuarioParaLog('mi clave secreta!')).toBe('[formato no válido]');
  expect(usuarioParaLog(undefined)).toBe('[formato no válido]');
});
