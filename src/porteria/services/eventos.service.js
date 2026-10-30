// src/porteria/services/eventos.service.js
// Registro de ingresos y salidas (diseño §7). Lo que viene de H360 y del AD se valida antes de abrir la
// transacción; dentro de ella se bloquea la placa, se decide la coherencia del sentido, se inserta el
// evento, se actualiza el estado y se audita.
const PorteriaError = require('../utils/PorteriaError');
const { conTransaccion } = require('../utils/transaccion');
const repoEventos = require('../repositorios/eventos');
const repoEstado = require('../repositorios/estado');
const { registrarAuditoria } = require('../repositorios/auditoria');
const { ROLES } = require('./auth.service');
const {
  leerEntradaRegistro, leerCambiosCorreccion, crearResolutorDetalle, CAMPOS_REFERENCIA, CAMPOS_CONDUCTOR,
} = require('./detalleEvento');

const QUINCE_MINUTOS = 15 * 60;
const noExiste = () => new PorteriaError(404, 'NO_ENCONTRADO', 'El registro no existe');

const regla = (message) => new PorteriaError(422, 'VALIDACION', message);

function crearServicioEventos({ bd, h360, conductores, motivos, vehiculosExternos }) {
  const resolutor = crearResolutorDetalle({ h360, conductores, motivos });

  async function resolverVehiculo(entrada) {
    const vehiculo = await h360.obtenerVehiculoPropioPorPlaca(entrada.placa);
    if (vehiculo) return { tipo: 'PROPIO', vehiculo, externo: null };
    if (entrada.tipo_vehiculo === 'PROPIO') throw regla('La placa no está registrada como vehículo de la empresa');
    const externo = await vehiculosExternos.obtenerPorPlaca(entrada.placa);
    const tipo = externo ? externo.tipo : entrada.tipo_vehiculo;
    if (!tipo) throw regla('Indica el tipo de vehículo');
    return { tipo, vehiculo: null, externo };
  }

  /** El id del catálogo: el existente, o uno nuevo si el guarda pidió guardarlo (sin duplicar en carreras). */
  async function idEnCatalogo(conn, { tipo, externo, entrada, empresa, usuario }) {
    if (tipo === 'PROPIO') return null;
    if (externo) return externo.id;
    if (!entrada.guardar_en_catalogo) return null;
    try {
      return await vehiculosExternos.crear({ placa: entrada.placa, tipo, empresa, descripcion: null, usuario }, conn);
    } catch (err) {
      if (err.motivo !== 'PLACA_DUPLICADA') throw err;
      return (await vehiculosExternos.obtenerPorPlaca(entrada.placa, conn)).id;
    }
  }

  async function registrar(body, sesion, ctx = {}) {
    const entrada = leerEntradaRegistro(body);
    const { tipo, vehiculo, externo } = await resolverVehiculo(entrada);
    const { columnas } = await resolutor.resolver({
      tipo, sentido: entrada.sentido, datos: { ...entrada, empresa: entrada.empresa ?? (externo && externo.empresa) ?? null },
    });

    return conTransaccion(bd, async (conn) => {
      const estado = await repoEstado.bloquear(conn, entrada.placa);
      const conHistoria = estado.ultimo_evento_id !== null;
      // Sin historial, un propio está en la sede (su primer movimiento es salir) y un proveedor está fuera.
      const dentro = conHistoria ? estado.dentro === 1 : tipo === 'PROPIO';
      const esIngreso = entrada.sentido === 'INGRESO';
      const incoherente = esIngreso === dentro;

      if (incoherente && !entrada.forzar) {
        const ultimo = conHistoria ? await repoEventos.obtener(conn, estado.ultimo_evento_id) : null;
        throw new PorteriaError(
          409, 'SENTIDO_INCOHERENTE',
          dentro
            ? 'Este vehículo figura dentro. Para registrar el ingreso igual, confírmalo y escribe una observación.'
            : 'Este vehículo figura fuera. Para registrar la salida igual, confírmalo y escribe una observación.',
          { estado: { dentro, sede_id: estado.sede_id, desde: ultimo ? ultimo.registrado_at : null, sin_historial: !conHistoria } },
        );
      }
      if (incoherente && !columnas.observaciones) throw regla('Escribe una observación para registrar igual');

      const vehiculoExternoId = await idEnCatalogo(conn, { tipo, externo, entrada, empresa: columnas.empresa, usuario: sesion.usuario });
      const id = await repoEventos.insertar(conn, {
        sede_id: sesion.sede_id,
        sentido: entrada.sentido,
        tipo_vehiculo: tipo,
        placa: entrada.placa,
        vehiculo_id: vehiculo ? vehiculo.id : null,
        vehiculo_externo_id: vehiculoExternoId,
        ...columnas,
        // Solo los propios dejan salida abierta: su ingreso cierra el viaje, sin importar la sede.
        evento_par_id: esIngreso && tipo === 'PROPIO' ? estado.salida_abierta_id : null,
        inconsistente: incoherente ? 1 : 0,
        inconsistencia_tipo: incoherente ? (esIngreso ? 'INGRESO_ESTANDO_DENTRO' : 'SALIDA_ESTANDO_FUERA') : null,
        registrado_por: sesion.usuario,
      });
      await repoEstado.guardar(conn, {
        placa: entrada.placa,
        tipo_vehiculo: tipo,
        sede_id: sesion.sede_id,
        dentro: esIngreso ? 1 : 0,
        ultimo_evento_id: id,
        salida_abierta_id: !esIngreso && tipo === 'PROPIO' ? id : null,
      });
      const creado = await repoEventos.obtener(conn, id);
      await registrarAuditoria(conn, {
        usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'evento', entidadId: id,
        accion: incoherente ? 'FORZAR' : 'CREAR', despues: creado, ip: ctx.ip,
      });
      return creado;
    });
  }

  async function verificarPermisoEdicion(evento, sesion) {
    if (sesion.rol === ROLES.ADMIN) return;
    const segundos = await repoEventos.antiguedadSegundos(bd.obtener(), evento.id);
    if (evento.registrado_por !== sesion.usuario || segundos === null || segundos > QUINCE_MINUTOS) {
      throw new PorteriaError(403, 'SIN_PERMISO', 'Solo puedes corregir o anular tus registros de los últimos 15 minutos');
    }
  }

  async function cargarEditable(id, sesion, mensajeAnulado) {
    const evento = await repoEventos.obtener(bd.obtener(), id);
    if (!evento) throw noExiste();
    if (evento.anulado) throw new PorteriaError(409, 'ANULADO', mensajeAnulado);
    await verificarPermisoEdicion(evento, sesion);
    return evento;
  }

  /** Lo que se corrige de un evento, tal como está guardado. */
  const datosDe = (e) => ({
    motivo_id: e.motivo_id, asistencia_id: e.asistencia_id, exequia_id: e.exequia_id, referencia_texto: e.referencia_texto,
    referencia_snapshot: e.referencia, conductor_usuario: e.conductor_usuario, conductor_nombre: e.conductor_nombre,
    conductor_documento: e.conductor_documento, conductor_otro: e.conductor_otro, empresa: e.empresa,
    kilometraje: e.kilometraje, observaciones: e.observaciones,
  });

  async function corregir(id, body, sesion, ctx = {}) {
    const cambios = leerCambiosCorreccion(body);
    const actual = await cargarEditable(id, sesion, 'El registro está anulado');
    const cambia = (campos) => campos.some((c) => c in cambios);
    // Si cambia algún dato del conductor, los del conductor salen solo de `cambios`: nada se hereda del anterior.
    const base = datosDe(actual);
    if (cambia(CAMPOS_CONDUCTOR)) for (const c of CAMPOS_CONDUCTOR) base[c] = null;
    const { columnas } = await resolutor.resolver({
      tipo: actual.tipo_vehiculo,
      sentido: actual.sentido,
      datos: { ...base, ...cambios },
      conservar: { referencia: !cambia(CAMPOS_REFERENCIA), conductor: !cambia(CAMPOS_CONDUCTOR) },
    });
    if (actual.inconsistente && !columnas.observaciones) throw regla('El registro forzado necesita una observación');

    return conTransaccion(bd, async (conn) => {
      const antes = await repoEventos.obtener(conn, id, { bloquear: true });
      if (antes.anulado) throw new PorteriaError(409, 'ANULADO', 'El registro está anulado');
      // Otra corrección pudo guardarse entre la lectura y este bloqueo: no se pisa a ciegas.
      if (String(antes.corregido_at) !== String(actual.corregido_at) || JSON.stringify(datosDe(antes)) !== JSON.stringify(datosDe(actual))) {
        throw new PorteriaError(409, 'MODIFICADO', 'El registro cambió mientras lo editabas. Vuelve a abrirlo.');
      }
      await repoEventos.actualizar(conn, id, columnas, sesion.usuario);
      const despues = await repoEventos.obtener(conn, id);
      await registrarAuditoria(conn, {
        usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'evento', entidadId: id, accion: 'CORREGIR', antes, despues, ip: ctx.ip,
      });
      return despues;
    });
  }

  /** El estado de la placa vuelve a ser el de su último evento vigente; sin ninguno, la placa no tiene estado. */
  async function recalcularEstado(conn, placa) {
    const ultimo = await repoEventos.ultimoVigente(conn, placa);
    if (!ultimo) return repoEstado.borrar(conn, placa);
    return repoEstado.guardar(conn, {
      placa,
      tipo_vehiculo: ultimo.tipo_vehiculo,
      sede_id: ultimo.sede_id,
      dentro: ultimo.sentido === 'INGRESO' ? 1 : 0,
      ultimo_evento_id: ultimo.id,
      salida_abierta_id: ultimo.sentido === 'SALIDA' && ultimo.tipo_vehiculo === 'PROPIO' ? ultimo.id : null,
    });
  }

  async function anular(id, body, sesion, ctx = {}) {
    const motivo = typeof (body && body.motivo) === 'string' ? body.motivo.trim() : '';
    if (!motivo) throw new PorteriaError(400, 'VALIDACION', 'Escribe el motivo de la anulación');
    if (motivo.length > 255) throw new PorteriaError(400, 'VALIDACION', 'El motivo de la anulación es demasiado largo');
    const actual = await cargarEditable(id, sesion, 'El registro ya está anulado');

    return conTransaccion(bd, async (conn) => {
      // Mismo orden de bloqueo que registrar: primero la placa, después el evento.
      await repoEstado.bloquear(conn, actual.placa);
      const antes = await repoEventos.obtener(conn, id, { bloquear: true });
      if (antes.anulado) throw new PorteriaError(409, 'ANULADO', 'El registro ya está anulado');
      await repoEventos.anular(conn, id, { usuario: sesion.usuario, motivo });
      await recalcularEstado(conn, actual.placa);
      const despues = await repoEventos.obtener(conn, id);
      await registrarAuditoria(conn, {
        usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'evento', entidadId: id, accion: 'ANULAR', antes, despues, ip: ctx.ip,
      });
      return despues;
    });
  }

  return {
    registrar,
    corregir,
    anular,
    listar: (filtros, opciones) => repoEventos.listar(bd.obtener(), filtros, opciones),
    obtener: (id) => repoEventos.obtener(bd.obtener(), id),
  };
}

module.exports = { crearServicioEventos };
