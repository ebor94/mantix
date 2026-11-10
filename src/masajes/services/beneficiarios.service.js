// Servicio de beneficiarios: importación del listado (Tarea 5). Vinculación AD y altas/bajas: Tareas 6 y 11.
const repo = require('../repositorios/beneficiarios');
const { leerListado, claveNombre } = require('./listadoXlsx');
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

  return { importar };
}

module.exports = { crearServicioBeneficiarios };
