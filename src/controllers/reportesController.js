// Reportes controller
const { Op } = require('sequelize');
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
} = require('../models');

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

  // R-25: Programa anual de mantenimientos
  // Devuelve, por categoría, las actividades con el pivot mes × { programado, ejecutado }
  async generateProgramaAnualReport(req, res, next) {
    try {
      const anio = parseInt(req.query.anio) || new Date().getFullYear();
      const sedeId = req.query.sede_id ? parseInt(req.query.sede_id) : null;
      const categoriaId = req.query.categoria_id ? parseInt(req.query.categoria_id) : null;

      const inicio = `${anio}-01-01`;
      const fin = `${anio}-12-31`;

      const whereActividad = { activo: true };
      if (sedeId) whereActividad.sede_id = sedeId;
      if (categoriaId) whereActividad.categoria_id = categoriaId;

      const actividades = await PlanActividad.findAll({
        where: whereActividad,
        include: [
          { model: CategoriaMantenimiento, as: 'categoria', attributes: ['id', 'nombre'] },
          { model: Sede, as: 'sede', attributes: ['id', 'codigo', 'nombre'] },
          { model: Equipo, as: 'equipo', attributes: ['id', 'nombre'] },
          { model: Periodicidad, as: 'periodicidad', attributes: ['id', 'nombre', 'dias'] },
          { model: TipoMantenimiento, as: 'tipo_mantenimiento', attributes: ['id', 'nombre'] },
          { model: Usuario, as: 'responsable_usuario', attributes: ['id', 'nombre', 'apellido'] },
          { model: Proveedor, as: 'responsable_proveedor', attributes: ['id', 'nombre'] },
          {
            model: MantenimientoProgramado,
            as: 'mantenimientos',
            required: false,
            where: { fecha_programada: { [Op.between]: [inicio, fin] } },
            attributes: ['id', 'fecha_programada'],
            include: [
              {
                model: MantenimientoEjecutado,
                as: 'ejecucion',
                required: false,
                attributes: ['id', 'fecha_ejecucion', 'nombre_recibe'],
                include: [
                  { model: Usuario, as: 'usuario_ejecutor', attributes: ['id', 'nombre', 'apellido'], required: false },
                  { model: Proveedor, as: 'proveedor_ejecutor', attributes: ['id', 'nombre'], required: false }
                ]
              }
            ]
          }
        ],
        order: [
          [{ model: CategoriaMantenimiento, as: 'categoria' }, 'nombre', 'ASC'],
          ['nombre', 'ASC']
        ]
      });

      const grupos = new Map();

      for (const act of actividades) {
        const catId = act.categoria?.id || 0;
        const catNombre = act.categoria?.nombre || 'Sin categoría';
        if (!grupos.has(catId)) {
          grupos.set(catId, { categoria_id: catId, categoria: catNombre, actividades: [] });
        }

        // Pivot 12 meses: { 1: { programaciones: ['2026-01-10'], ejecuciones: [{fecha, ejecutor}] }, ... }
        const meses = {};
        for (let m = 1; m <= 12; m++) {
          meses[m] = { programaciones: [], ejecuciones: [] };
        }

        for (const mp of act.mantenimientos || []) {
          if (!mp.fecha_programada) continue;
          const fp = mp.fecha_programada.toString().slice(0, 10);
          const mesProg = Number(fp.slice(5, 7));
          if (mesProg >= 1 && mesProg <= 12) meses[mesProg].programaciones.push(fp);

          const ej = mp.ejecucion;
          if (ej && ej.fecha_ejecucion) {
            const fe = ej.fecha_ejecucion.toString().slice(0, 10);
            const mesEj = Number(fe.slice(5, 7));
            if (mesEj >= 1 && mesEj <= 12) {
              let ejecutor = '';
              if (ej.usuario_ejecutor) {
                ejecutor = [ej.usuario_ejecutor.nombre, ej.usuario_ejecutor.apellido].filter(Boolean).join(' ');
              } else if (ej.proveedor_ejecutor) {
                ejecutor = ej.proveedor_ejecutor.nombre || '';
              } else if (ej.nombre_recibe) {
                ejecutor = ej.nombre_recibe;
              }
              meses[mesEj].ejecuciones.push({ fecha: fe, ejecutor });
            }
          }
        }

        // Resolver responsable
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
