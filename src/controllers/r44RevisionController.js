// ============================================
// r44RevisionController — Dashboard de revisores
// GET   /api/r44/revisores/proveedores
// GET   /api/r44/revisores/proveedores/:id
// PATCH /api/r44/revisores/proveedores/:id/estado
// GET   /api/r44/revisores/estadisticas
// ============================================
const { Op } = require('sequelize');
const { R44Proveedor, R44Revision, R44Usuario } = require('../models');

const ROLES_REVISOR = ['revisor_compras', 'revisor_excelencia', 'admin'];

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
          { pj_razon_social:    { [Op.like]: q } },
          { pj_nit:             { [Op.like]: q } },
          { pn_nombre_completo: { [Op.like]: q } },
          { pn_cedula:          { [Op.like]: q } },
          { radicado:           { [Op.like]: q } },
        ];
      }

      const { count, rows } = await R44Proveedor.findAndCountAll({
        where,
        attributes: [
          'id','radicado','tipo_persona','estado',
          'pj_razon_social','pj_nit','pj_ciudad',
          'pn_nombre_completo','pn_cedula','pn_ciudad',
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
          { model: R44Firma,              as: 'firma', attributes: ['aceptacion_terminos','fecha_firma','ip_firma'] },
          {
            model: R44Revision, as: 'revisiones',
            include: [{ model: R44Usuario, as: 'revisor', attributes: ['nombre','rol'] }],
            order: [['created_at','DESC']],
          },
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
   * Cambia el estado de un proveedor y registra la revisión.
   * Body: { estado, observaciones }
   */
  async actualizarEstado(req, res, next) {
    try {
      const revisor = req.r44Usuario;
      const { estado, observaciones } = req.body;
      const ESTADOS_VALIDOS = ['en_revision','aprobado','rechazado'];

      if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
        return res.status(400).json({ ok: false, error: `Estado inválido. Valores: ${ESTADOS_VALIDOS.join(', ')}` });
      }

      const proveedor = await R44Proveedor.findByPk(req.params.id);
      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }

      const estadoAnterior = proveedor.estado;

      await proveedor.update({ estado });

      await R44Revision.create({
        proveedor_id:    proveedor.id,
        revisor_id:      revisor.id,
        tipo_revision:   revisor.rol === 'revisor_excelencia' ? 'excelencia' : 'compras',
        estado_anterior: estadoAnterior,
        estado_nuevo:    estado,
        observaciones:   observaciones || null,
      });

      return res.json({
        ok: true,
        data: { id: proveedor.id, radicado: proveedor.radicado, estado_anterior: estadoAnterior, estado_nuevo: estado },
      });
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
};

module.exports = r44RevisionController;
