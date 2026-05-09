// ============================================
// r44DocumentosController — Upload y extracción IA
// POST /api/r44/documentos/:proveedor_id
// GET  /api/r44/extraccion/estado/:proveedor_id
// POST /api/r44/extraccion/resultado  (callback de n8n)
// ============================================
const path = require('path');
const { R44Proveedor, R44Documento, R44ExtraccionLlm } = require('../models');
const { notificarN8n } = require('../services/n8nService');

// Mapeo de fieldnames del frontend a ENUM de r44_documentos_adjuntos
const TIPO_DOCUMENTO_MAP = {
  rut:    'rut',
  camara: 'camara_comercio',
  renta:  'declaracion_renta',
  cedula: 'cedula_rl',
};

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

      if (!files.rut || !files.cedula) {
        return res.status(400).json({ ok: false, error: 'Se requieren al menos RUT y Cédula del Representante Legal' });
      }

      const proveedor = await R44Proveedor.findByPk(proveedor_id);
      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }

      const usuario = req.r44Usuario;
      if (usuario.rol === 'proveedor' && proveedor.usuario_id !== usuario.id) {
        return res.status(403).json({ ok: false, error: 'Sin permisos sobre este proveedor' });
      }

      // Guardar registros de documentos con columnas reales de la tabla
      const tiposArchivos = {};
      for (const [fieldname, [file]] of Object.entries(files)) {
        const tipoDB = TIPO_DOCUMENTO_MAP[fieldname] || fieldname;
        await R44Documento.upsert({
          proveedor_id:            parseInt(proveedor_id),
          tipo_documento:          tipoDB,
          nombre_archivo_original: file.originalname,
          nombre_archivo_storage:  file.filename,
          ruta_almacenamiento:     file.path,
          mime_type:               file.mimetype,
          tamano_bytes:            file.size,
          estado_extraccion:       'pendiente',
        });
        tiposArchivos[fieldname] = file.path;
      }

      await proveedor.update({ estado: 'documentos_cargados' });

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

      const usuario = req.r44Usuario;
      if (usuario.rol === 'proveedor') {
        const full = await R44Proveedor.findByPk(proveedor_id, { attributes: ['usuario_id'] });
        if (full.usuario_id !== usuario.id) {
          return res.status(403).json({ ok: false, error: 'Sin permisos' });
        }
      }

      let datosExtraidos = null;
      if (proveedor.estado === 'extraccion_completada') {
        const extraccion = await R44ExtraccionLlm.findOne({
          where: { proveedor_id: parseInt(proveedor_id) },
          order: [['procesado_at', 'DESC']],
          attributes: ['respuesta_json'],
        });
        datosExtraidos = extraccion?.respuesta_json ?? null;
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
   * Callback de n8n. Body: { proveedor_id, campos_r44, total_tokens, ... }
   */
  async recibirResultado(req, res, next) {
    try {
      // n8n envía campos_r44; datos_extraidos es compatibilidad hacia atrás
      const { proveedor_id, campos_r44, datos_extraidos, total_tokens, logs } = req.body;

      if (!proveedor_id) {
        return res.status(400).json({ ok: false, error: 'proveedor_id requerido' });
      }

      const proveedor = await R44Proveedor.findByPk(proveedor_id);
      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }

      const d      = campos_r44 || datos_extraidos;
      const tokens = total_tokens ?? logs?.reduce((s, l) => s + (l.tokens ?? 0), 0) ?? null;

      await R44ExtraccionLlm.create({
        proveedor_id:   parseInt(proveedor_id),
        tipo_documento: 'consolidado',
        estado:         'ok',
        respuesta_json: d ?? {},
        tokens_total:   tokens,
      });

      if (d) {
        if (proveedor.tipo_persona === 'juridica') {
          await proveedor.update({
            pj_nit:                  d.nit                      ?? proveedor.pj_nit,
            pj_razon_social:         d.razon_social             ?? proveedor.pj_razon_social,
            pj_nombre_comercial:     d.nombre_comercial         ?? proveedor.pj_nombre_comercial,
            pj_direccion:            d.direccion_principal      ?? proveedor.pj_direccion,
            pj_municipio:            d.municipio_nombre         ?? proveedor.pj_municipio,
            pj_departamento:         d.departamento_nombre      ?? proveedor.pj_departamento,
            pj_telefono_fijo:        d.telefono_1               ?? proveedor.pj_telefono_fijo,
            pj_correo:               d.correo_electronico       ?? proveedor.pj_correo,
            pj_ciiu_principal:       d.actividad_principal_ciiu ?? proveedor.pj_ciiu_principal,
            pj_ciiu_secundario:      d.actividad_secundaria_ciiu ?? proveedor.pj_ciiu_secundario,
            pj_descripcion_actividad: d.descripcion_actividad   ?? proveedor.pj_descripcion_actividad,
            pj_matricula_numero:     d.matricula_numero         ?? proveedor.pj_matricula_numero,
            pj_fecha_matricula:      d.fecha_matricula          ?? proveedor.pj_fecha_matricula,
            pj_ultimo_anio_renovado: d.ultimo_anio_renovado     ?? proveedor.pj_ultimo_anio_renovado,
            pj_grupo_niif:           d.grupo_niif               ?? proveedor.pj_grupo_niif,
            pj_tamano_empresa:       d.tamano_empresa           ?? proveedor.pj_tamano_empresa,
            estado: 'extraccion_completada',
          });
        } else {
          await proveedor.update({
            pn_numero_documento:    d.numero_identificacion    ?? d.nit               ?? proveedor.pn_numero_documento,
            pn_nombre_completo:     d.nombre_completo          ?? proveedor.pn_nombre_completo,
            pn_primer_nombre:       d.primer_nombre            ?? proveedor.pn_primer_nombre,
            pn_primer_apellido:     d.primer_apellido          ?? proveedor.pn_primer_apellido,
            pn_segundo_apellido:    d.segundo_apellido         ?? proveedor.pn_segundo_apellido,
            pn_otros_nombres:       d.otros_nombres            ?? proveedor.pn_otros_nombres,
            pn_direccion_domicilio: d.direccion_principal      ?? proveedor.pn_direccion_domicilio,
            pn_municipio_domicilio: d.municipio_nombre         ?? proveedor.pn_municipio_domicilio,
            pn_dpto_domicilio:      d.departamento_nombre      ?? proveedor.pn_dpto_domicilio,
            pn_correo:              d.correo_electronico       ?? proveedor.pn_correo,
            pn_ciiu:                d.actividad_principal_ciiu ?? proveedor.pn_ciiu,
            estado: 'extraccion_completada',
          });
        }

        const { R44RepresentanteLegal } = require('../models');
        if (d.rl_nombre || d.rl_numero_doc) {
          await R44RepresentanteLegal.upsert({
            proveedor_id:        parseInt(proveedor_id),
            nombres_apellidos:   d.rl_nombre             ?? null,
            tipo_documento:      d.rl_tipo_doc           ?? 'CC',
            numero_documento:    d.rl_numero_doc         ?? null,
            correo:              d.rl_correo             ?? null,
            telefono:            d.rl_telefono           ?? null,
            direccion_domicilio: d.rl_direccion          ?? null,
            ciudad_expedicion:   d.rl_lugar_expedicion   ?? null,
            fecha_expedicion:    d.rl_fecha_expedicion   ?? null,
            fecha_nacimiento:    d.rl_fecha_nacimiento   ?? null,
            lugar_nacimiento:    d.rl_lugar_nacimiento   ?? null,
            cedula_numero_serie: d.rl_cedula_serie       ?? null,
          });
        }

        if (d.total_activos || d.total_patrimonio) {
          const { R44InfoFinanciera } = require('../models');
          await R44InfoFinanciera.upsert({
            proveedor_id:           parseInt(proveedor_id),
            activos_totales:        d.total_activos           ?? null,
            pasivos_totales:        d.total_pasivos           ?? null,
            patrimonio:             d.total_patrimonio        ?? null,
            ingresos_operacionales: d.total_ingresos_brutos   ?? null,
            utilidad_neta:          d.utilidad_operacional    ?? null,
            anio_declaracion:       d.anio_gravable           ?? null,
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
