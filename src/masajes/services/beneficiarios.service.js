// Servicio de beneficiarios: importación del listado (Tarea 5) e identidad del login (Tarea 6). Altas/bajas: Tarea 11.
const repo = require('../repositorios/beneficiarios');
const historial = require('../repositorios/historial');
const { leerListado, claveNombre } = require('./listadoXlsx');
const { nombresCompatibles } = require('./auth.service');
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

  return { importar, obtenerActivoPorUsuario, resolverParaLogin };
}

module.exports = { crearServicioBeneficiarios };
