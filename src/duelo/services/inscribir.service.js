// Orquesta una inscripción: validar → procesar y guardar fotos → insertar. Si algo falla después de
// escribir archivos, los borra. El correo se dispara aparte, después de responder al usuario.
const DueloError = require('../utils/DueloError');
const { validarInscripcion } = require('../dominio/validaciones');
const { EVENTO } = require('../dominio/evento');

const MENSAJE_VALIDACION = 'Revisa los datos marcados e inténtalo de nuevo.';
const MENSAJE_CERRADAS = 'Las inscripciones para este encuentro ya cerraron. Gracias por tu interés 🐾';

const yaInscrito = (config) => new DueloError(409, 'CEDULA_DUPLICADA',
  `Ya tenemos tu inscripción 🐾. Si necesitas corregir un dato o cambiar una foto, escríbenos a ${config.contacto}.`);

function crearServicioInscripcion({ repo, fotos, obtenerConfig, notificar }) {
  async function inscribir({ cuerpo, archivos = {}, ip = null, userAgent = null }) {
    const config = obtenerConfig();
    if (!config.abiertas) throw new DueloError(403, 'CERRADAS', MENSAJE_CERRADAS);

    const ordenesConFoto = new Set(Object.keys(archivos).map(Number));
    const v = validarInscripcion(cuerpo, { versionPolitica: config.versionPolitica, ordenesConFoto });
    if (!v.ok) throw new DueloError(422, 'VALIDACION', MENSAJE_VALIDACION, v.errores);

    if (await repo.existeCedula(v.datos.cedula)) throw yaInscrito(config);

    const guardadas = [];
    try {
      const companeros = [];
      for (const c of v.datos.companeros) {
        let jpg;
        try {
          jpg = await fotos.procesar(archivos[c.orden]);
        } catch (err) {
          throw new DueloError(422, 'VALIDACION', MENSAJE_VALIDACION, { [`companero_${c.orden}_foto`]: err.message });
        }
        const { nombre, bytes } = await fotos.guardar(jpg);
        guardadas.push(nombre);
        companeros.push({ orden: c.orden, nombre: c.nombre, foto_ruta: nombre, foto_mime: 'image/jpeg', foto_bytes: bytes });
      }
      const { companeros: _descartados, ...datos } = v.datos;
      const id = await repo.crear({ ...datos, ip, user_agent: userAgent }, companeros);
      return { id, datos: v.datos };
    } catch (err) {
      await fotos.borrar(guardadas);
      if (err.motivo === 'CEDULA_DUPLICADA') throw yaInscrito(config);
      throw err;
    }
  }

  async function notificarInscripcion(id, datos) {
    const resultado = await notificar(obtenerConfig().correo, {
      nombre: datos.nombre_completo,
      correo: datos.correo,
      companeros: datos.companeros.map((c) => c.nombre),
      evento: EVENTO,
    });
    await repo.marcarCorreo(id, resultado.enviado, resultado.error);
  }

  return { inscribir, notificarInscripcion };
}

module.exports = { crearServicioInscripcion };
