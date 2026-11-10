// Notificaciones del outbox vistas por el admin (spec §12): listar y reintentar las fallidas.
const { E } = require('../utils/MasajesError');
const { enTransaccion } = require('../utils/transaccion');
const { paginar } = require('../utils/paginacion');
const repo = require('../repositorios/notificaciones');

function crearServicioNotificaciones({ bd }) {
  async function listar({ estado, pagina, porPagina } = {}) {
    if (estado !== undefined && !repo.ESTADOS.includes(estado)) throw E.VALIDACION([{ campo: 'estado', motivo: 'ESTADO_INVALIDO' }]);
    const pg = paginar({ pagina, porPagina });
    const r = await repo.listar(bd.obtener(), { estado, ...pg });
    return { total: r.total, pagina: pg.pagina, porPagina: pg.porPagina, items: r.items };
  }

  async function reintentar({ id }) {
    if (!Number.isInteger(id) || id <= 0) throw E.NO_ENCONTRADA();
    return enTransaccion(bd, async (conn) => {
      if (!(await repo.reintentar(conn, id))) throw E.ESTADO_INVALIDO();
      return { id, estado: 'pendiente' };
    });
  }

  return { listar, reintentar };
}

module.exports = { crearServicioNotificaciones };
