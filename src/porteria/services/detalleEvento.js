// src/porteria/services/detalleEvento.js
// Validación de la entrada de un registro y resolución de su detalle (motivo, referencia y conductor),
// compartida por registrar y corregir. Todo dato de H360 y del AD se valida aquí, en el backend.
const PorteriaError = require('../utils/PorteriaError');
const { normalizarPlaca } = require('../utils/placa');
const { aplica } = require('../repositorios/motivos');

const SENTIDOS = ['INGRESO', 'SALIDA'];
const TIPOS = ['PROPIO', 'PROVEEDOR_ASISTENCIA', 'PROVEEDOR'];
const CAMPOS_REFERENCIA = ['motivo_id', 'asistencia_id', 'exequia_id', 'referencia_texto'];
const CAMPOS_CONDUCTOR = ['conductor_usuario', 'conductor_nombre', 'conductor_documento', 'conductor_otro', 'empresa'];
const CAMPOS_CORREGIBLES = [...CAMPOS_REFERENCIA, ...CAMPOS_CONDUCTOR, 'kilometraje', 'observaciones'];

const formato = (message) => new PorteriaError(400, 'VALIDACION', message);
const regla = (message) => new PorteriaError(422, 'VALIDACION', message);

/** Texto opcional: recortado; vacío → null; si no es texto o pasa de `max` → 400. */
function texto(valor, max, campo) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw formato(`Valor inválido en ${campo}`);
  const recortado = valor.trim();
  if (recortado.length > max) throw formato(`Texto demasiado largo en ${campo}`);
  return recortado === '' ? null : recortado;
}

/** Entero opcional en [min, max]; acepta 12 o '12'. Vacío o solo espacios → null; otro tipo → 400. */
function entero(valor, campo, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'string') {
    const recortado = valor.trim();
    if (recortado === '') return null;
    valor = recortado;
  } else if (typeof valor !== 'number') {
    throw formato(`Valor inválido en ${campo}`);
  }
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw formato(`Valor inválido en ${campo}`);
  return n;
}

const booleano = (v) => v === true || v === 'true' || v === 1 || v === '1';

function leerDetalle(body) {
  return {
    motivo_id: entero(body.motivo_id, 'motivo'),
    asistencia_id: entero(body.asistencia_id, 'asistencia'),
    exequia_id: entero(body.exequia_id, 'exequia'),
    referencia_texto: texto(body.referencia_texto, 255, 'referencia'),
    conductor_usuario: texto(body.conductor_usuario, 100, 'conductor'),
    conductor_nombre: texto(body.conductor_nombre, 150, 'nombre del conductor'),
    conductor_documento: texto(body.conductor_documento, 30, 'documento del conductor'),
    conductor_otro: booleano(body.conductor_otro),
    empresa: texto(body.empresa, 150, 'empresa'),
    kilometraje: entero(body.kilometraje, 'kilometraje', { min: 0, max: 5000000 }),
    observaciones: texto(body.observaciones, 500, 'observaciones'),
  };
}

const esObjeto = (body) => body !== null && typeof body === 'object' && !Array.isArray(body);

function leerEntradaRegistro(body) {
  if (!esObjeto(body)) throw formato('Datos inválidos');
  if (!SENTIDOS.includes(body.sentido)) throw formato('Indica si es ingreso o salida');
  const placa = typeof body.placa === 'string' ? normalizarPlaca(body.placa) : '';
  if (!placa) throw formato('Indica la placa');
  if (placa.length > 20) throw formato('La placa es demasiado larga');
  const tipo = body.tipo_vehiculo === undefined || body.tipo_vehiculo === null || body.tipo_vehiculo === '' ? null : body.tipo_vehiculo;
  if (tipo !== null && !TIPOS.includes(tipo)) throw formato('Tipo de vehículo inválido');
  const detalle = leerDetalle(body);
  if (!detalle.motivo_id) throw formato('Indica el motivo');
  return {
    sentido: body.sentido, placa, tipo_vehiculo: tipo, ...detalle,
    forzar: booleano(body.forzar), guardar_en_catalogo: booleano(body.guardar_en_catalogo),
  };
}

function leerCambiosCorreccion(body) {
  if (!esObjeto(body)) throw formato('Datos inválidos');
  if (['placa', 'sentido', 'tipo_vehiculo', 'sede_id'].some((c) => c in body)) {
    throw formato('La placa, el sentido, el tipo y la sede no se corrigen: anula el registro y regístralo de nuevo');
  }
  const leido = leerDetalle(body);
  const cambios = Object.fromEntries(CAMPOS_CORREGIBLES.filter((c) => c in body).map((c) => [c, leido[c]]));
  if (Object.keys(cambios).length === 0) throw formato('No hay cambios');
  if ('motivo_id' in cambios && !cambios.motivo_id) throw formato('Indica el motivo');
  return cambios;
}

function crearResolutorDetalle({ h360, conductores, motivos }) {
  const SIN_REFERENCIA = { asistencia_id: null, exequia_id: null, referencia_texto: null, referencia_snapshot: null };

  async function resolverReferencia(motivo, datos) {
    switch (motivo.tipo_referencia) {
      case 'ASISTENCIA': {
        if (!datos.asistencia_id) {
          if (motivo.referencia_obligatoria) throw regla('Selecciona la asistencia');
          return SIN_REFERENCIA;
        }
        const a = await h360.obtenerAsistenciaVigente(datos.asistencia_id);
        if (!a) throw regla('La asistencia no existe o ya no está activa');
        return {
          ...SIN_REFERENCIA,
          asistencia_id: a.id,
          referencia_snapshot: { tipo: 'ASISTENCIA', codigo: a.codigo, nombre_ser_querido: a.nombre_ser_querido, contrato: a.contrato },
        };
      }
      case 'EXEQUIA': {
        if (!datos.exequia_id) {
          if (motivo.referencia_obligatoria) throw regla('Selecciona la exequia');
          return SIN_REFERENCIA;
        }
        const e = await h360.obtenerExequiaVigente(datos.exequia_id);
        if (!e) throw regla('La exequia no existe o ya terminó');
        return {
          ...SIN_REFERENCIA,
          exequia_id: e.id,
          referencia_snapshot: {
            tipo: 'EXEQUIA', codigo: e.asistencia_codigo, nombre_ser_querido: e.nombre_ser_querido,
            fecha: e.fecha, hora: e.hora, tipo_exequia: e.tipo,
          },
        };
      }
      case 'TEXTO':
        if (!datos.referencia_texto && motivo.referencia_obligatoria) throw regla('Escribe la referencia');
        return { ...SIN_REFERENCIA, referencia_texto: datos.referencia_texto };
      default:
        return SIN_REFERENCIA;
    }
  }

  async function resolverConductor(tipo, datos) {
    if (tipo !== 'PROPIO') {
      if (!datos.empresa || !datos.conductor_nombre || !datos.conductor_documento) {
        throw regla('Escribe la empresa, el nombre y el documento del conductor');
      }
      return {
        conductor_usuario: null, conductor_nombre: datos.conductor_nombre, conductor_documento: datos.conductor_documento,
        conductor_otro: false, empresa: datos.empresa,
      };
    }
    if (datos.conductor_otro) {
      if (!datos.conductor_nombre) throw regla('Escribe el nombre del conductor');
      return {
        conductor_usuario: null, conductor_nombre: datos.conductor_nombre, conductor_documento: datos.conductor_documento,
        conductor_otro: true, empresa: null,
      };
    }
    if (!datos.conductor_usuario) throw regla('Selecciona el conductor');
    const { conductor, listaCompleta } = await conductores.buscar(datos.conductor_usuario);
    if (conductor) {
      return { conductor_usuario: conductor.usuario, conductor_nombre: conductor.nombre, conductor_documento: null, conductor_otro: false, empresa: null };
    }
    // Con el AD sin responder del todo no se bloquea la portería: se acepta el usuario con el nombre del front.
    if (!listaCompleta && !datos.conductor_nombre) throw regla('No se pudo verificar el conductor. Escribe su nombre o elige "otro".');
    if (listaCompleta) throw regla('El conductor no está en la lista. Elige "otro" y escribe el nombre.');
    return { conductor_usuario: datos.conductor_usuario, conductor_nombre: datos.conductor_nombre, conductor_documento: null, conductor_otro: false, empresa: null };
  }

  const copiar = (datos, campos) => Object.fromEntries(campos.map((c) => [c, datos[c] ?? null]));

  /**
   * Columnas de detalle de un evento. En una corrección, `conservar` copia lo que no cambió sin volver a
   * consultar H360 ni el AD (una asistencia ya cerrada no impide corregir el kilometraje).
   */
  async function resolver({ tipo, sentido, datos, conservar = {} }) {
    const motivo = await motivos.obtener(datos.motivo_id);
    if (!motivo) throw regla('El motivo no aplica a este vehículo o sentido');
    if (!conservar.referencia && (!motivo.activo || !aplica(motivo, tipo, sentido))) {
      throw regla('El motivo no aplica a este vehículo o sentido');
    }
    const referencia = conservar.referencia
      ? copiar(datos, ['asistencia_id', 'exequia_id', 'referencia_texto', 'referencia_snapshot'])
      : await resolverReferencia(motivo, datos);
    const conductor = conservar.conductor
      ? { ...copiar(datos, CAMPOS_CONDUCTOR), conductor_otro: Boolean(datos.conductor_otro) }
      : await resolverConductor(tipo, datos);
    return {
      motivo: { id: motivo.id, codigo: motivo.codigo, nombre: motivo.nombre },
      columnas: {
        motivo_id: motivo.id,
        ...referencia,
        ...conductor,
        kilometraje: tipo === 'PROPIO' ? datos.kilometraje ?? null : null,
        observaciones: datos.observaciones ?? null,
      },
    };
  }

  return { resolver };
}

module.exports = {
  leerEntradaRegistro, leerCambiosCorreccion, crearResolutorDetalle, CAMPOS_REFERENCIA, CAMPOS_CONDUCTOR, TIPOS, SENTIDOS,
};
