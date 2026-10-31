// src/porteria/services/motivosAdmin.service.js
// Motivos desde la administración: validación, transacción y auditoría (entidad 'motivo').
// El código no se cambia (lo usan los reportes); un motivo con registros no se borra, se inactiva.
const PorteriaError = require('../utils/PorteriaError');
const { conTransaccion } = require('../utils/transaccion');
const { registrarAuditoria } = require('../repositorios/auditoria');
const repo = require('../repositorios/motivos');

const invalido = (message) => new PorteriaError(400, 'VALIDACION', message);
const noExiste = () => new PorteriaError(404, 'NO_ENCONTRADO', 'El motivo no existe');
const CODIGO = /^[A-Z0-9_]{2,40}$/;
const TIPOS = ['aplica_propio', 'aplica_proveedor_asistencia', 'aplica_proveedor'];
const SENTIDOS = ['aplica_ingreso', 'aplica_salida'];
const BOOLEANOS = [...TIPOS, ...SENTIDOS, 'referencia_obligatoria', 'activo'];
const POR_DEFECTO = {
  descripcion: null, aplica_propio: false, aplica_proveedor_asistencia: false, aplica_proveedor: false,
  aplica_ingreso: true, aplica_salida: true, tipo_referencia: 'NINGUNA', referencia_obligatoria: false, orden: 0, activo: true,
};

/** Reglas sobre el motivo completo (el guardado más los cambios). */
function validarCombinacion(m) {
  if (!TIPOS.some((c) => m[c])) throw invalido('Marca al menos un tipo de vehículo');
  if (!SENTIDOS.some((c) => m[c])) throw invalido('Marca al menos un sentido');
  if (m.referencia_obligatoria && m.tipo_referencia === 'NINGUNA') throw invalido('Un motivo sin referencia no puede exigirla');
}

function leerMotivo(body, { nuevo }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalido('Datos inválidos');
  const datos = {};
  if (nuevo) {
    const codigo = typeof body.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
    if (!CODIGO.test(codigo)) throw invalido('Código inválido (letras, números y _; de 2 a 40)');
    datos.codigo = codigo;
  } else if ('codigo' in body) {
    throw invalido('El código no se cambia: crea otro motivo');
  }
  if (nuevo || 'nombre' in body) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    if (!nombre) throw invalido('Indica el nombre');
    if (nombre.length > 100) throw invalido('El nombre es demasiado largo');
    datos.nombre = nombre;
  }
  if ('descripcion' in body) {
    const d = body.descripcion;
    if (d !== null && typeof d !== 'string') throw invalido('La descripción es demasiado larga');
    const texto = d === null ? '' : d.trim();
    if (texto.length > 255) throw invalido('La descripción es demasiado larga');
    datos.descripcion = texto || null;
  }
  for (const campo of BOOLEANOS) {
    if (!(campo in body)) continue;
    if (typeof body[campo] !== 'boolean') throw invalido(`Valor inválido en ${campo}`);
    datos[campo] = body[campo];
  }
  if ('tipo_referencia' in body) {
    if (!repo.TIPOS_REFERENCIA.includes(body.tipo_referencia)) throw invalido('Tipo de referencia inválido');
    datos.tipo_referencia = body.tipo_referencia;
  }
  if ('orden' in body) {
    if (!Number.isInteger(body.orden) || body.orden < 0 || body.orden > 9999) throw invalido('Orden inválido');
    datos.orden = body.orden;
  }
  if (nuevo) {
    const completo = { ...POR_DEFECTO, ...datos };
    validarCombinacion(completo);
    return completo;
  }
  if (Object.keys(datos).length === 0) throw invalido('No hay cambios');
  return datos;
}

function crearServicioMotivosAdmin({ bd }) {
  const auditar = (conn, sesion, ctx, id, accion, antes, despues) => registrarAuditoria(conn, {
    usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'motivo', entidadId: id, accion, antes, despues, ip: ctx.ip,
  });

  return {
    listar: () => repo.listarParaAdmin(bd.obtener()),

    async crear(body, sesion, ctx = {}) {
      const datos = leerMotivo(body, { nuevo: true });
      return conTransaccion(bd, async (conn) => {
        const id = await repo.insertarMotivo(conn, datos, sesion.usuario);
        const creado = await repo.obtenerParaAdmin(conn, id);
        await auditar(conn, sesion, ctx, id, 'CREAR', null, creado);
        return creado;
      });
    },

    async actualizar(id, body, sesion, ctx = {}) {
      const cambios = leerMotivo(body, { nuevo: false });
      return conTransaccion(bd, async (conn) => {
        const antes = await repo.obtenerParaAdmin(conn, id, { bloquear: true });
        if (!antes) throw noExiste();
        validarCombinacion({ ...antes, ...cambios });
        await repo.actualizarMotivo(conn, id, cambios, sesion.usuario);
        const despues = await repo.obtenerParaAdmin(conn, id);
        await auditar(conn, sesion, ctx, id, 'CORREGIR', antes, despues);
        return despues;
      });
    },

    async eliminar(id, sesion, ctx = {}) {
      return conTransaccion(bd, async (conn) => {
        const antes = await repo.obtenerParaAdmin(conn, id, { bloquear: true });
        if (!antes) throw noExiste();
        if (antes.en_uso) throw repo.enUso();
        await repo.eliminarMotivo(conn, id);
        await auditar(conn, sesion, ctx, id, 'ELIMINAR', antes, null);
        return { id };
      });
    },
  };
}

module.exports = { crearServicioMotivosAdmin, leerMotivo };
