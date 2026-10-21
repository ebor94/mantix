// Reportes controller
const { Op } = require('sequelize');
const db = require('../models');
const {
  PlanActividad,
  MantenimientoProgramado,
  MantenimientoEjecutado,
  CategoriaMantenimiento,
  Sede,
  Equipo,
  Periodicidad,
  TipoMantenimiento,
  Usuario,
  Proveedor
} = db;

// Normaliza DATEONLY (string YYYY-MM-DD o Date) → "YYYY-MM-DD"
const toISODate = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val.slice(0, 10);
  const d = (val instanceof Date) ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const reportesController = {
  // Stubs existentes (mantener para no romper rutas ya registradas)
  generateMaintenanceReport: (req, res) => {
    res.status(200).json({ message: 'Generate maintenance report endpoint' });
  },
  generateEquipmentReport: (req, res) => {
    res.status(200).json({ message: 'Generate equipment report endpoint' });
  },
  generateUserReport: (req, res) => {
    res.status(200).json({ message: 'Generate user report endpoint' });
  },

  // R-25: Programa anual de mantenimientos (queries separadas)
  async generateProgramaAnualReport(req, res, next) {
    try {
      const anio = parseInt(req.query.anio) || new Date().getFullYear();
      const sedeId = req.query.sede_id ? parseInt(req.query.sede_id) : null;
      const categoriaId = req.query.categoria_id ? parseInt(req.query.categoria_id) : null;

      const inicio = `${anio}-01-01`;
      const fin = `${anio}-12-31`;

      // 1) Actividades activas (sin eager-load de mantenimientos: lo hacemos aparte)
      const whereActividad = { activo: true };
      if (sedeId) whereActividad.sede_id = sedeId;
      if (categoriaId) whereActividad.categoria_id = categoriaId;

      const actividades = await PlanActividad.findAll({
        where: whereActividad,
        include: [
          { model: CategoriaMantenimiento, as: 'categoria', attributes: ['id', 'nombre'] },
          { model: Sede, as: 'sede', attributes: ['id', 'codigo', 'nombre'] },
          { model: Equipo, as: 'equipo', attributes: ['id', 'nombre'] },
          { model: Periodicidad, as: 'periodicidad', attributes: ['id', 'nombre'] },
          { model: TipoMantenimiento, as: 'tipo_mantenimiento', attributes: ['id', 'nombre'] },
          { model: Usuario, as: 'responsable_usuario', attributes: ['id', 'nombre', 'apellido'], required: false },
          { model: Proveedor, as: 'responsable_proveedor', attributes: ['id', 'nombre'], required: false }
        ],
        order: [
          [{ model: CategoriaMantenimiento, as: 'categoria' }, 'nombre', 'ASC'],
          ['nombre', 'ASC']
        ]
      });

      const idsActividades = actividades.map(a => a.id);
      if (idsActividades.length === 0) {
        return res.json({
          success: true,
          anio,
          filtros: { sede_id: sedeId, categoria_id: categoriaId },
          data: []
        });
      }

      // 2) Mantenimientos programados del año para esas actividades
      const programados = await MantenimientoProgramado.findAll({
        where: {
          plan_actividad_id: { [Op.in]: idsActividades },
          fecha_programada: { [Op.between]: [inicio, fin] }
        },
        attributes: ['id', 'plan_actividad_id', 'fecha_programada'],
        raw: true
      });

      const programadosPorActividad = new Map();
      const idsProgramados = [];
      for (const mp of programados) {
        const fp = toISODate(mp.fecha_programada);
        if (!fp) continue;
        if (!programadosPorActividad.has(mp.plan_actividad_id)) {
          programadosPorActividad.set(mp.plan_actividad_id, []);
        }
        programadosPorActividad.get(mp.plan_actividad_id).push({ id: mp.id, fecha: fp });
        idsProgramados.push(mp.id);
      }

      // 3) Ejecutados correspondientes a esos programados (con ejecutor)
      const ejecutadosPorProgramado = new Map();
      if (idsProgramados.length > 0) {
        const ejecutados = await MantenimientoEjecutado.findAll({
          where: { mantenimiento_programado_id: { [Op.in]: idsProgramados } },
          attributes: ['id', 'mantenimiento_programado_id', 'fecha_ejecucion', 'nombre_recibe'],
          include: [
            { model: Usuario, as: 'usuario_ejecutor', attributes: ['id', 'nombre', 'apellido'], required: false },
            { model: Proveedor, as: 'proveedor_ejecutor', attributes: ['id', 'nombre'], required: false }
          ]
        });
        for (const ej of ejecutados) {
          const fe = toISODate(ej.fecha_ejecucion);
          if (!fe) continue;
          let ejecutor = '';
          if (ej.usuario_ejecutor) {
            ejecutor = [ej.usuario_ejecutor.nombre, ej.usuario_ejecutor.apellido].filter(Boolean).join(' ');
          } else if (ej.proveedor_ejecutor) {
            ejecutor = ej.proveedor_ejecutor.nombre || '';
          } else if (ej.nombre_recibe) {
            ejecutor = ej.nombre_recibe;
          }
          ejecutadosPorProgramado.set(ej.mantenimiento_programado_id, { fecha: fe, ejecutor });
        }
      }

      // 4) Armar pivot por actividad + agrupar por categoría
      const grupos = new Map();
      for (const act of actividades) {
        const catId = act.categoria?.id || 0;
        const catNombre = act.categoria?.nombre || 'Sin categoría';
        if (!grupos.has(catId)) {
          grupos.set(catId, { categoria_id: catId, categoria: catNombre, actividades: [] });
        }

        const meses = {};
        for (let m = 1; m <= 12; m++) meses[m] = { programaciones: [], ejecuciones: [] };

        const mps = programadosPorActividad.get(act.id) || [];
        for (const mp of mps) {
          const mesProg = Number(mp.fecha.slice(5, 7));
          if (mesProg >= 1 && mesProg <= 12) meses[mesProg].programaciones.push(mp.fecha);
          const ej = ejecutadosPorProgramado.get(mp.id);
          if (ej) {
            const mesEj = Number(ej.fecha.slice(5, 7));
            if (mesEj >= 1 && mesEj <= 12) {
              meses[mesEj].ejecuciones.push({ fecha: ej.fecha, ejecutor: ej.ejecutor });
            }
          }
        }

        let responsable = '';
        if (act.responsable_tipo === 'proveedor' && act.responsable_proveedor) {
          responsable = act.responsable_proveedor.nombre || '';
        } else if (act.responsable_tipo === 'interno' && act.responsable_usuario) {
          const u = act.responsable_usuario;
          responsable = [u.nombre, u.apellido].filter(Boolean).join(' ');
        }

        grupos.get(catId).actividades.push({
          id: act.id,
          trabajo_a_realizar: act.nombre,
          descripcion: act.descripcion || '',
          sede_codigo: act.sede?.codigo || '',
          sede_nombre: act.sede?.nombre || '',
          equipo: act.equipo?.nombre || '',
          responsable,
          periodicidad: act.periodicidad?.nombre || '',
          tipo_mantenimiento: act.tipo_mantenimiento?.nombre || '',
          registro: act.id,
          meses
        });
      }

      res.json({
        success: true,
        anio,
        filtros: { sede_id: sedeId, categoria_id: categoriaId },
        data: Array.from(grupos.values())
      });
    } catch (error) {
      console.error('Error al generar programa anual:', error);
      next(error);
    }
  }
};

module.exports = reportesController;
