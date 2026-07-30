/**
 * Tests del enforcement de reglas de convenio en el servidor.
 *
 * El motor (convenioRules) ya está cubierto por convenioRules.test.js. Lo que
 * se verifica acá es la capa que lo aplica: que un grupo familiar inválido
 * produzca un AppError 400 con el detalle utilizable por el formulario, y —lo
 * más importante— que esta validación NO toque las afiliaciones sin convenio,
 * que son todas las que hoy existen en producción (asesor y Veolia).
 *
 * Se mockea la capa de modelos para no necesitar base de datos.
 */

const mockConvenio = { findByPk: jest.fn() };
jest.mock('../src/models', () => ({ Convenio: mockConvenio }));

const convenioService = require('../src/services/convenio.service');
const seedConyca = require('../src/seeds/convenios/conyca.json');

/** Construye un doble del modelo Convenio con el helper json() que usa el servicio. */
function convenioFalso(overrides) {
  const datos = Object.assign(
    { id: 1, slug: 'conyca', nombre: 'CONYCA SOLUCIONES SAS', reglas: seedConyca.reglas },
    overrides
  );
  return Object.assign(datos, {
    json(campo) {
      const raw = this[campo];
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  });
}

const titularCasado = { estadoCivil: 'CASADO', fechaNacimiento: '1990-01-01' };

beforeEach(() => {
  mockConvenio.findByPk.mockReset();
});

describe('assertReglasConvenio', () => {
  test('no hace nada cuando la afiliación no tiene convenio', async () => {
    // Este es el caso de TODAS las afiliaciones existentes: asesor y Veolia.
    // Si esto fallara, la migración rompería producción.
    await expect(
      convenioService.assertReglasConvenio(null, titularCasado, [
        { parentesco: 'YERNO/NUERA', fechaNacimiento: '1930-01-01' }
      ])
    ).resolves.toBeNull();

    expect(mockConvenio.findByPk).not.toHaveBeenCalled();
  });

  test('deja pasar un grupo familiar que cumple', async () => {
    mockConvenio.findByPk.mockResolvedValue(convenioFalso());

    const resultado = await convenioService.assertReglasConvenio(1, titularCasado, [
      { parentesco: 'PADRE', fechaNacimiento: '1938-01-01' },
      { parentesco: 'SUEGRO (A)', fechaNacimiento: '1960-01-01' }
    ]);

    expect(resultado.valido).toBe(true);
  });

  test('rechaza con 400 y adjunta los errores para que el formulario los señale', async () => {
    mockConvenio.findByPk.mockResolvedValue(convenioFalso());

    expect.assertions(5);
    try {
      await convenioService.assertReglasConvenio(1, titularCasado, [
        { parentesco: 'PADRE', fechaNacimiento: '1960-01-01' },
        { parentesco: 'MADRE', fechaNacimiento: '1962-01-01' },
        { parentesco: 'SUEGRO (A)', fechaNacimiento: '1965-01-01' }
      ]);
    } catch (e) {
      expect(e.statusCode).toBe(400);
      expect(e.message).toMatch(/padres y suegros/i);
      expect(e.detalles.errores).toHaveLength(1);
      expect(e.detalles.errores[0].indices).toEqual([2]);
      expect(e.detalles.convenio).toBe('conyca');
    }
  });

  test('BYPASS: recalcula la edad desde fechaNacimiento e ignora la que manda el cliente', async () => {
    mockConvenio.findByPk.mockResolvedValue(convenioFalso());

    // Un cliente malicioso envía un suegro de 76 declarando edad 30 para
    // esquivar el tope. El servidor no debe creerle.
    await expect(
      convenioService.assertReglasConvenio(1, titularCasado, [
        { parentesco: 'SUEGRO (A)', fechaNacimiento: '1949-01-01', edad: 30 }
      ])
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('BYPASS: rechaza un adicional aunque el formulario no lo ofrezca', async () => {
    mockConvenio.findByPk.mockResolvedValue(convenioFalso());

    await expect(
      convenioService.assertReglasConvenio(1, titularCasado, [
        { parentesco: 'TIO (A)', fechaNacimiento: '1995-01-01', tipoBeneficiario: 'ADICIONAL' }
      ])
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/no permite beneficiarios adicionales/i)
    });
  });

  test('acumula varios incumplimientos en un solo mensaje', async () => {
    mockConvenio.findByPk.mockResolvedValue(convenioFalso());

    try {
      await convenioService.assertReglasConvenio(1, titularCasado, [
        { parentesco: 'SUEGRO (A)', fechaNacimiento: '1940-01-01' },
        { parentesco: 'HIJO (A)', fechaNacimiento: '1980-01-01' }
      ]);
      throw new Error('debió lanzar');
    } catch (e) {
      expect(e.detalles.errores.length).toBeGreaterThan(1);
      expect(e.message).toContain('·'); // formato de lista
    }
  });

  test('falla de forma explícita si el convenio referenciado ya no existe', async () => {
    mockConvenio.findByPk.mockResolvedValue(null);

    await expect(
      convenioService.assertReglasConvenio(99, titularCasado, [])
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('acepta las reglas como string JSON, tal como las devuelve MySQL', async () => {
    mockConvenio.findByPk.mockResolvedValue(
      convenioFalso({ reglas: JSON.stringify(seedConyca.reglas) })
    );

    const r = await convenioService.assertReglasConvenio(1, titularCasado, [
      { parentesco: 'PADRE', fechaNacimiento: '1938-01-01' }
    ]);
    expect(r.valido).toBe(true);
  });
});

describe('evaluar (dry-run del endpoint público)', () => {
  test('devuelve cupos para que la UI muestre los contadores', () => {
    const r = convenioService.evaluar(convenioFalso(), titularCasado, [
      { parentesco: 'PADRE', fechaNacimiento: '1938-01-01' }
    ]);

    expect(r.valido).toBe(true);
    expect(r.cupos.cupo_padres_suegros).toMatchObject({ usado: 1, max: 2 });
    expect(r.cupos.cupo_cuarto_grado).toMatchObject({ usado: 0, max: 0 });
  });

  test('no lanza: el veredicto va en el cuerpo de la respuesta', () => {
    const r = convenioService.evaluar(convenioFalso(), titularCasado, [
      { parentesco: 'SUEGRO (A)', fechaNacimiento: '1940-01-01' }
    ]);
    expect(r.valido).toBe(false);
    expect(r.errores.length).toBeGreaterThan(0);
  });
});

describe('seed de producción', () => {
  test('el convenio CONYCA se siembra inactivo', () => {
    // Se publica con un UPDATE cuando el cliente valide el formulario, para que
    // la URL no funcione apenas se despliegue.
    expect(seedConyca.activo).toBe(0);
  });

  test('las condiciones pactadas están representadas en las reglas', () => {
    const ids = seedConyca.reglas.reglas.map(r => r.id);
    expect(ids).toContain('cupo_padres_suegros');   // condición 1
    expect(ids).toContain('edad_suegros');          // condición 1 (suegros < 75)
    expect(ids).toContain('cupo_cuarto_grado');     // condiciones 2 y 3
    expect(seedConyca.reglas.limites.adicionales).toBe(0);
    expect(seedConyca.formulario.mostrarAsistenciaFueraDeCasa).toBe(false);
  });

  test('los padres NO tienen regla de edad: es como se expresa "sin límite"', () => {
    const conPadres = seedConyca.reglas.reglas.filter(
      r => r.tipo === 'edad' && (r.aplicaA || []).includes('@PADRES')
    );
    expect(conPadres).toHaveLength(0);
  });

  test('el caso más permisivo del cupo condicional va primero', () => {
    // Si se invierten, la cuota de 4 nunca se alcanza: "sin padres ni suegros"
    // también es cierto cuando el núcleo entero está vacío.
    const regla = seedConyca.reglas.reglas.find(r => r.id === 'cupo_cuarto_grado');
    expect(regla.casos[0].max).toBeGreaterThan(regla.casos[1].max);
  });
});
