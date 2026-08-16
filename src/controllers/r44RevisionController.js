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

// ── Helpers plantilla SARLAFT ──────────────────────────────
// Deriva el sector económico (sección DANE CIIU Rev.4) a partir del código CIIU.
function sectorEconomico(ciiu) {
  if (!ciiu) return '';
  const div = parseInt(String(ciiu).replace(/\D/g, '').slice(0, 2), 10);
  if (!div) return '';
  const secciones = [
    [1, 3, 'Agricultura, ganadería, caza, silvicultura y pesca'],
    [5, 9, 'Explotación de minas y canteras'],
    [10, 33, 'Industrias manufactureras'],
    [35, 35, 'Suministro de electricidad, gas y aire acondicionado'],
    [36, 39, 'Distribución de agua; alcantarillado y gestión de residuos'],
    [41, 43, 'Construcción'],
    [45, 47, 'Comercio al por mayor y al por menor'],
    [49, 53, 'Transporte y almacenamiento'],
    [55, 56, 'Alojamiento y servicios de comida'],
    [58, 63, 'Información y comunicaciones'],
    [64, 66, 'Actividades financieras y de seguros'],
    [68, 68, 'Actividades inmobiliarias'],
    [69, 75, 'Actividades profesionales, científicas y técnicas'],
    [77, 82, 'Actividades de servicios administrativos y de apoyo'],
    [84, 84, 'Administración pública y defensa'],
    [85, 85, 'Educación'],
    [86, 88, 'Atención de la salud humana y asistencia social'],
    [90, 93, 'Actividades artísticas, de entretenimiento y recreación'],
    [94, 96, 'Otras actividades de servicios'],
    [97, 98, 'Actividades de los hogares como empleadores'],
    [99, 99, 'Organizaciones y entidades extraterritoriales'],
  ];
  const s = secciones.find(([a, b]) => div >= a && div <= b);
  return s ? s[2] : '';
}

const fechaCorta = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

// Fila de la plantilla ADE (contrapartes) a partir de un proveedor
function filaAde(p) {
  const esPN = p.tipo_persona !== 'juridica';
  const nombresPN = [p.pn_primer_nombre, p.pn_otros_nombres].filter(Boolean).join(' ')
    || p.pn_nombre_completo || '';
  return {
    tipo_identificacion:   esPN ? (p.pn_tipo_documento || 'CC') : 'NIT',
    numero_identificacion: esPN ? (p.pn_numero_documento || '') : (p.pj_nit || ''),
    primer_apellido:       esPN ? (p.pn_primer_apellido || '') : '',
    segundo_apellido:      esPN ? (p.pn_segundo_apellido || '') : '',
    nombres:               esPN ? nombresPN : (p.pj_razon_social || ''),
    fecha_ingreso:         fechaCorta(p.created_at),
    telefono:              esPN ? (p.pn_telefono_domicilio || '') : (p.pj_telefono_fijo || ''),
    direccion:             esPN ? (p.pn_direccion_domicilio || '') : (p.pj_direccion || ''),
    activo:                'Sí',
    actividad_economica:   esPN ? (p.pn_actividad_economica || p.pn_ciiu || '')
                                : (p.pj_descripcion_actividad || p.pj_actividad_economica || ''),
    codigo_municipio:      p.municipio_codigo || '',
    email:                 esPN ? (p.pn_correo || '') : (p.pj_correo || ''),
    genero:                esPN ? (p.genero || '') : '',
    fecha_nacimiento:      esPN ? fechaCorta(p.pn_fecha_nacimiento) : '',
    estado_civil:          esPN ? (p.pn_estado_civil || '') : '',
    ocupacion:             esPN ? (p.pn_ocupacion || '') : '',
    sector_economico:      sectorEconomico(esPN ? p.pn_ciiu : p.pj_ciiu_principal),
  };
}

// Fila de la plantilla FINANCIERO a partir de un proveedor
function filaFinanciero(p) {
  const esPN = p.tipo_persona !== 'juridica';
  const f = p.financiero || {};
  return {
    nit:                 esPN ? (p.pn_numero_documento || '') : (p.pj_nit || ''),
    ingreso_principal:   f.ingresos_mensuales ?? f.total_ingresos_brutos ?? '',
    otros_ingresos:      f.otros_ingresos ?? '',
    egresos:             f.egresos_mensuales ?? '',
    activos:             f.total_activos ?? '',
    pasivos:             f.total_pasivos ?? '',
    fecha_actualizacion: fechaCorta(p.updated_at),
  };
}

// Trae los proveedores aprobados (por compras) con sus relaciones para la plantilla
async function proveedoresAprobados() {
  const { R44InfoFinanciera } = require('../models');
  return R44Proveedor.findAll({
    where: { estado: 'aprobado' },
    include: [{ model: R44InfoFinanciera, as: 'financiero' }],
    order: [['updated_at', 'DESC']],
  });
}

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

  /**
   * GET /api/r44/revisores/sarlaft
   * Plantilla SARLAFT (contrapartes ADE + financiero) de los proveedores
   * aprobados por compras. Rol: revisor_excelencia / admin.
   */
  async plantillaSarlaft(req, res, next) {
    try {
      const proveedores = await proveedoresAprobados();
      return res.json({
        ok: true,
        data: {
          ade: proveedores.map(filaAde),
          financiero: proveedores.map(filaFinanciero),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/r44/revisores/sarlaft/exportar
   * Descarga el .xlsx (hojas ADE y FINANCIERO) listo para subir al software de riesgos.
   */
  async exportarSarlaft(req, res, next) {
    try {
      const ExcelJS = require('exceljs');
      const proveedores = await proveedoresAprobados();
      const wb = new ExcelJS.Workbook();

      // ── Hoja ADE ──
      const ade = wb.addWorksheet('ADE');
      ade.mergeCells('A1:Q1');
      ade.getCell('A1').value = 'PLANTILLA ADE CON INFORMACION DE LAS CONTRAPARTES PARA SUBIR AL SOFTWARE DE RIESGOS SARLAFT';
      ade.getCell('A1').font = { bold: true };
      const adeHeaders = ['Tipo de identificación', 'Número de identificación', 'Primer apellido', 'Segundo apellido', 'Nombres', 'Fecha de ingreso(fecha de registro)', 'Teléfono', 'Dirección', 'Activo', 'Actividad económica', 'Código Municipio', 'EMail', 'Genero', 'FechaNacimiento', 'EstadoCivil', 'Ocupación', 'Sector Economico'];
      adeHeaders.forEach((h, i) => { ade.getCell(3, i + 1).value = h; });
      ade.getRow(3).font = { bold: true };
      proveedores.map(filaAde).forEach((r) => {
        ade.addRow([r.tipo_identificacion, r.numero_identificacion, r.primer_apellido, r.segundo_apellido, r.nombres, r.fecha_ingreso, r.telefono, r.direccion, r.activo, r.actividad_economica, r.codigo_municipio, r.email, r.genero, r.fecha_nacimiento, r.estado_civil, r.ocupacion, r.sector_economico]);
      });
      ade.columns.forEach((c) => { c.width = 20; });

      // ── Hoja FINANCIERO ──
      const fin = wb.addWorksheet('FINANCIERO');
      fin.mergeCells('A1:G1');
      fin.getCell('A1').value = 'PLANTILLA CON INFORMACION FINANCIERA DE LAS CONTRAPARTES PARA SUBIR AL SOFTWARE DE RIESGOS SARLAFT';
      fin.getCell('A1').font = { bold: true };
      const finHeaders = ['NIT', 'Ingreso Principal', 'Otros Ingresos', 'Egresos', 'Activos', 'Pasivos', 'Fecha Actualización'];
      finHeaders.forEach((h, i) => { fin.getCell(3, i + 1).value = h; });
      fin.getRow(3).font = { bold: true };
      proveedores.map(filaFinanciero).forEach((r) => {
        fin.addRow([r.nit, r.ingreso_principal, r.otros_ingresos, r.egresos, r.activos, r.pasivos, r.fecha_actualizacion]);
      });
      fin.columns.forEach((c) => { c.width = 20; });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="plantilla_sarlaft.xlsx"');
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      next(err);
    }
  },
};

module.exports = r44RevisionController;
