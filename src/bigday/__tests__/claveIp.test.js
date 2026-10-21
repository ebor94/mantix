const { claveIp } = require('../routes/respuestas.routes');

describe('claveIp', () => {
  it('IPv4 normal queda igual', () => {
    expect(claveIp('203.0.113.7')).toBe('203.0.113.7');
  });

  it('IPv4-mapped equivale a la IPv4 plana y dos distintas dan claves distintas', () => {
    expect(claveIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(claveIp('::FFFF:203.0.113.8')).toBe('203.0.113.8');
    expect(claveIp('::ffff:203.0.113.7')).not.toBe(claveIp('::ffff:203.0.113.8'));
  });

  it('::1 no colisiona con IPv4', () => {
    expect(claveIp('::1')).not.toBe(claveIp('::ffff:127.0.0.1'));
    expect(claveIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });

  it('IPv6 comprimida y completa del mismo /56 dan la misma clave; de otro /56, distinta', () => {
    const a = claveIp('2001:db8:abcd:12::1');
    expect(claveIp('2001:0db8:abcd:0012:0000:0000:0000:0001')).toBe(a);
    expect(claveIp('2001:db8:abcd:ff:1:2:3:4')).toBe(a);
    expect(claveIp('2001:db8:abcd:1300::1')).not.toBe(a);
    expect(claveIp('2001:db8:abce:12::1')).not.toBe(a);
  });

  it('ignora zone id y mayúsculas', () => {
    expect(claveIp('FE80::1%eth0')).toBe(claveIp('fe80::1'));
  });

  it('IPv6 con IPv4 incrustada (no mapped) se expande bien', () => {
    expect(claveIp('64:ff9b::203.0.113.7')).toBe(claveIp('64:ff9b:0:0:0:0:cb00:7107'));
    expect(claveIp('64:ff9b::203.0.113.7')).toBe(claveIp('64:ff9b::203.0.113.9'));
    expect(claveIp('64:ff9b:1::203.0.113.7')).not.toBe(claveIp('64:ff9b::203.0.113.7'));
  });

  it('undefined devuelve un valor fijo', () => {
    expect(claveIp(undefined)).toBe('desconocida');
  });
});
