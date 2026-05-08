// ============================================
// r44DocumentosController — Upload y extracción IA
// POST /api/r44/documentos/:proveedor_id
// GET  /api/r44/extraccion/estado/:proveedor_id
// POST /api/r44/extraccion/resultado  (callback de n8n)
// ============================================
const path = require('path');
const { R44Proveedor, R44Documento, R44ExtraccionLlm } = require('../models');
const { notificarN8n } = require('../services/n8nService');

const r44DocumentosController = {

  /**
   * POST /api/r44/documentos/:proveedor_id
   * Guarda los archivos subidos y notifica a n8n para extracción.
   * Los archivos llegan via multerR44 (middleware previo).
   */
  async subirDocumentos(req, res, next) {
    try {
      const { proveedor_id } = req.params;
      const files = req.files || {};

      if (!files.rut || !files.camara || !files.renta || !files.cedula) {
        return res.status(400).json({ ok: false, error: 'Se requieren los 4 documentos: rut, camara, renta, cedula' });
      }

      const proveedor = await R44Proveedor.findByPk(proveedor_id);
      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }

      // Verificar que el proveedor pertenece al usuario autenticado (si es rol proveedor)
      const usuario = req.r44Usuario;
      if (usuario.rol === 'proveedor' && proveedor.usuario_id !== usuario.id) {
        return res.status(403).json({ ok: false, error: 'Sin permisos sobre este proveedor' });
      }

      // Guardar registros de documentos
      const tiposArchivos = {};
      for (const [tipo, [file]] of Object.entries(files)) {
        await R44Documento.upsert({
          proveedor_id: parseInt(proveedor_id),
          tipo_documento: tipo,
          nombre_archivo: file.originalname,
          ruta_archivo:   file.path,
          mime_type:      file.mimetype,
          tamano_bytes:   file.size,
        });
        tiposArchivos[tipo] = file.path;
      }

      // Actualizar estado del proveedor
      await proveedor.update({ estado: 'documentos_cargados' });

      // Notificar a n8n (fire and forget)
      notificarN8n(parseInt(proveedor_id), tiposArchivos);

      return res.json({
        ok: true,
        data: { proveedor_id: parseInt(proveedor_id), estado: 'documentos_cargados' },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/r44/extraccion/estado/:proveedor_id
   * El frontend hace polling a este endpoint hasta recibir 'extraccion_completada'.
   */
  async estadoExtraccion(req, res, next) {
    try {
      const { proveedor_id } = req.params;

      const proveedor = await R44Proveedor.findByPk(proveedor_id, {
        attributes: ['id', 'radicado', 'estado'],
      });

      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }

      // Verificar permisos
      const usuario = req.r44Usuario;
      if (usuario.rol === 'proveedor') {
        const full = await R44Proveedor.findByPk(proveedor_id, { attributes: ['usuario_id'] });
        if (full.usuario_id !== usuario.id) {
          return res.status(403).json({ ok: false, error: 'Sin permisos' });
        }
      }

      // Incluir datos extraídos si ya terminó
      let datosExtraidos = null;
      if (proveedor.estado === 'extraccion_completada') {
        const extraccion = await R44ExtraccionLlm.findOne({
          where: { proveedor_id: parseInt(proveedor_id) },
          order: [['created_at', 'DESC']],
          attributes: ['datos_extraidos'],
        });
        datosExtraidos = extraccion?.datos_extraidos ?? null;
      }

      return res.json({
        ok: true,
        data: {
          proveedor_id: parseInt(proveedor_id),
          estado: proveedor.estado,
          datos_extraidos: datosExtraidos,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/r44/extraccion/resultado
   * Callback recibido de n8n cuando termina la extracción IA.
   * Body: { proveedor_id, datos_extraidos, logs: [...] }
   */
  async recibirResultado(req, res, next) {
    try {
      const { proveedor_id, datos_extraidos, logs } = req.body;

      if (!proveedor_id) {
        return res.status(400).json({ ok: false, error: 'proveedor_id requerido' });
      }

      const proveedor = await R44Proveedor.findByPk(proveedor_id);
      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }

      // Guardar log de extracción consolidado
      await R44ExtraccionLlm.create({
        proveedor_id: parseInt(proveedor_id),
        tipo_documento: 'consolidado',
        estado: 'completado',
        datos_extraidos: datos_extraidos ?? {},
        tokens_usados: logs?.reduce((s, l) => s + (l.tokens ?? 0), 0) ?? null,
      });

      // Actualizar campos del proveedor con datos extraídos
      if (datos_extraidos) {
        const d = datos_extraidos;
        const updateJuridica = {
          pj_nit:                 d.nit                 ?? proveedor.pj_nit,
          pj_razon_social:        d.razon_social         ?? proveedor.pj_razon_social,
          pj_direccion:           d.direccion            ?? proveedor.pj_direccion,
          pj_ciudad:              d.ciudad               ?? proveedor.pj_ciudad,
          pj_departamento:        d.departamento         ?? proveedor.pj_departamento,
          pj_telefono:            d.telefono             ?? proveedor.pj_telefono,
          pj_correo:              d.correo               ?? proveedor.pj_correo,
          pj_ciiu:                d.ciiu                 ?? proveedor.pj_ciiu,
          pj_matricula_mercantil: d.matricula_mercantil  ?? proveedor.pj_matricula_mercantil,
        };
        await proveedor.update({ ...updateJuridica, estado: 'extraccion_completada' });

        // Actualizar representante legal si hay datos de cédula
        const { R44RepresentanteLegal } = require('../models');
        await R44RepresentanteLegal.upsert({
          proveedor_id: parseInt(proveedor_id),
          nombre:              d.rl_nombre            ?? null,
          cedula:              d.rl_cedula            ?? null,
          fecha_expedicion:    d.fecha_expedicion     ?? null,
          ciudad_expedicion:   d.ciudad_expedicion    ?? null,
          fecha_nacimiento:    d.fecha_nacimiento     ?? null,
          lugar_nacimiento:    d.lugar_nacimiento     ?? null,
          cedula_numero_serie: d.cedula_numero_serie  ?? null,
        });

        // Actualizar info financiera si hay datos de renta
        if (d.activos_totales || d.patrimonio) {
          const { R44InfoFinanciera } = require('../models');
          await R44InfoFinanciera.upsert({
            proveedor_id:           parseInt(proveedor_id),
            activos_totales:        d.activos_totales        ?? null,
            pasivos_totales:        d.pasivos_totales        ?? null,
            patrimonio:             d.patrimonio             ?? null,
            ingresos_operacionales: d.ingresos_operacionales ?? null,
            utilidad_neta:          d.utilidad_neta          ?? null,
            anio_declaracion:       d.anio_declaracion       ?? null,
          });
        }
      } else {
        await proveedor.update({ estado: 'extraccion_completada' });
      }

      return res.json({ ok: true, message: 'Resultado procesado' });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = r44DocumentosController;
