// ============================================
// r44RevisionController — Dashboard de revisores
// GET   /api/r44/revisores/proveedores
// GET   /api/r44/revisores/proveedores/:id
// PATCH /api/r44/revisores/proveedores/:id/estado
// GET   /api/r44/revisores/estadisticas
// ============================================
const { Op } = require('sequelize');
const fs = require('fs');
const { R44Proveedor, R44Revision, R44Documento } = require('../models');

const r44RevisionController = {

  /**
   * GET /api/r44/revisores/proveedores
   * Lista de proveedores para el dashboard de revisión.
   * Query params: estado, busqueda, page, limit
   */
  async listar(req, res, next) {
    try {
      const { estado, busqueda, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const where = {};
      if (estado) where.estado = estado;

      if (busqueda) {
        const q = `%${busqueda}%`;
        where[Op.or] = [
          { pj_razon_social:        { [Op.like]: q } },
          { pj_nit:                 { [Op.like]: q } },
          { pn_nombre_completo:     { [Op.like]: q } },
          { pn_numero_documento:    { [Op.like]: q } },
          { radicado:               { [Op.like]: q } },
        ];
      }

      const { count, rows } = await R44Proveedor.findAndCountAll({
        where,
        attributes: [
          'id','radicado','anio_vinculacion','tipo_persona','estado',
          'pj_razon_social','pj_nit','pj_municipio',
          'pn_nombre_completo','pn_numero_documento','pn_municipio_domicilio',
          'created_at',
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset,
      });

      return res.json({
        ok: true,
        data: rows,
        meta: { total: count, page: parseInt(page), limit: parseInt(limit) },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/r44/revisores/proveedores/:id
   * Detalle completo para el revisor.
   */
  async detalle(req, res, next) {
    try {
      const { R44RepresentanteLegal, R44Accionista, R44InfoFinanciera,
              R44RefBancaria, R44RefComercial, R44SarlaftDatos, R44Firma } = require('../models');

      const proveedor = await R44Proveedor.findByPk(req.params.id, {
        include: [
          { model: R44RepresentanteLegal, as: 'representante_legal' },
          { model: R44Accionista,         as: 'accionistas' },
          { model: R44InfoFinanciera,     as: 'financiero' },
          { model: R44RefBancaria,        as: 'referencias_bancarias' },
          { model: R44RefComercial,       as: 'referencias_comerciales' },
          { model: R44SarlaftDatos,       as: 'sarlaft' },
          { model: R44Firma,              as: 'firma',
            attributes: ['acepta_tratamiento','acepta_declaracion','fecha_firma','ip_firma',
                         'nombre_firmante','documento_firmante','ciudad_firma','firma_electronica'] },
          { model: R44Documento,          as: 'documentos',
            attributes: ['id','tipo_documento','nombre_archivo_original','mime_type','estado_extraccion','subido_at','drive_url'] },
          { model: R44Revision,           as: 'revision' },
        ],
      });

      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }

      return res.json({ ok: true, data: proveedor });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/r44/revisores/proveedores/:id/estado
   * Cambia el estado del proveedor y registra/actualiza la revisión.
   * Body: { estado, observaciones }
   */
  async actualizarEstado(req, res, next) {
    try {
      const revisor = req.r44Usuario;
      const { estado, observaciones } = req.body;
      const ESTADOS_VALIDOS = ['pendiente_revision','aprobado','rechazado','requiere_correccion'];

      if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({ ok: false, error: `Estado inválido. Valores: ${ESTADOS_VALIDOS.join(', ')}` });
      }

      const proveedor = await R44Proveedor.findByPk(req.params.id);
      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }

      const estadoAnterior = proveedor.estado;
      await proveedor.update({ estado });

      // Mapear estado del proveedor al ENUM de resultado_verificacion
      const resultadoMap = { aprobado: 'aceptado', rechazado: 'rechazado', pendiente_revision: 'pendiente', requiere_correccion: 'pendiente' };
      await R44Revision.upsert({
        proveedor_id:             proveedor.id,
        resultado_verificacion:   resultadoMap[estado] ?? 'pendiente',
        funcionario_verificacion: revisor.nombre || revisor.correo,
        fecha_verificacion:       new Date(),
        observaciones:            observaciones || null,
      });

      return res.json({
        ok: true,
        data: {
          id: proveedor.id,
          radicado: proveedor.radicado,
          estado_anterior: estadoAnterior,
          estado_nuevo: estado,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/r44/revisores/documentos/:id/descargar
   * Sirve el archivo adjunto (RUT, Cámara, Renta, Cédula) desde disco.
   * Solo revisores/admin. Se muestra inline (PDF/imagen) en el navegador.
   */
  async descargarDocumento(req, res, next) {
    try {
      const doc = await R44Documento.findByPk(req.params.id);
      if (!doc) {
        return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
      }
      const ruta = doc.ruta_almacenamiento;
      if (!ruta || !fs.existsSync(ruta)) {
        return res.status(404).json({ ok: false, error: 'El archivo no está disponible en el servidor' });
      }
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition',
        `inline; filename="${doc.nombre_archivo_original || ('documento_' + doc.id)}"`);
      fs.createReadStream(ruta).pipe(res);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/r44/revisores/estadisticas
   * Resumen ejecutivo del módulo.
   */
  async estadisticas(req, res, next) {
    try {
      const { sequelize } = require('../models');
      const [rows] = await sequelize.query('SELECT * FROM v_r44_estadisticas LIMIT 1');
      return res.json({ ok: true, data: rows[0] ?? {} });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/r44/revisores/indicadores
   * Indicadores para gerencia: agregados por año, estado y tipo de persona.
   */
  async indicadores(req, res, next) {
    try {
      const { sequelize } = require('../models');
      const [rows] = await sequelize.query(`
        SELECT COALESCE(anio_vinculacion, YEAR(created_at)) AS anio,
               estado,
               tipo_persona,
               COUNT(*) AS total
        FROM r44_proveedores
        GROUP BY COALESCE(anio_vinculacion, YEAR(created_at)), estado, tipo_persona
      `);

      const data = rows.map(r => ({
        anio: r.anio != null ? Number(r.anio) : null,
        estado: r.estado || 'sin_estado',
        tipo_persona: r.tipo_persona || 'sin_tipo',
        total: Number(r.total),
      }));

      const sum = (arr) => arr.reduce((s, x) => s + x.total, 0);
      const groupCount = (arr, key) => arr.reduce((m, x) => {
        const k = x[key];
        m[k] = (m[k] || 0) + x.total;
        return m;
      }, {});

      const total = sum(data);
      const por_estado = groupCount(data, 'estado');
      const por_anio = groupCount(data, 'anio');
      const por_tipo = groupCount(data, 'tipo_persona');

      const anios = [...new Set(data.map(d => d.anio).filter(a => a != null))].sort((a, b) => b - a);

      const aprobados = por_estado['aprobado'] || 0;
      const rechazados = por_estado['rechazado'] || 0;
      const pendientes = por_estado['pendiente_revision'] || 0;
      const correccion = por_estado['requiere_correccion'] || 0;
      const en_proceso = (por_estado['borrador'] || 0)
        + (por_estado['documentos_cargados'] || 0)
        + (por_estado['extraccion_completada'] || 0);
      const decididos = aprobados + rechazados;

      return res.json({
        ok: true,
        data: {
          total,
          anios,
          por_estado,
          por_anio,
          por_tipo,
          matriz: data,            // [{anio, estado, tipo_persona, total}] para filtrar en el front
          kpis: {
            aprobados,
            rechazados,
            pendientes,
            correccion,
            en_proceso,
            tasa_aprobacion: decididos ? Math.round((aprobados / decididos) * 100) : null,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = r44RevisionController;
