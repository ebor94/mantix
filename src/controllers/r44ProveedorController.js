// ============================================
// r44ProveedorController — CRUD del formulario R-44
// POST /api/r44/proveedores          — crear / enviar formulario completo
// GET  /api/r44/proveedores/mio      — formulario del proveedor autenticado
// GET  /api/r44/proveedores/:id      — detalle (revisores/admin)
// ============================================
const {
  R44Proveedor, R44RepresentanteLegal, R44Accionista,
  R44InfoFinanciera, R44RefBancaria, R44RefComercial,
  R44SarlaftDatos, R44Firma, R44Documento,
} = require('../models');

// Includes completos para respuesta detallada
const INCLUDE_COMPLETO = [
  { model: R44RepresentanteLegal, as: 'representante_legal' },
  { model: R44Accionista,         as: 'accionistas' },
  { model: R44InfoFinanciera,     as: 'financiero' },
  { model: R44RefBancaria,        as: 'referencias_bancarias' },
  { model: R44RefComercial,       as: 'referencias_comerciales' },
  { model: R44SarlaftDatos,       as: 'sarlaft' },
  { model: R44Firma,              as: 'firma', attributes: ['aceptacion_terminos', 'fecha_firma'] },
  { model: R44Documento,          as: 'documentos', attributes: ['tipo_documento', 'nombre_archivo', 'created_at'] },
];

const r44ProveedorController = {

  /**
   * POST /api/r44/proveedores
   * Crea un proveedor borrador o envía el formulario completo.
   * Si lleva firma y aceptacion_terminos, el formulario se considera enviado.
   */
  async crear(req, res, next) {
    const t = await require('../models').sequelize.transaction();
    try {
      const usuario = req.r44Usuario;
      const { tipo_persona, datos_basicos, representante_legal, accionistas,
              financiero, referencias_bancarias, referencias_comerciales,
              sarlaft, firma } = req.body;

      const db = datos_basicos || {};
      const esFirmaCompleta = firma?.base64 && firma?.aceptacion_terminos;

      // Mapear datos_basicos según tipo_persona
      const camposProveedor = { usuario_id: usuario.id, tipo_persona: tipo_persona || 'juridica' };
      if ((tipo_persona || 'juridica') === 'juridica') {
        Object.assign(camposProveedor, {
          pj_nit:                 db.nit,
          pj_razon_social:        db.razon_social,
          pj_nombre_comercial:    db.nombre_comercial,
          pj_tipo_empresa:        db.tipo_empresa,
          pj_direccion:           db.direccion,
          pj_ciudad:              db.ciudad,
          pj_departamento:        db.departamento,
          pj_telefono:            db.telefono,
          pj_correo:              db.correo,
          pj_pagina_web:          db.pagina_web,
          pj_ciiu:                db.ciiu,
          pj_matricula_mercantil: db.matricula_mercantil,
          pj_persona_contacto:    db.persona_contacto,
          pj_telefono_contacto:   db.telefono_contacto,
          pj_productos_servicios: db.productos_servicios,
          pj_empleados_total:     db.empleados_total,
          pj_sistema_gestion:     db.sistema_gestion,
        });
      } else {
        Object.assign(camposProveedor, {
          pn_cedula:              db.cedula_numero,
          pn_nombre_completo:     db.nombre_completo,
          pn_direccion:           db.direccion,
          pn_ciudad:              db.ciudad,
          pn_departamento:        db.departamento,
          pn_telefono:            db.telefono,
          pn_correo:              db.correo,
          pn_ciiu:                db.ciiu,
          pn_persona_contacto:    db.persona_contacto,
          pn_telefono_contacto:   db.telefono_contacto,
          pn_productos_servicios: db.productos_servicios,
        });
      }

      // Crear proveedor (el trigger MySQL asigna el radicado)
      // Filtrar undefined para evitar que ENUM/INT reciban '' en MySQL strict mode
      Object.keys(camposProveedor).forEach(k => { if (camposProveedor[k] === undefined) delete camposProveedor[k]; });
      const proveedor = await R44Proveedor.create(camposProveedor, { transaction: t });
      const pid = proveedor.id;

      // Representante legal
      if (representante_legal) {
        await R44RepresentanteLegal.create({ proveedor_id: pid, ...representante_legal }, { transaction: t });
      }

      // Accionistas
      if (Array.isArray(accionistas) && accionistas.length) {
        await R44Accionista.bulkCreate(accionistas.map(a => ({ proveedor_id: pid, ...a })), { transaction: t });
      }

      // Financiero
      if (financiero) {
        await R44InfoFinanciera.create({ proveedor_id: pid, ...financiero }, { transaction: t });
      }

      // Referencias bancarias (máx. 2)
      if (Array.isArray(referencias_bancarias) && referencias_bancarias.length) {
        const refs = referencias_bancarias.slice(0, 2);
        await R44RefBancaria.bulkCreate(refs.map(r => ({ proveedor_id: pid, ...r })), { transaction: t });
      }

      // Referencias comerciales (máx. 2)
      if (Array.isArray(referencias_comerciales) && referencias_comerciales.length) {
        const refs = referencias_comerciales.slice(0, 2);
        await R44RefComercial.bulkCreate(refs.map(r => ({ proveedor_id: pid, ...r })), { transaction: t });
      }

      // SARLAFT
      if (sarlaft) {
        await R44SarlaftDatos.create({ proveedor_id: pid, ...sarlaft }, { transaction: t });
      }

      // Firma
      if (esFirmaCompleta) {
        const ip = req.ip || req.headers['x-forwarded-for'] || null;
        await R44Firma.create({
          proveedor_id:        pid,
          firma_electronica:   firma.base64,
          aceptacion_terminos: true,
          ip_firma:            ip,
          fecha_firma:         new Date(),
        }, { transaction: t });

        await proveedor.update({ estado: 'en_revision' }, { transaction: t });
      }

      await t.commit();

      // Recargar para obtener el radicado generado por el trigger
      await proveedor.reload();

      return res.status(201).json({
        ok: true,
        data: { id: proveedor.id, radicado: proveedor.radicado, estado: proveedor.estado },
      });
    } catch (err) {
      await t.rollback();
      next(err);
    }
  },

  /**
   * GET /api/r44/proveedores/mio
   * Retorna el formulario del proveedor autenticado.
   */
  async miFormulario(req, res, next) {
    try {
      const usuario = req.r44Usuario;
      const proveedor = await R44Proveedor.findOne({
        where: { usuario_id: usuario.id },
        include: INCLUDE_COMPLETO,
        order: [['created_at', 'DESC']],
      });

      if (!proveedor) {
        return res.json({ ok: true, data: null });
      }

      return res.json({ ok: true, data: proveedor });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/r44/proveedores/:id
   * Actualiza un formulario R-44 en estado 'borrador'.
   * Solo el proveedor dueño puede modificarlo.
   * Si el payload incluye firma completa, cambia estado a 'en_revision'.
   */
  async actualizar(req, res, next) {
    const t = await require('../models').sequelize.transaction();
    try {
      const usuario = req.r44Usuario;
      const { id } = req.params;
      const { tipo_persona, datos_basicos, representante_legal, accionistas,
              financiero, referencias_bancarias, referencias_comerciales,
              sarlaft, firma } = req.body;

      const proveedor = await R44Proveedor.findByPk(id);
      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }
      if (proveedor.usuario_id !== usuario.id) {
        return res.status(403).json({ ok: false, error: 'Sin permisos para modificar este formulario' });
      }
      if (proveedor.estado !== 'borrador') {
        return res.status(409).json({ ok: false, error: 'El formulario ya fue enviado y no puede modificarse' });
      }

      const db = datos_basicos || {};
      const tp = tipo_persona || proveedor.tipo_persona;
      const esFirmaCompleta = firma?.base64 && firma?.aceptacion_terminos;

      const camposProveedor = { tipo_persona: tp };
      if (tp === 'juridica') {
        Object.assign(camposProveedor, {
          pj_nit:                 db.nit,
          pj_razon_social:        db.razon_social,
          pj_nombre_comercial:    db.nombre_comercial,
          pj_tipo_empresa:        db.tipo_empresa,
          pj_direccion:           db.direccion,
          pj_ciudad:              db.ciudad,
          pj_departamento:        db.departamento,
          pj_telefono:            db.telefono,
          pj_correo:              db.correo,
          pj_pagina_web:          db.pagina_web,
          pj_ciiu:                db.ciiu,
          pj_matricula_mercantil: db.matricula_mercantil,
          pj_persona_contacto:    db.persona_contacto,
          pj_telefono_contacto:   db.telefono_contacto,
          pj_productos_servicios: db.productos_servicios,
          pj_empleados_total:     db.empleados_total,
          pj_sistema_gestion:     db.sistema_gestion,
        });
      } else {
        Object.assign(camposProveedor, {
          pn_cedula:              db.cedula_numero,
          pn_nombre_completo:     db.nombre_completo,
          pn_direccion:           db.direccion,
          pn_ciudad:              db.ciudad,
          pn_departamento:        db.departamento,
          pn_telefono:            db.telefono,
          pn_correo:              db.correo,
          pn_ciiu:                db.ciiu,
          pn_persona_contacto:    db.persona_contacto,
          pn_telefono_contacto:   db.telefono_contacto,
          pn_productos_servicios: db.productos_servicios,
        });
      }

      if (esFirmaCompleta) camposProveedor.estado = 'en_revision';
      Object.keys(camposProveedor).forEach(k => { if (camposProveedor[k] === undefined) delete camposProveedor[k]; });
      await proveedor.update(camposProveedor, { transaction: t });
      const pid = proveedor.id;

      if (representante_legal) {
        const [rl] = await R44RepresentanteLegal.findOrCreate({ where: { proveedor_id: pid }, transaction: t });
        await rl.update(representante_legal, { transaction: t });
      }

      if (Array.isArray(accionistas)) {
        await R44Accionista.destroy({ where: { proveedor_id: pid }, transaction: t });
        if (accionistas.length) {
          await R44Accionista.bulkCreate(accionistas.map(a => ({ proveedor_id: pid, ...a })), { transaction: t });
        }
      }

      if (financiero) {
        const [fin] = await R44InfoFinanciera.findOrCreate({ where: { proveedor_id: pid }, transaction: t });
        await fin.update(financiero, { transaction: t });
      }

      if (Array.isArray(referencias_bancarias)) {
        await R44RefBancaria.destroy({ where: { proveedor_id: pid }, transaction: t });
        const refs = referencias_bancarias.slice(0, 2);
        if (refs.length) {
          await R44RefBancaria.bulkCreate(refs.map(r => ({ proveedor_id: pid, ...r })), { transaction: t });
        }
      }

      if (Array.isArray(referencias_comerciales)) {
        await R44RefComercial.destroy({ where: { proveedor_id: pid }, transaction: t });
        const refs = referencias_comerciales.slice(0, 2);
        if (refs.length) {
          await R44RefComercial.bulkCreate(refs.map(r => ({ proveedor_id: pid, ...r })), { transaction: t });
        }
      }

      if (sarlaft) {
        const [sar] = await R44SarlaftDatos.findOrCreate({ where: { proveedor_id: pid }, transaction: t });
        await sar.update(sarlaft, { transaction: t });
      }

      if (esFirmaCompleta) {
        const ip = req.ip || req.headers['x-forwarded-for'] || null;
        const [fir] = await R44Firma.findOrCreate({ where: { proveedor_id: pid }, transaction: t });
        await fir.update({
          firma_electronica:   firma.base64,
          aceptacion_terminos: true,
          ip_firma:            ip,
          fecha_firma:         new Date(),
        }, { transaction: t });
      }

      await t.commit();
      await proveedor.reload();

      return res.json({
        ok: true,
        data: { id: proveedor.id, radicado: proveedor.radicado, estado: proveedor.estado },
      });
    } catch (err) {
      await t.rollback();
      next(err);
    }
  },

  /**
   * GET /api/r44/proveedores/:id
   * Revisores/admin acceden al detalle completo.
   */
  async getById(req, res, next) {
    try {
      const proveedor = await R44Proveedor.findByPk(req.params.id, {
        include: INCLUDE_COMPLETO,
      });
      if (!proveedor) {
        return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
      }
      return res.json({ ok: true, data: proveedor });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = r44ProveedorController;
