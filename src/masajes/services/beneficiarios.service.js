// Servicio de beneficiarios: importación del listado (Tarea 5) e identidad del login (Tarea 6). Altas/bajas: Tarea 11.
const repo = require('../repositorios/beneficiarios');
const historial = require('../repositorios/historial');
const { leerListado, claveNombre } = require('./listadoXlsx');
const { nombresCompatibles } = require('./auth.service');
const MasajesError = require('../utils/MasajesError');
const { E } = require('../utils/MasajesError');
const { formatearNombre } = require('./listadoXlsx');
const { normalizarCelular, enmascararCelular } = require('../dominio/telefono');
const { limpiar } = require('../utils/texto');
const { paginar } = require('../utils/paginacion');

const CORREO = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const AD_USUARIO = /^[a-z0-9._-]{2,80}$/;
const invalido = (campo, motivo) => E.VALIDACION([{ campo, motivo }]);
const esId = (v) => Number.isInteger(v) && v > 0;
const publico = (b, { celularCompleto }) => ({
  id: b.id, nombre: b.nombre, cargo: b.cargo, correo: b.correo, ad_usuario: b.ad_usuario, activo: Boolean(b.activo),
  celular: celularCompleto ? b.celular : (b.celular ? enmascararCelular(b.celular) : null),
  updated_at: b.updated_at, updated_by: b.updated_by,
});

/** Valida y normaliza los campos que el admin puede escribir. Lanza VALIDACION con el campo, sin repetir el valor. */
function normalizarCampos(d, { exigirNombre }) {
  const out = {};
  if (d.nombre !== undefined || exigirNombre) {
    const n = formatearNombre(d.nombre ?? '');
    if (!n) throw invalido('nombre', 'OBLIGATORIO');
    if (n.length > 150) throw invalido('nombre', 'MUY_LARGO');
    out.nombre = n;
  }
  if (d.cargo !== undefined) {
    const c = d.cargo === null ? '' : limpiar(d.cargo);
    if (c.length > 150) throw invalido('cargo', 'MUY_LARGO');
    out.cargo = c || null;
  }
  if (d.celular !== undefined) {
    if (d.celular === null || d.celular === '') out.celular = null;
    else { out.celular = normalizarCelular(d.celular); if (!out.celular) throw invalido('celular', 'CELULAR_INVALIDO'); }
  }
  if (d.correo !== undefined) {
    const c = d.correo === null ? '' : limpiar(d.correo).toLowerCase();
    if (c && (c.length > 150 || !CORREO.test(c))) throw invalido('correo', 'CORREO_INVALIDO');
    out.correo = c || null;
  }
  if (d.adUsuario !== undefined) {
    const u = d.adUsuario === null ? '' : String(d.adUsuario).trim().toLowerCase();
    if (u && !AD_USUARIO.test(u)) throw invalido('adUsuario', 'AD_USUARIO_INVALIDO');
    out.ad_usuario = u || null;
  }
  if (d.activo !== undefined) {
    if (typeof d.activo !== 'boolean') throw invalido('activo', 'ACTIVO_INVALIDO');
    out.activo = d.activo ? 1 : 0;
  }
  return out;
}

const traducirDuplicado = (err) => (err && err.code === 'ER_DUP_ENTRY' && String(err.sqlMessage || '').includes('uq_msj_beneficiarios_ad_usuario')
  ? new MasajesError(409, 'AD_USUARIO_EN_USO', 'Ese usuario del directorio ya está vinculado a otro beneficiario.')
  : err);
const { enTransaccion } = require('../utils/transaccion');

const nulo = (v) => (v === undefined || v === '' ? null : v);
const cambio = (actual, nuevo) => ['nombre', 'cargo', 'correo'].some((c) => nulo(actual[c]) !== nulo(nuevo[c]));

function crearServicioBeneficiarios({ bd }) {
  /**
   * Importa el listado. Todo o nada: si alguna fila tiene error no se escribe nada y se devuelven los errores.
   * El match con lo existente es por nombre normalizado + celular (el correo no sirve: hay buzones compartidos).
   * `simular`: calcula el resumen sin escribir. Nunca toca ad_usuario ni activo.
   */
  async function importar({ buffer, actor, simular = false } = {}) {
    if (typeof actor !== 'string' || actor.trim() === '') throw new Error('ACTOR_REQUERIDO');
    const { filas, errores, advertencias } = await leerListado(buffer);
    const resumen = { aplicado: false, creados: 0, actualizados: 0, sinCambios: 0, errores: [...errores], advertencias };
    if (resumen.errores.length) return resumen;

    return enTransaccion(bd, async (conn) => {
      const porClave = new Map();
      for (const b of await repo.listarParaImportar(conn)) {
        const clave = `${claveNombre(b.nombre)}|${b.celular || ''}`;
        porClave.set(clave, [...(porClave.get(clave) || []), b]);
      }

      // Primero se planea todo; solo si no hay errores se escribe.
      const plan = [];
      for (const f of filas) {
        const existentes = porClave.get(f.clave) || [];
        if (existentes.length > 1) resumen.errores.push({ fila: f.fila, motivo: 'COINCIDE_CON_VARIOS' });
        else if (existentes.length === 0) plan.push({ tipo: 'crear', f });
        else if (cambio(existentes[0], f)) plan.push({ tipo: 'actualizar', f, id: existentes[0].id });
        else resumen.sinCambios += 1;
      }
      if (resumen.errores.length) return { ...resumen, sinCambios: 0 };

      for (const p of plan) {
        if (p.tipo === 'crear') {
          resumen.creados += 1;
          if (!simular) await repo.insertar(conn, p.f, actor);
        } else {
          resumen.actualizados += 1;
          if (!simular) await repo.actualizarDatosListado(conn, p.id, p.f, actor);
        }
      }
      return { ...resumen, aplicado: !simular };
    });
  }

  /** Para cada petición autenticada: { id, nombre } del beneficiario activo vinculado, o null. */
  async function obtenerActivoPorUsuario(usuario) {
    if (!usuario) return null;
    return repo.obtenerActivoPorUsuario(bd.obtener(), usuario);
  }

  /**
   * Login (spec §9.3): devuelve { id, nombre } del beneficiario activo vinculado al usuario, o null.
   * Si no hay vínculo, intenta UNA autovinculación por correo, solo si:
   *  - el correo del AD es de un dominio corporativo (`dominios`),
   *  - exactamente un beneficiario en total tiene ese correo (buzones compartidos nunca), sin vincular y activo,
   *  - y el nombre de la cuenta del AD es compatible con el del beneficiario.
   * Todo en una transacción con el beneficiario bloqueado: dos logins simultáneos vinculan una sola vez.
   */
  async function resolverParaLogin({ usuario, email, nombreAd, dominios = [], auditoria = {} }) {
    if (!usuario) return null;
    return enTransaccion(bd, async (conn) => {
      const vinculado = await repo.buscarPorUsuario(conn, usuario);
      if (vinculado) return vinculado.activo ? { id: vinculado.id, nombre: vinculado.nombre } : null;

      const correo = String(email || '').trim().toLowerCase();
      const dominio = correo.includes('@') ? correo.split('@').pop() : '';
      if (!correo || !dominios.includes(dominio)) return null;

      const candidatos = await repo.porCorreoParaVincular(conn, correo);
      if (candidatos.length !== 1) return null;
      const [b] = candidatos;
      // Otro login simultáneo del mismo usuario ganó el bloqueo y ya lo vinculó.
      if (b.ad_usuario === usuario) return b.activo ? { id: b.id, nombre: b.nombre } : null;
      if (b.ad_usuario !== null || !b.activo || !nombresCompatibles(nombreAd, b.nombre)) return null;

      if (!(await repo.vincular(conn, b.id, usuario))) return null;
      await historial.registrar(conn, { beneficiarioId: b.id, accion: 'autovinculacion', usuario, auditoria });
      return { id: b.id, nombre: b.nombre };
    });
  }

  // ---- Administración (solo admin; lo exige la ruta) ----

  async function listar({ q, sinVincular, activo, pagina, porPagina } = {}) {
    const pg = paginar({ pagina, porPagina });
    const texto = typeof q === 'string' ? limpiar(q).slice(0, 100) : '';
    const r = await repo.listarAdmin(bd.obtener(), { q: texto, sinVincular, activo, ...pg });
    return { total: r.total, pagina: pg.pagina, porPagina: pg.porPagina, items: r.items.map((b) => publico(b, { celularCompleto: false })) };
  }

  /** Detalle para editar: aquí sí va el celular completo (spec §12). */
  async function obtener(id) {
    if (!esId(id)) throw E.NO_ENCONTRADA();
    const b = await repo.obtenerAdmin(bd.obtener(), id);
    if (!b) throw E.NO_ENCONTRADA();
    return publico(b, { celularCompleto: true });
  }

  async function crear({ datos = {}, actor }) {
    if (typeof actor !== 'string' || actor.trim() === '') throw new Error('ACTOR_REQUERIDO');
    const campos = normalizarCampos(datos, { exigirNombre: true });
    if (campos.ad_usuario !== undefined || campos.activo !== undefined) throw invalido('datos', 'CAMPO_NO_PERMITIDO_AL_CREAR');
    return enTransaccion(bd, async (conn) => {
      const id = await repo.insertar(conn, { nombre: campos.nombre, cargo: campos.cargo ?? null, celular: campos.celular ?? null, correo: campos.correo ?? null }, actor);
      return publico(await repo.obtenerParaModificar(conn, id), { celularCompleto: true });
    });
  }

  /** Edita y deja en historial la vinculación/desvinculación AD y la activación/desactivación. */
  async function actualizar({ id, datos = {}, actor, auditoria = {} }) {
    if (!esId(id)) throw E.NO_ENCONTRADA();
    if (typeof actor !== 'string' || actor.trim() === '') throw new Error('ACTOR_REQUERIDO');
    const campos = normalizarCampos(datos, { exigirNombre: false });
    try {
      return await enTransaccion(bd, async (conn) => {
        const antes = await repo.obtenerParaModificar(conn, id);
        if (!antes) throw E.NO_ENCONTRADA();
        await repo.actualizarAdmin(conn, id, campos, actor);
        const eventos = [];
        if ('ad_usuario' in campos && campos.ad_usuario !== antes.ad_usuario) eventos.push(campos.ad_usuario ? 'vinculacion' : 'desvinculacion');
        if ('activo' in campos && campos.activo !== Number(antes.activo)) eventos.push(campos.activo ? 'activacion' : 'desactivacion');
        for (const accion of eventos) {
          await historial.registrar(conn, { beneficiarioId: id, accion, motivo: accion === 'vinculacion' ? campos.ad_usuario : null, usuario: actor, esAdmin: true, auditoria });
        }
        return publico(await repo.obtenerParaModificar(conn, id), { celularCompleto: true });
      });
    } catch (err) {
      throw traducirDuplicado(err);
    }
  }

  return { importar, obtenerActivoPorUsuario, resolverParaLogin, listar, obtener, crear, actualizar };
}

module.exports = { crearServicioBeneficiarios };
