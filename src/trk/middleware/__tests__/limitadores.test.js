const { claveIp, idNormalizado } = require('../limitadores');

test('IPv4 se usa tal cual (también mapeada en IPv6)', () => {
  expect(claveIp('10.0.0.1')).toBe('10.0.0.1');
  expect(claveIp('::ffff:10.0.0.1')).toBe('10.0.0.1');
});

test('IPv6 se agrupa por /64 (el cliente no puede rotar dentro de su prefijo)', () => {
  expect(claveIp('2001:db8:1:2:aaaa::1')).toBe(claveIp('2001:db8:1:2:ffff:1:2:3'));
  expect(claveIp('2001:db8:1:2::1')).not.toBe(claveIp('2001:db8:1:3::1'));
  expect(claveIp('::1')).toBe('0:0:0:0::/64');
});

test('id normalizado como lo convierte Joi', () => {
  for (const v of ['01', '001', '1.0', '+1', ' 1', '1e0', 1]) expect(idNormalizado({ body: { usuario_id: v } })).toBe('1');
  expect(idNormalizado({ body: {} })).toBe('-');
  expect(idNormalizado({ body: { usuario_id: 'abc' } })).toBe('-');
});
