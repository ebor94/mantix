// ============================================
// r44ProveedorController — CRUD del formulario R-44
// POST   /api/r44/proveedores          — crear / borrador inicial
// GET    /api/r44/proveedores/mio      — formulario del proveedor autenticado
// PATCH  /api/r44/proveedores/:id      — actualizar borrador / enviar con firma
// GET    /api/r44/proveedores/:id      — detalle (revisores/admin)
// ============================================
const {
  R44Proveedor, R44RepresentanteLegal, R44Accionista,
  R44InfoFinanciera, R44RefBancaria, R44RefComercial,
  R44SarlaftDatos, R44Firma, R44Documento,
} = require('../models');

const INCLUDE_COMPLETO = [
  { model: R44RepresentanteLegal, as: 'representante_legal' },
  { model: R44Accionista,         as: 'accionistas' },
  { model: R44InfoFinanciera,     as: 'financiero' },
  { model: R44RefBancaria,        as: 'referencias_bancarias' },
  { model: R44RefComercial,       as: 'referencias_comerciales' },
  { model: R44SarlaftDatos,       as: 'sarlaft' },
  { model: R44Firma,              as: 'firma', attributes: ['acepta_tratamiento', 'acepta_declaracion', 'fecha_firma'] },
  { model: R44Documento,          as: 'documentos', attributes: ['tipo_documento', 'nombre_archivo_original', 'estado_extraccion', 'subido_at'] },
];

// Mapea financiero del frontend a columnas reales de r44_info_financiera
function mapearFinanciero(fin) {
  return {
    anio_gravable:         fin.anio_gravable         ?? fin.anio_declaracion      ?? null,
    total_activos:         fin.total_activos         ?? fin.activos_totales        ?? null,
    total_pasivos:         fin.total_pasivos         ?? fin.pasivos_totales        ?? null,
    total_patrimonio:      fin.total_patrimonio      ?? fin.patrimonio             ?? null,
    total_ingresos_brutos: fin.total_ingresos_brutos ?? fin.ingresos_operacionales ?? null,
    utilidad_operacional:  fin.utilidad_operacional  ?? fin.utilidad_neta          ?? null,
  };
}

// Mapea sarlaft del frontend a columnas reales de r44_sarlaft_datos
function mapearSarlaft(s) {
  return {
    tiene_sistema_control:       s.tiene_sistema_control       ?? null,
    tiene_cod_conducta:          s.tiene_cod_conducta          ?? false,
    tiene_manual_siplaft:        s.tiene_manual_siplaft        ?? false,
    tiene_manual_procedimientos: s.tiene_manual_procedimientos ?? false,
    tiene_manual_sarlaft:        s.tiene_manual_sarlaft        ?? false,
    maneja_recursos_publicos:    s.maneja_recursos_publicos    ?? s.maneja_efectivo          ?? null,
    es_pep:                      s.es_pep                      ?? null,
    vinculo_familiar_pep:        s.vinculo_familiar_pep        ?? s.familiar_pep             ?? null,
    opera_moneda_extranjera:     s.opera_moneda_extranjera     ?? s.operaciones_extranjero   ?? null,
    moneda_ext_cuales:           s.moneda_ext_cuales           ?? s.paises_operacion         ?? null,
    declaracion_origen_fondos:   s.declaracion_origen_fondos   ?? s.origen_fondos            ?? null,
    sancionado_laft:             s.sancionado_laft             ?? s.en_listas_restrictivas   ?? null,
  };
}

// Mapea referencia comercial del frontend a columnas reales
function mapearRefComercial(r, index) {
  return {
    orden:              r.orden              ?? (index + 1),
    empresa:            r.empresa            ?? null,
    direccion:          r.direccion          ?? null,
    telefono:           r.telefono           ?? null,
    contacto:           r.contacto           ?? null,
    ciudad:             r.ciudad             ?? null,
    actividad_relacion: r.actividad_relacion ?? r.actividad ?? null,
  };
}

// Mapea referencia bancaria del frontend a columnas reales
function mapearRefBancaria(r, index) {
  return {
    orden:         r.orden         ?? (index + 1),
    entidad:       r.entidad       ?? null,
    tipo_cuenta:   r.tipo_cuenta   ?? null,
    numero_cuenta: r.numero_cuenta ?? null,
    telefono:      r.telefono      ?? null,
    ciudad:        r.ciudad        ?? null,
  };
}

// Mapea un accionista del frontend a columnas reales de r44_accionistas
function mapearAccionista(a, index) {
  return {
    orden:                    a.orden                   ?? (index + 1),
    tipo_documento:           a.tipo_documento          ?? null,
    numero_documento:         a.numero_documento        ?? a.cedula_nit ?? null,
    razon_social_nombre:      a.razon_social_nombre     ?? a.nombre     ?? null,
    administra_rec_publicos:  a.administra_rec_publicos ?? false,
    es_pep:                   a.es_pep                  ?? false,
    porcentaje_participacion: a.porcentaje_participacion ?? a.porcentaje ?? null,
  };
}

// Mapea datos_basicos del frontend a columnas reales de r44_proveedores
function mapearCampos(tipo_persona, db) {
  const campos = {};
  if ((tipo_persona || 'juridica') === 'juridica') {
    Object.assign(campos, {
      pj_nit:                  db.nit,
      pj_dv:                   db.dv,
      pj_razon_social:         db.razon_social,
      pj_nombre_comercial:     db.nombre_comercial,
      pj_sigla:                db.sigla,
      pj_tipo_empresa:         db.tipo_empresa,
      pj_tipo_empresa_otro:    db.tipo_empresa_otro,
      pj_fecha_constitucion:   db.fecha_constitucion,
      pj_pais_constitucion:    db.pais_constitucion,
      pj_actividad_economica:  db.actividad_economica,
      pj_ciiu_principal:       db.ciiu_principal || db.ciiu,
      pj_ciiu_secundario:      db.ciiu_secundario,
      pj_descripcion_actividad:db.descripcion_actividad,
      pj_direccion:            db.direccion,
      pj_municipio:            db.municipio || db.ciudad,
      pj_departamento:         db.departamento,
      pj_telefono_fijo:        db.telefono_fijo || db.telefono,
      pj_celular:              db.celular,
      pj_correo:               db.correo,
      pj_persona_contacto:     db.persona_contacto,
      pj_tel_contacto:         db.tel_contacto || db.telefono_contacto,
      pj_matricula_numero:     db.matricula_numero || db.matricula_mercantil,
      pj_fecha_matricula:      db.fecha_matricula,
      pj_ultimo_anio_renovado: db.ultimo_anio_renovado,
      pj_grupo_niif:           db.grupo_niif,
      pj_tamano_empresa:       db.tamano_empresa,
      // campos compartidos
      productos_servicios:     db.productos_servicios,
      tiene_sistema_gestion:   db.sistema_gestion ? true : (db.tiene_sistema_gestion ?? null),
      cual_certificacion:      db.cual_certificacion || db.sistema_gestion || null,
      total_empleados:         db.total_empleados || db.empleados_total,
    });
  } else {
    Object.assign(campos, {
      pn_nombre_completo:      db.nombre_completo,
      pn_primer_apellido:      db.primer_apellido,
      pn_segundo_apellido:     db.segundo_apellido,
      pn_primer_nombre:        db.primer_nombre,
      pn_otros_nombres:        db.otros_nombres,
      pn_tipo_documento:       db.tipo_documento,
      pn_numero_documento:     db.numero_documento || db.cedula_numero,
      pn_fecha_expedicion:     db.fecha_expedicion,
      pn_lugar_expedicion:     db.lugar_expedicion,
      pn_fecha_nacimiento:     db.fecha_nacimiento,
      pn_lugar_nacimiento:     db.lugar_nacimiento,
      pn_departamento:         db.departamento_nacimiento || db.departamento,
      pn_municipio:            db.municipio_nacimiento || db.municipio,
      pn_nacionalidad:         db.nacionalidad,
      pn_direccion_domicilio:  db.direccion_domicilio || db.direccion,
      pn_municipio_domicilio:  db.municipio_domicilio || db.ciudad,
      pn_dpto_domicilio:       db.dpto_domicilio || db.departamento_domicilio,
      pn_nombre_empresa:       db.nombre_empresa,
      pn_dir_empresa:          db.dir_empresa,
      pn_municipio_empresa:    db.municipio_empresa,
      pn_dpto_empresa:         db.dpto_empresa,
      pn_telefono_domicilio:   db.telefono_domicilio || db.telefono,
      pn_telefono_empresa:     db.telefono_empresa,
      pn_estrato:              db.estrato,
      pn_ocupacion:            db.ocupacion,
      pn_estado_civil:         db.estado_civil,
      pn_actividad_economica:  db.actividad_economica,
      pn_ciiu:                 db.ciiu,
      pn_correo:               db.correo,
      // campos compartidos
      productos_servicios:     db.productos_servicios,
      tiene_sistema_gestion:   db.sistema_gestion ? true : (db.tiene_sistema_gestion ?? null),
      cual_certificacion:      db.cual_certificacion || db.sistema_gestion || null,
      total_empleados:         db.total_empleados || db.empleados_total,
    });
  }
  // Eliminar claves sin valor para no pisar con NULL innecesariamente
  Object.keys(campos).forEach(k => { if (campos[k] === undefined) delete campos[k]; });
  return campos;
}

const r44ProveedorController = {

  /**
   * POST /api/r44/proveedores
   * Crea un proveedor borrador (o devuelve el existente si ya fue creado).
   */
  async crear(req, res, next) {
    const t = await require('../models').sequelize.transaction();
    try {
      const usuario = req.r44Usuario;
      const { tipo_persona, datos_basicos, representante_legal, accionistas,
              financiero, referencias_bancarias, referencias_comerciales,
              sarlaft, firma } = req.body;

      const db = datos_basicos || {};
      const tp = tipo_persona || 'juridica';
      const esFirmaCompleta = firma?.base64 && firma?.aceptacion_terminos;

      const camposProveedor = {
        usuario_id:  usuario.id,
        tipo_persona: tp,
        ...mapearCampos(tp, db),
      };

      const [proveedor] = await R44Proveedor.findOrCreate({
        where:    { usuario_id: usuario.id },
        defaults: camposProveedor,
        transaction: t,
      });
      const pid = proveedor.id;

      if (representante_legal) {
        await R44RepresentanteLegal.create({ proveedor_id: pid, ...representante_legal }, { transaction: t });
      }

      if (Array.isArray(accionistas) && accionistas.length) {
        await R44Accionista.bulkCreate(
          accionistas.map((a, i) => ({ proveedor_id: pid, ...mapearAccionista(a, i) })),
          { transaction: t }
        );
      }

      if (financiero) {
        await R44InfoFinanciera.create({ proveedor_id: pid, ...mapearFinanciero(financiero) }, { transaction: t });
      }

      if (Array.isArray(referencias_bancarias) && referencias_bancarias.length) {
        await R44RefBancaria.bulkCreate(
          referencias_bancarias.slice(0, 2).map((r, i) => ({ proveedor_id: pid, ...mapearRefBancaria(r, i) })),
          { transaction: t }
        );
      }

      if (Array.isArray(referencias_comerciales) && referencias_comerciales.length) {
        await R44RefComercial.bulkCreate(
          referencias_comerciales.slice(0, 2).map((r, i) => ({ proveedor_id: pid, ...mapearRefComercial(r, i) })),
          { transaction: t }
        );
      }

      if (sarlaft) {
        await R44SarlaftDatos.create({ proveedor_id: pid, ...mapearSarlaft(sarlaft) }, { transaction: t });
      }

      if (esFirmaCompleta) {
        const ip = req.ip || req.headers['x-forwarded-for'] || null;
        await R44Firma.create({
          proveedor_id:       pid,
          firma_electronica:  firma.base64,
          acepta_tratamiento: true,
          acepta_declaracion: true,
          ip_firma:           ip,
          fecha_firma:        new Date(),
        }, { transaction: t });
        await proveedor.update({ estado: 'en_revision' }, { transaction: t });
      }

      await t.commit();
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
      const ESTADOS_EDITABLES = ['borrador', 'documentos_cargados', 'extraccion_completada'];
      if (!ESTADOS_EDITABLES.includes(proveedor.estado)) {
        return res.status(409).json({ ok: false, error: 'El formulario ya fue enviado y no puede modificarse' });
      }

      const db = datos_basicos || {};
      const tp = tipo_persona || proveedor.tipo_persona;
      const esFirmaCompleta = firma?.base64 && firma?.aceptacion_terminos;

      const camposProveedor = {
        tipo_persona: tp,
        ...mapearCampos(tp, db),
      };
      if (esFirmaCompleta) camposProveedor.estado = 'en_revision';

      await proveedor.update(camposProveedor, { transaction: t });
      const pid = proveedor.id;

      if (representante_legal) {
        const [rl] = await R44RepresentanteLegal.findOrCreate({ where: { proveedor_id: pid }, transaction: t });
        await rl.update(representante_legal, { transaction: t });
      }

      if (Array.isArray(accionistas)) {
        await R44Accionista.destroy({ where: { proveedor_id: pid }, transaction: t });
        if (accionistas.length) {
          await R44Accionista.bulkCreate(
            accionistas.map((a, i) => ({ proveedor_id: pid, ...mapearAccionista(a, i) })),
            { transaction: t }
          );
        }
      }

      if (financiero) {
        const [fin] = await R44InfoFinanciera.findOrCreate({ where: { proveedor_id: pid }, transaction: t });
        await fin.update(mapearFinanciero(financiero), { transaction: t });
      }

      if (Array.isArray(referencias_bancarias)) {
        await R44RefBancaria.destroy({ where: { proveedor_id: pid }, transaction: t });
        const refs = referencias_bancarias.slice(0, 2);
        if (refs.length) {
          await R44RefBancaria.bulkCreate(
            refs.map((r, i) => ({ proveedor_id: pid, ...mapearRefBancaria(r, i) })),
            { transaction: t }
          );
        }
      }

      if (Array.isArray(referencias_comerciales)) {
        await R44RefComercial.destroy({ where: { proveedor_id: pid }, transaction: t });
        const refs = referencias_comerciales.slice(0, 2);
        if (refs.length) {
          await R44RefComercial.bulkCreate(
            refs.map((r, i) => ({ proveedor_id: pid, ...mapearRefComercial(r, i) })),
            { transaction: t }
          );
        }
      }

      if (sarlaft) {
        const [sar] = await R44SarlaftDatos.findOrCreate({ where: { proveedor_id: pid }, transaction: t });
        await sar.update(mapearSarlaft(sarlaft), { transaction: t });
      }

      if (esFirmaCompleta) {
        const ip = req.ip || req.headers['x-forwarded-for'] || null;
        const [fir] = await R44Firma.findOrCreate({ where: { proveedor_id: pid }, transaction: t });
        await fir.update({
          firma_electronica:  firma.base64,
          acepta_tratamiento: true,
          acepta_declaracion: true,
          ip_firma:           ip,
          fecha_firma:        new Date(),
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
