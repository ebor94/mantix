const { serializarParticipante, urlFoto } = require('../serializar');

const p = {
  id: 'u1', categoria_id: 1, categoria: { id: 1, codigo: 'PEQUENOS', nombre: 'Caninos raza pequeña', color: '#FF9900', rubrica_id: 1 },
  responsable_nombre: 'ANA MARÍA Pérez', responsable_documento: '123', responsable_telefono: '300', responsable_correo: 'a@b.co',
  mascota_nombre: 'Canela', especie: 'PERRO', raza: 'Criollo', edad_texto: '3', sexo: 'HEMBRA', disfraz_nombre: 'Bruja',
  foto_oficial_path: 'abc.jpg', foto_inscripcion_url: null, estado: 'PRESENTE', orden_pasarela: 1, llegada_at: null,
  notas_importacion: 'x', origen: 'IMPORTACION'
};

test('PUBLICO nunca incluye documento, teléfono, correo ni nombre completo (RNF-5)', () => {
  const s = serializarParticipante(p, 'PUBLICO');
  for (const campo of ['responsable_documento', 'responsable_telefono', 'responsable_correo', 'responsable_nombre', 'notas_importacion']) {
    expect(s).not.toHaveProperty(campo);
  }
  expect(JSON.stringify(s)).not.toMatch(/123|300|a@b\.co|MARÍA/);
  expect(s).toMatchObject({ responsable_primer_nombre: 'Ana', mascota_nombre: 'Canela', foto_url: '/uploads/trk/fotos/abc.jpg', categoria: { id: 1, codigo: 'PEQUENOS', nombre: 'Caninos raza pequeña', color: '#FF9900' } });
  expect(s.categoria).not.toHaveProperty('rubrica_id');
})

test('categoria.color es null si la categoría no tiene color', () => {
  const s = serializarParticipante({ ...p, categoria: { id: 1, codigo: 'PEQUENOS', nombre: 'X' } }, 'PUBLICO');
  expect(s.categoria).toEqual({ id: 1, codigo: 'PEQUENOS', nombre: 'X', color: null });
});

test('COMPLETO incluye datos de contacto', () => {
  expect(serializarParticipante(p, 'COMPLETO')).toMatchObject({ responsable_documento: '123', responsable_telefono: '300', responsable_correo: 'a@b.co' });
});

test('acepta instancias Sequelize (get({ plain }))', () => {
  const instancia = { get: () => p };
  expect(serializarParticipante(instancia, 'PUBLICO').id).toBe('u1');
});

test('urlFoto', () => {
  expect(urlFoto(null)).toBeNull();
  expect(urlFoto('x.jpg')).toBe('/uploads/trk/fotos/x.jpg');
});
