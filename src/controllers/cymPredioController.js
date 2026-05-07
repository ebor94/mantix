const { Op } = require('sequelize');
const {
  CymPredio, CymContrato, CymAsignacion, CymMantenimiento,
  CymPareja, CymParejaMiembro,
  CymChecklist, CymEvidencia, CymActividad, CymHistoricoSq, Usuario, AuditLog
} = require('../models');
const AppError = require('../utils/AppError');

// Convierte string vacío a null para campos DATE — evita 'Invalid date' en MySQL
const d = v => (v === '' || v === undefined ? null : v);

// Detecta cambios en seres queridos y retorna registros a insertar en el historial
function detectarCambiosSq(antes, body, predioId, usuarioId) {
  const prefijos = ['sq', 'sq2', 'sq3'];
  const cambios = [];
  for (let i = 0; i < prefijos.length; i++) {
    const pre = prefijos[i];
    const pos = i + 1;
    const cedOld = antes[`${pre}_cedula`] || null;
    const nomOld = antes[`${pre}_nombre`] || null;
    const cedNew = body[`${pre}_cedula`]  || null;
    const nomNew = body[`${pre}_nombre`]  || null;
    if (cedOld !== cedNew || nomOld !== nomNew) {
      cambios.push({
        predio_id:       predioId,
        posicion:        pos,
        cedula_ant:      cedOld,
        nombre_ant:      nomOld,
        fecha_nac_ant:   antes[`${pre}_fecha_nac`]  || null,
        fecha_fall_ant:  antes[`${pre}_fecha_fall`] || null,
        fecha_inhum_ant: antes[`${pre}_fecha_inhum`]|| null,
        cedula_nue:      cedNew,
        nombre_nue:      nomNew,
        fecha_nac_nue:   body[`${pre}_fecha_nac`]   || null,
        fecha_fall_nue:  body[`${pre}_fecha_fall`]  || null,
        fecha_inhum_nue: body[`${pre}_fecha_inhum`] || null,
        motivo:          body.motivo_cambio_sq       || null,
        usuario_id:      usuarioId
      });
    }
  }
  return cambios;
}

// Devuelve contratos cuyo estado es activo o vencido dentro del período de gracia (60 días)
function whereContratoVigente() {
  const limite = new Date();
  limite.setDate(limite.getDate() - 60);
  return {
    estado: { [Op.in]: ['activo', 'vencido'] },
    [Op.or]: [
      { estado: 'activo' },
      { estado: 'vencido', fecha_vencimiento: { [Op.gte]: limite } }
    ]
  };
}

const cymPredioController = {
  async getAll(req, res, next) {
    try {
      const usuario    = req.usuario;
      const rolNombre  = usuario.rol?.nombre;
      const esSuperAdmin = usuario.es_super_admin;

      // Paginación
      const q      = req.query.q?.trim() || '';
      const limite = Math.min(parseInt(req.query.limite) || 50, 200);
      const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
      const offset = (pagina - 1) * limite;

      // Búsqueda de texto en todos los campos de seres queridos y ubicación
      const whereSearch = q ? {
        [Op.or]: [
          { sector:      { [Op.like]: `%${q}%` } },
          { numero_lote: { [Op.like]: `%${q}%` } },
          { sq_cedula:   { [Op.like]: `%${q}%` } },
          { sq_nombre:   { [Op.like]: `%${q}%` } },
          { sq2_cedula:  { [Op.like]: `%${q}%` } },
          { sq2_nombre:  { [Op.like]: `%${q}%` } },
          { sq3_cedula:  { [Op.like]: `%${q}%` } },
          { sq3_nombre:  { [Op.like]: `%${q}%` } },
        ]
      } : {};

      let includeAsignacion = {
        model: CymAsignacion,
        as: 'asignacion',
        required: false,
        include: [
          { model: Usuario, as: 'coordinador', attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'supervisor',  attributes: ['id','nombre','apellido'] },
          { model: Usuario, as: 'aux_cartera', attributes: ['id','nombre','apellido'] },
          {
            model: CymPareja, as: 'pareja',
            include: [{
              model: CymParejaMiembro, as: 'miembros',
              where: { activo: true }, required: false,
              include: [{ model: Usuario, as: 'operario', attributes: ['id','nombre','apellido'] }]
            }]
          }
        ]
      };

      if (!esSuperAdmin && rolNombre === 'supervisor_cym') {
        includeAsignacion.required = true;
        includeAsignacion.where = { supervisor_id: usuario.id };
      } else if (!esSuperAdmin && rolNombre === 'auxiliar_cartera_cym') {
        includeAsignacion.required = true;
        includeAsignacion.where = { aux_cartera_id: usuario.id };
      }

      const whereContratoFilter =
        (!esSuperAdmin && (rolNombre === 'supervisor_cym' || rolNombre === 'auxiliar_cartera_cym'))
          ? { where: whereContratoVigente(), required: true }
          : { required: false };

      const { count, rows } = await CymPredio.findAndCountAll({
        where: whereSearch,
        include: [
          {
            model: CymContrato,
            as: 'contratos',
            ...whereContratoFilter,
            order: [['fecha_contratacion', 'DESC']],
            limit: 1
          },
          includeAsignacion
        ],
        order: [['sector', 'ASC'], ['numero_lote', 'ASC']],
        limit: limite,
        offset,
        distinct: true
      });

      res.json({
        success: true,
        data: rows,
        meta: { total: count, pagina, limite, totalPaginas: Math.ceil(count / limite) || 1 }
      });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.id, {
        include: [
          {
            model: CymContrato,
            as: 'contratos',
            order: [['fecha_contratacion', 'DESC']]
          },
          {
            model: CymAsignacion,
            as: 'asignacion',
            include: [
              { model: Usuario, as: 'coordinador', attributes: ['id','nombre','apellido','email'] },
              { model: Usuario, as: 'supervisor',  attributes: ['id','nombre','apellido','email'] },
              { model: Usuario, as: 'aux_cartera', attributes: ['id','nombre','apellido','email'] },
              {
                model: CymPareja, as: 'pareja',
                include: [{
                  model: CymParejaMiembro, as: 'miembros',
                  where: { activo: true }, required: false,
                  include: [{ model: Usuario, as: 'operario', attributes: ['id','nombre','apellido','email'] }]
                }]
              }
            ]
          }
        ]
      });
      if (!predio) throw new AppError('Predio no encontrado', 404);
      res.json({ success: true, data: predio });
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const { sector, numero_lote, acomodacion,
              sq_cedula, sq_nombre, sq_fecha_nac, sq_fecha_fall, sq_fecha_inhum,
              sq2_cedula, sq2_nombre, sq2_fecha_nac, sq2_fecha_fall, sq2_fecha_inhum,
              sq3_cedula, sq3_nombre, sq3_fecha_nac, sq3_fecha_fall, sq3_fecha_inhum } = req.body;

      const predio = await CymPredio.create({
        sector, numero_lote, acomodacion,
        sq_cedula,  sq_nombre,  sq_fecha_nac:  d(sq_fecha_nac),  sq_fecha_fall:  d(sq_fecha_fall),  sq_fecha_inhum:  d(sq_fecha_inhum),
        sq2_cedula, sq2_nombre, sq2_fecha_nac: d(sq2_fecha_nac), sq2_fecha_fall: d(sq2_fecha_fall), sq2_fecha_inhum: d(sq2_fecha_inhum),
        sq3_cedula, sq3_nombre, sq3_fecha_nac: d(sq3_fecha_nac), sq3_fecha_fall: d(sq3_fecha_fall), sq3_fecha_inhum: d(sq3_fecha_inhum),
        activo_mant: true
      });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'CREATE',
        tabla: 'cym_predios',
        registro_id: predio.id,
        datos_nuevos: JSON.stringify(predio),
        ip_address: req.ip
      });

      res.status(201).json({ success: true, data: predio, message: 'Predio creado correctamente' });
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        return next(new AppError('Ya existe un predio con ese sector y número de lote', 409));
      }
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.id);
      if (!predio) throw new AppError('Predio no encontrado', 404);

      const antes = predio.toJSON();
      const { sector, numero_lote, acomodacion,
              sq_cedula, sq_nombre, sq_fecha_nac, sq_fecha_fall, sq_fecha_inhum,
              sq2_cedula, sq2_nombre, sq2_fecha_nac, sq2_fecha_fall, sq2_fecha_inhum,
              sq3_cedula, sq3_nombre, sq3_fecha_nac, sq3_fecha_fall, sq3_fecha_inhum,
              activo_mant } = req.body;

      // Detectar cambios en seres queridos antes de actualizar
      const cambiosSq = detectarCambiosSq(antes, req.body, predio.id, req.usuario.id);

      await predio.update({
        sector, numero_lote, acomodacion,
        sq_cedula,  sq_nombre,  sq_fecha_nac:  d(sq_fecha_nac),  sq_fecha_fall:  d(sq_fecha_fall),  sq_fecha_inhum:  d(sq_fecha_inhum),
        sq2_cedula, sq2_nombre, sq2_fecha_nac: d(sq2_fecha_nac), sq2_fecha_fall: d(sq2_fecha_fall), sq2_fecha_inhum: d(sq2_fecha_inhum),
        sq3_cedula, sq3_nombre, sq3_fecha_nac: d(sq3_fecha_nac), sq3_fecha_fall: d(sq3_fecha_fall), sq3_fecha_inhum: d(sq3_fecha_inhum),
        activo_mant
      });

      // Registrar cambios de ser querido en historial
      if (cambiosSq.length > 0) {
        await CymHistoricoSq.bulkCreate(cambiosSq);
      }

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'UPDATE',
        tabla: 'cym_predios',
        registro_id: predio.id,
        datos_anteriores: JSON.stringify(antes),
        datos_nuevos: JSON.stringify(predio),
        ip_address: req.ip
      });

      res.json({ success: true, data: predio, message: 'Predio actualizado' });
    } catch (err) {
      next(err);
    }
  },

  async getHistoricoSq(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.id);
      if (!predio) throw new AppError('Predio no encontrado', 404);

      const historial = await CymHistoricoSq.findAll({
        where: { predio_id: req.params.id },
        include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido'] }],
        order: [['created_at', 'DESC']]
      });

      res.json({ success: true, data: historial });
    } catch (err) {
      next(err);
    }
  },

  async inactivar(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.id, {
        include: [{
          model: CymContrato,
          as: 'contratos',
          where: { estado: { [Op.in]: ['activo', 'vencido'] } },
          required: false
        }]
      });
      if (!predio) throw new AppError('Predio no encontrado', 404);

      const contratoVigente = predio.contratos?.find(c => ['activo', 'vencido'].includes(c.estado));
      if (contratoVigente) throw new AppError('No se puede inactivar un predio con contrato activo o vencido', 400);

      if (!predio.activo_mant) throw new AppError('El predio ya está inactivo', 400);

      const { motivo } = req.body;
      if (!motivo?.trim()) throw new AppError('El motivo de inactivación es requerido', 400);

      const antes = predio.toJSON();
      await predio.update({ activo_mant: false, motivo_inactivacion: motivo.trim() });

      await AuditLog.create({
        usuario_id: req.usuario.id,
        accion: 'INACTIVAR',
        tabla: 'cym_predios',
        registro_id: predio.id,
        datos_anteriores: JSON.stringify(antes),
        datos_nuevos: JSON.stringify(predio),
        ip_address: req.ip
      });

      res.json({ success: true, data: predio, message: 'Predio inactivado correctamente' });
    } catch (err) {
      next(err);
    }
  },

  async getTimeline(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.id);
      if (!predio) throw new AppError('Predio no encontrado', 404);

      const mantenimientos = await CymMantenimiento.findAll({
        where: { predio_id: req.params.id, estado: 'completado' },
        include: [
          {
            model: CymChecklist,
            as: 'checklist',
            include: [{ model: CymActividad, as: 'actividad', attributes: ['nombre','orden'] }]
          },
          { model: CymEvidencia, as: 'evidencias' },
          { model: Usuario, as: 'supervisor', attributes: ['nombre','apellido'] },
          { model: Usuario, as: 'operario',   attributes: ['nombre','apellido'] },
          { model: Usuario, as: 'operario2',  attributes: ['nombre','apellido'] }
        ],
        order: [['fecha_mant', 'DESC']]
      });

      res.json({ success: true, data: { predio, mantenimientos } });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = cymPredioController;
