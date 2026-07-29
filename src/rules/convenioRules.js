/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de reglas de beneficiarios por convenio
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * IMPLEMENTACIÓN CANÓNICA. Este es el único archivo que se edita.
 *
 * El motor corre en dos lados: en el navegador para validar en vivo mientras el
 * usuario agrega beneficiarios, y en el servidor como autoridad. El espejo del
 * frontend (afiliacion-frontend/src/utils/convenioRules.js) NO se edita a mano:
 * se genera desde aquí con
 *
 *   node src/rules/sync-espejo.js
 *
 * y `npm test` corre los mismos fixtures (src/rules/__fixtures__/convenio-casos.json)
 * contra los dos motores para confirmar que no divergieron.
 *
 * Al tocar este archivo: regenerar el espejo y correr los tests.
 *
 * ENGINE_VERSION se expone al frontend en la config del convenio. Si el
 * frontend detecta una versión distinta a la suya, desactiva su validación
 * local y delega en el endpoint de dry-run del servidor.
 *
 * Sin dependencias. Funciones puras. CommonJS.
 *
 * Convenciones del JSON de reglas
 * ───────────────────────────────
 *  · "@NOMBRE" referencia un grupo de `reglas.grupos`; un string sin "@" es un
 *    parentesco literal; "*" significa "cualquier parentesco".
 *  · edadMin/edadMax son INCLUSIVOS y en años cumplidos: "menor de 75" se
 *    escribe edadMax: 74. Siempre acompañar de `etiqueta` para que el texto al
 *    usuario no dependa de aritmética.
 *  · La AUSENCIA de regla significa "sin límite". Así se expresa, por ejemplo,
 *    "los padres no tienen tope de edad": simplemente no hay regla de edad
 *    sobre @PADRES.
 *  · En `cupoCondicional` los `casos` se evalúan EN ORDEN y gana el primero que
 *    coincide, así que el más permisivo va primero. La condición se evalúa
 *    sobre los beneficiarios que NO pertenecen a `aplicaA`, para que la cuota
 *    no se autocancele a medida que se llena.
 */

const ENGINE_VERSION = 1;

/** Marcador para "cualquier parentesco" (el literal "*" en aplicaA). */
const TODOS = null;

const CODIGOS = {
  REGLAS_INVALIDAS: 'REGLAS_INVALIDAS',
  TITULAR_EDAD: 'TITULAR_EDAD',
  PARENTESCO_NO_PERMITIDO: 'PARENTESCO_NO_PERMITIDO',
  EDAD_FUERA_DE_RANGO: 'EDAD_FUERA_DE_RANGO',
  CUPO_EXCEDIDO: 'CUPO_EXCEDIDO',
  CUPO_CONDICIONAL_EXCEDIDO: 'CUPO_CONDICIONAL_EXCEDIDO',
  PARENTESCO_DUPLICADO: 'PARENTESCO_DUPLICADO',
  CUPO_RANGO_EDAD_EXCEDIDO: 'CUPO_RANGO_EDAD_EXCEDIDO',
  REQUERIDO_FALTANTE: 'REQUERIDO_FALTANTE',
  LIMITE_BENEFICIARIOS: 'LIMITE_BENEFICIARIOS',
  LIMITE_DE_LEY: 'LIMITE_DE_LEY',
  LIMITE_ADICIONALES: 'LIMITE_ADICIONALES'
};

// ── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Edad en años cumplidos. Replica exactamente la aritmética de
 * afiliacion-frontend/src/composables/useAgeCalculator.js para que el motor,
 * el formulario y el resto de la app nunca discrepen en el borde del cumpleaños.
 * Devuelve null si la fecha falta o es inválida.
 */
function calcularEdad(fechaNacimiento, fechaReferencia) {
  if (!fechaNacimiento) return null;
  const soloFecha = String(fechaNacimiento).slice(0, 10);
  const birth = new Date(soloFecha + 'T00:00:00');
  if (isNaN(birth.getTime())) return null;
  const hoy = fechaReferencia || new Date();
  let edad = hoy.getFullYear() - birth.getFullYear();
  const monthDiff = hoy.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && hoy.getDate() < birth.getDate())) {
    edad--;
  }
  return Math.max(0, edad);
}

/** MySQL/Sequelize devuelven JSON como objeto o como string según el driver. */
function parseReglas(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

/**
 * Expande una lista de refs (["@PADRES", "SUEGRO (A)", "*"]) al conjunto plano
 * de parentescos. Devuelve TODOS (null) si alguna ref es "*".
 * Detecta ciclos entre grupos: un grupo ya visitado se ignora en lugar de
 * desbordar la pila.
 */
function expandirRefs(refs, grupos, visitados) {
  const salida = new Set();
  const vistos = visitados || new Set();
  const lista = Array.isArray(refs) ? refs : [refs];

  for (const ref of lista) {
    if (ref === '*') return TODOS;
    if (typeof ref !== 'string' || ref === '') continue;

    if (ref.charAt(0) === '@') {
      const nombre = ref.slice(1);
      if (vistos.has(nombre)) continue;      // ciclo: se ignora esta rama
      vistos.add(nombre);
      const miembros = (grupos && grupos[nombre]) || [];
      const anidado = expandirRefs(miembros, grupos, vistos);
      if (anidado === TODOS) return TODOS;
      anidado.forEach(p => salida.add(p));
      vistos.delete(nombre);
    } else {
      salida.add(ref);
    }
  }
  return salida;
}

function perteneceA(beneficiario, conjunto) {
  if (conjunto === TODOS) return true;
  return conjunto.has(beneficiario.parentesco);
}

/** `filtro` acota una regla a un subconjunto (p. ej. solo los DE_LEY). */
function pasaFiltro(beneficiario, filtro, titular) {
  if (!filtro) return true;
  if (filtro.tipoBeneficiario && beneficiario.tipoBeneficiario !== filtro.tipoBeneficiario) {
    return false;
  }
  if (Array.isArray(filtro.estadoCivilTitular)) {
    if (!filtro.estadoCivilTitular.includes(titular.estadoCivil)) return false;
  }
  return true;
}

/** Sustituye {placeholders} en los mensajes definidos en el JSON. */
function plantilla(texto, datos) {
  if (!texto) return '';
  return String(texto).replace(/\{(\w+)\}/g, (coincidencia, clave) => {
    const valor = datos[clave];
    return valor === undefined || valor === null ? coincidencia : String(valor);
  });
}

// ── Normalización del contexto ───────────────────────────────────────────────

/**
 * Convierte los beneficiarios crudos en la forma que consume el motor.
 * La EDAD SE RECALCULA desde fechaNacimiento: el valor que manda el cliente
 * nunca decide. Solo se usa como respaldo si no vino fecha de nacimiento.
 * Conserva el índice original para poder señalar la fila en la UI.
 */
function normalizarBeneficiarios(beneficiarios, fechaReferencia, ignorarEstados) {
  const lista = Array.isArray(beneficiarios) ? beneficiarios : [];
  const omitir = ignorarEstados || [];
  const salida = [];

  lista.forEach((b, indice) => {
    if (!b) return;
    if (b.estado && omitir.includes(b.estado)) return;
    const edadCalculada = calcularEdad(b.fechaNacimiento, fechaReferencia);
    salida.push({
      indice,
      parentesco: b.parentesco || '',
      tipoBeneficiario: b.tipoBeneficiario || 'DE_LEY',
      estado: b.estado || null,
      edad: edadCalculada !== null ? edadCalculada : (Number(b.edad) || 0),
      nombre: [b.primerNombre, b.primerApellido].filter(Boolean).join(' ').trim()
    });
  });

  return salida;
}

// ── Predicados de cupoCondicional ────────────────────────────────────────────

/**
 * Evalúa la condición `si` de un caso contra `otros` (los beneficiarios que NO
 * pertenecen a la regla). Todas las claves presentes se combinan con AND.
 */
function evaluarCondicion(si, otros, grupos, titular) {
  if (!si) return true;

  if (Array.isArray(si.gruposVacios)) {
    const conjunto = expandirRefs(si.gruposVacios, grupos);
    const hay = otros.some(b => perteneceA(b, conjunto));
    if (hay) return false;
  }

  if (Array.isArray(si.gruposNoVacios)) {
    const conjunto = expandirRefs(si.gruposNoVacios, grupos);
    const hay = otros.some(b => perteneceA(b, conjunto));
    if (!hay) return false;
  }

  if (si.conteo && Array.isArray(si.conteo.de)) {
    const conjunto = expandirRefs(si.conteo.de, grupos);
    const n = otros.filter(b => perteneceA(b, conjunto)).length;
    if (si.conteo.min != null && n < si.conteo.min) return false;
    if (si.conteo.max != null && n > si.conteo.max) return false;
  }

  if (Array.isArray(si.estadoCivilEn)) {
    if (!si.estadoCivilEn.includes(titular.estadoCivil)) return false;
  }

  return true;
}

/** Resuelve el `max` vigente de un cupoCondicional y qué caso lo produjo. */
function resolverCupoCondicional(regla, otros, grupos, titular) {
  const casos = Array.isArray(regla.casos) ? regla.casos : [];
  for (const caso of casos) {
    if (evaluarCondicion(caso.si, otros, grupos, titular)) {
      return { max: caso.max, casoAplicado: caso.descripcion || null };
    }
  }
  return { max: regla.maxPorDefecto || 0, casoAplicado: null };
}

// ── Parentescos permitidos ───────────────────────────────────────────────────

/**
 * `parentescosPermitidos` admite dos formas:
 *   ["@GRUPO", "LITERAL"]                          → lista única
 *   { porEstadoCivil: { SOLTERO: [...], "*": [] } } → lista según estado civil
 * Devuelve TODOS (null) si no se declara nada, es decir "sin restricción".
 */
function resolverParentescosPermitidos(reglas, titular) {
  const decl = reglas.parentescosPermitidos;
  if (!decl) return TODOS;

  if (Array.isArray(decl)) {
    return expandirRefs(decl, reglas.grupos);
  }

  if (decl.porEstadoCivil) {
    const porEstado = decl.porEstadoCivil;
    const refs = porEstado[titular.estadoCivil] || porEstado['*'];
    if (!refs) return TODOS;
    return expandirRefs(refs, reglas.grupos);
  }

  return TODOS;
}

// ── Evaluación principal ─────────────────────────────────────────────────────

/**
 * Valida el CONJUNTO COMPLETO de beneficiarios contra las reglas del convenio.
 *
 * Se valida el conjunto y no el candidato aislado a propósito: un cupo
 * condicional puede invalidarse retroactivamente. Ejemplo real del convenio
 * CONYCA: con el núcleo familiar vacío se permiten 4 familiares de 4º grado;
 * si después se agrega un hijo, la cuota baja a 2 y dos de los familiares ya
 * cargados sobran. Un motor que solo mirase el último agregado no lo detecta.
 *
 * @param {object|string} reglasRaw  columna `convenios.reglas`
 * @param {object} contexto  { titular, beneficiarios }
 * @param {object} [opciones] { fechaReferencia, ignorarEstados }
 * @returns {{ valido, errores, cupos, parentescosPermitidos, engineVersion }}
 */
function validarConjunto(reglasRaw, contexto, opciones) {
  const opts = opciones || {};
  const fechaReferencia = opts.fechaReferencia || new Date();
  const ignorarEstados = opts.ignorarEstados || ['RETIRO'];

  const reglas = parseReglas(reglasRaw);
  const errores = [];
  const cupos = {};

  if (!reglas || typeof reglas !== 'object') {
    return {
      valido: false,
      engineVersion: ENGINE_VERSION,
      errores: [{
        reglaId: null,
        codigo: CODIGOS.REGLAS_INVALIDAS,
        mensaje: 'La configuración de reglas del convenio no es válida.',
        indices: [],
        parentesco: null
      }],
      cupos,
      parentescosPermitidos: []
    };
  }

  const ctx = contexto || {};
  const titularRaw = ctx.titular || {};
  const titular = {
    estadoCivil: titularRaw.estadoCivil || null,
    edad: (function () {
      const e = calcularEdad(titularRaw.fechaNacimiento, fechaReferencia);
      return e !== null ? e : (Number(titularRaw.edad) || null);
    })()
  };

  const grupos = reglas.grupos || {};
  const beneficiarios = normalizarBeneficiarios(
    ctx.beneficiarios, fechaReferencia, ignorarEstados
  );

  // Se registra el orden de aparición de cada error para poder ordenarlos de
  // forma determinista al final (misma entrada → misma salida, siempre).
  let orden = 0;
  function agregarError(reglaId, codigo, mensaje, indices, parentesco) {
    errores.push({
      reglaId: reglaId || null,
      codigo,
      mensaje,
      indices: indices || [],
      parentesco: parentesco || null,
      _orden: orden++
    });
  }

  // ── 1. Edad del titular ────────────────────────────────────────────────────
  const rTitular = reglas.titular;
  if (rTitular && titular.edad !== null) {
    const fueraMin = rTitular.edadMin != null && titular.edad < rTitular.edadMin;
    const fueraMax = rTitular.edadMax != null && titular.edad > rTitular.edadMax;
    if (fueraMin || fueraMax) {
      const etiqueta = rTitular.etiqueta || describirRango(rTitular.edadMin, rTitular.edadMax);
      agregarError(
        'titular',
        CODIGOS.TITULAR_EDAD,
        plantilla(
          rTitular.mensaje || 'El afiliado principal debe ser {etiqueta} (edad registrada: {edad}).',
          { etiqueta, edad: titular.edad }
        ),
        []
      );
    }
  }

  // ── 2. Parentescos permitidos ──────────────────────────────────────────────
  const permitidos = resolverParentescosPermitidos(reglas, titular);
  if (permitidos !== TODOS) {
    beneficiarios.forEach(b => {
      if (!permitidos.has(b.parentesco)) {
        agregarError(
          'parentescosPermitidos',
          CODIGOS.PARENTESCO_NO_PERMITIDO,
          `El parentesco "${b.parentesco}" no está permitido en este convenio` +
          (titular.estadoCivil ? ` para el estado civil ${titular.estadoCivil}.` : '.'),
          [b.indice],
          b.parentesco
        );
      }
    });
  }

  // ── 3. Límites globales ────────────────────────────────────────────────────
  const limites = reglas.limites || {};
  const totalDeLey = beneficiarios.filter(b => b.tipoBeneficiario === 'DE_LEY').length;
  const totalAdic = beneficiarios.filter(b => b.tipoBeneficiario === 'ADICIONAL').length;

  if (limites.beneficiarios != null && beneficiarios.length > limites.beneficiarios) {
    agregarError('limites.beneficiarios', CODIGOS.LIMITE_BENEFICIARIOS,
      `Este convenio permite máximo ${limites.beneficiarios} beneficiarios (registró ${beneficiarios.length}).`,
      beneficiarios.slice(limites.beneficiarios).map(b => b.indice));
  }
  if (limites.deLey != null && totalDeLey > limites.deLey) {
    agregarError('limites.deLey', CODIGOS.LIMITE_DE_LEY,
      `Este convenio permite máximo ${limites.deLey} beneficiarios del plan (registró ${totalDeLey}).`,
      beneficiarios.filter(b => b.tipoBeneficiario === 'DE_LEY').slice(limites.deLey).map(b => b.indice));
  }
  if (limites.adicionales != null && totalAdic > limites.adicionales) {
    agregarError('limites.adicionales', CODIGOS.LIMITE_ADICIONALES,
      limites.adicionales === 0
        ? 'Este convenio no permite beneficiarios adicionales.'
        : `Este convenio permite máximo ${limites.adicionales} beneficiarios adicionales (registró ${totalAdic}).`,
      beneficiarios.filter(b => b.tipoBeneficiario === 'ADICIONAL').slice(limites.adicionales).map(b => b.indice));
  }

  // ── 4. Reglas declaradas ───────────────────────────────────────────────────
  const listaReglas = Array.isArray(reglas.reglas) ? reglas.reglas : [];

  listaReglas.forEach(regla => {
    if (!regla || !regla.tipo) return;

    const conjunto = expandirRefs(regla.aplicaA || ['*'], grupos);
    const miembros = beneficiarios.filter(
      b => perteneceA(b, conjunto) && pasaFiltro(b, regla.filtro, titular)
    );

    switch (regla.tipo) {
      case 'edad': {
        miembros.forEach(b => {
          const bajoMin = regla.edadMin != null && b.edad < regla.edadMin;
          const sobreMax = regla.edadMax != null && b.edad > regla.edadMax;
          if (!bajoMin && !sobreMax) return;
          const etiqueta = regla.etiqueta || describirRango(regla.edadMin, regla.edadMax);
          agregarError(
            regla.id,
            CODIGOS.EDAD_FUERA_DE_RANGO,
            plantilla(
              regla.mensaje || 'El beneficiario "{parentesco}" debe ser {etiqueta} (edad registrada: {edad}).',
              { etiqueta, edad: b.edad, parentesco: b.parentesco, nombre: b.nombre }
            ),
            [b.indice],
            b.parentesco
          );
        });
        break;
      }

      case 'cupo': {
        const max = regla.max != null ? regla.max : 0;
        registrarCupo(cupos, regla, miembros.length, max, null);
        if (miembros.length > max) {
          agregarError(
            regla.id,
            CODIGOS.CUPO_EXCEDIDO,
            plantilla(
              regla.mensaje || 'Solo puede incluir {max} beneficiario(s) en "{etiqueta}" (ya registró {usado}).',
              { max, usado: miembros.length, etiqueta: regla.etiqueta || regla.id }
            ),
            // Sobran los últimos en orden de inserción: el candidato recién
            // agregado va al final, así que queda señalado de forma natural.
            miembros.slice(max).map(b => b.indice)
          );
        }
        break;
      }

      case 'cupoPorParentesco': {
        const max = regla.max != null ? regla.max : 1;
        const porParentesco = new Map();
        miembros.forEach(b => {
          if (!porParentesco.has(b.parentesco)) porParentesco.set(b.parentesco, []);
          porParentesco.get(b.parentesco).push(b);
        });
        porParentesco.forEach((grupo, parentesco) => {
          if (grupo.length <= max) return;
          agregarError(
            regla.id,
            CODIGOS.PARENTESCO_DUPLICADO,
            plantilla(
              regla.mensaje || 'Solo puede registrar {max} beneficiario(s) con parentesco "{parentesco}".',
              { max, parentesco, usado: grupo.length }
            ),
            grupo.slice(max).map(b => b.indice),
            parentesco
          );
        });
        break;
      }

      case 'cupoCondicional': {
        // La condición se evalúa sobre los que NO pertenecen a la regla, para
        // que la propia cuota no se cancele a medida que se llena.
        const otros = beneficiarios.filter(
          b => !perteneceA(b, conjunto) && pasaFiltro(b, regla.filtro, titular)
        );
        const { max, casoAplicado } = resolverCupoCondicional(regla, otros, grupos, titular);
        registrarCupo(cupos, regla, miembros.length, max, casoAplicado);
        if (miembros.length > max) {
          agregarError(
            regla.id,
            CODIGOS.CUPO_CONDICIONAL_EXCEDIDO,
            plantilla(
              regla.mensaje || 'Con los beneficiarios que ya registró solo puede incluir {max} en "{etiqueta}" (registró {usado}).',
              { max, usado: miembros.length, etiqueta: regla.etiqueta || regla.id }
            ),
            miembros.slice(max).map(b => b.indice)
          );
        }
        break;
      }

      case 'cupoPorRangoEdad': {
        const max = regla.max != null ? regla.max : 0;
        const enRango = miembros.filter(b => {
          if (regla.edadMin != null && b.edad < regla.edadMin) return false;
          if (regla.edadMax != null && b.edad > regla.edadMax) return false;
          return true;
        });
        registrarCupo(cupos, regla, enRango.length, max, null);
        if (enRango.length > max) {
          const etiqueta = regla.etiqueta || describirRango(regla.edadMin, regla.edadMax);
          agregarError(
            regla.id,
            CODIGOS.CUPO_RANGO_EDAD_EXCEDIDO,
            plantilla(
              regla.mensaje || 'Solo {max} beneficiario(s) pueden ser {etiqueta} (ya registró {usado}).',
              { max, usado: enRango.length, etiqueta }
            ),
            enRango.slice(max).map(b => b.indice)
          );
        }
        break;
      }

      case 'requerido': {
        const min = regla.min != null ? regla.min : 1;
        if (miembros.length < min) {
          agregarError(
            regla.id,
            CODIGOS.REQUERIDO_FALTANTE,
            plantilla(
              regla.mensaje || 'Debe registrar al menos {min} beneficiario(s) en "{etiqueta}".',
              { min, usado: miembros.length, etiqueta: regla.etiqueta || regla.id }
            ),
            []
          );
        }
        break;
      }

      default:
        // Un tipo desconocido no debe dejar pasar una afiliación en silencio.
        agregarError(
          regla.id,
          CODIGOS.REGLAS_INVALIDAS,
          `La regla "${regla.id}" usa un tipo no soportado por esta versión del motor ("${regla.tipo}").`,
          []
        );
    }
  });

  // Orden determinista: primero por el beneficiario señalado, luego por el
  // orden en que se declararon las reglas. Los errores sin índice van al final.
  errores.sort((a, b) => {
    const ia = a.indices.length ? Math.min.apply(null, a.indices) : Number.MAX_SAFE_INTEGER;
    const ib = b.indices.length ? Math.min.apply(null, b.indices) : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a._orden - b._orden;
  });
  errores.forEach(e => { delete e._orden; });

  return {
    valido: errores.length === 0,
    engineVersion: ENGINE_VERSION,
    errores,
    cupos,
    parentescosPermitidos: permitidos === TODOS ? [] : Array.from(permitidos).sort()
  };
}

function registrarCupo(cupos, regla, usado, max, casoAplicado) {
  cupos[regla.id] = {
    etiqueta: regla.etiqueta || regla.id,
    usado,
    max,
    casoAplicado: casoAplicado || null
  };
}

function describirRango(edadMin, edadMax) {
  if (edadMin != null && edadMax != null) return `de ${edadMin} a ${edadMax} años`;
  if (edadMax != null) return `menor de ${edadMax + 1} años`;
  if (edadMin != null) return `mayor de ${edadMin - 1} años`;
  return 'de cualquier edad';
}

/**
 * Azúcar para el flujo "Agregar beneficiario" del formulario.
 *
 * NO valida el candidato de forma aislada: lo agrega al conjunto y valida todo,
 * porque un cupo condicional puede invalidar beneficiarios ya cargados.
 * `erroresDelCandidato` es el subconjunto atribuible a la fila nueva, para que
 * la UI pueda mostrar el mensaje directo sin ocultar el resto.
 *
 * @param {number|null} [opciones.indiceEditado] índice que se está editando,
 *        para excluirlo del conjunto y no contarlo dos veces.
 */
function validarCandidato(reglasRaw, contexto, candidato, opciones) {
  const opts = opciones || {};
  const ctx = contexto || {};
  const actuales = Array.isArray(ctx.beneficiarios) ? ctx.beneficiarios : [];

  const base = opts.indiceEditado == null
    ? actuales.slice()
    : actuales.filter((_, i) => i !== opts.indiceEditado);

  const indiceCandidato = base.length;
  const resultado = validarConjunto(
    reglasRaw,
    { titular: ctx.titular, beneficiarios: base.concat([candidato]) },
    opts
  );

  return Object.assign({}, resultado, {
    indiceCandidato,
    erroresDelCandidato: resultado.errores.filter(
      e => e.indices.indexOf(indiceCandidato) !== -1
    )
  });
}

module.exports = {
  ENGINE_VERSION,
  CODIGOS,
  validarConjunto,
  validarCandidato,
  calcularEdad,
  parseReglas,
  expandirRefs,
  resolverParentescosPermitidos
};
