// src/porteria/services/eventos.service.js
// Registro de ingresos y salidas (diseño §7). Lo que viene de H360 y del AD se valida antes de abrir la
// transacción; dentro de ella se bloquea la placa, se decide la coherencia del sentido, se inserta el
// evento, se actualiza el estado y se audita.
const PorteriaError = require('../utils/PorteriaError');
const { conTransaccion } = require('../utils/transaccion');
const repoEventos = require('../repositorios/eventos');
const repoEstado = require('../repositorios/estado');
const { registrarAuditoria } = require('../repositorios/auditoria');
const { leerEntradaRegistro, crearResolutorDetalle } = require('./detalleEvento');

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
          { estado: { dentro, sede_id: estado.sede_id, desde: ultimo ? ultimo.registrado_at : null } },
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
        evento_par_id: esIngreso ? estado.salida_abierta_id : null,
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

  return {
    registrar,
    listar: (filtros, opciones) => repoEventos.listar(bd.obtener(), filtros, opciones),
    obtener: (id) => repoEventos.obtener(bd.obtener(), id),
  };
}

module.exports = { crearServicioEventos };
