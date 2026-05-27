// ============================================
// src/controllers/solicitudesController.js
// ============================================
const { 
  SolicitudAdicional,
  Usuario,
  Sede,
  CategoriaMantenimiento,
  Equipo,
  Estado
} = require('../models');
const { Op } = require('sequelize');
// const { ESTADOS_SOLICITUD, MENSAJES } = require('../config/constants');
const { paginar, formatearRespuestaPaginada } = require('../utils/helpers');
// const notificationService = require('../services/notificationService');

// Función auxiliar para generar código de solicitud (FUERA del objeto)
const generarCodigoSolicitud = async () => {
  const anio = new Date().getFullYear();
  const mes = String(new Date().getMonth() + 1).padStart(2, '0');
  
  // Buscar el último código del mes actual
  const ultimaSolicitud = await SolicitudAdicional.findOne({
    where: {
      codigo: {
        [Op.like]: `SOL-${anio}${mes}-%`
      }
    },
    order: [['codigo', 'DESC']]
  });

  let numeroConsecutivo = 1;
  
  if (ultimaSolicitud) {
    // Extraer el número consecutivo del último código
    const ultimoCodigo = ultimaSolicitud.codigo;
    const partes = ultimoCodigo.split('-');
    if (partes.length === 3) {
      numeroConsecutivo = parseInt(partes[2]) + 1;
    }
  }

  // Formato: SOL-AAAAMM-NNNN (ejemplo: SOL-202510-0001)
  const codigo = `SOL-${anio}${mes}-${String(numeroConsecutivo).padStart(4, '0')}`;
  
  return codigo;
};

const solicitudesController = {
  // Listar solicitudes
  async listar(req, res, next) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        estado_id, 
        prioridad,
        tipo,
        sede_id 
      } = req.query;

      const where = {};
      if (estado_id) where.estado_id = estado_id;
      if (prioridad) where.prioridad = prioridad;
      if (tipo) where.tipo = tipo;
      if (sede_id) where.sede_id = sede_id;

      const { count, rows } = await SolicitudAdicional.findAndCountAll({
        where,
        include: [
          { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre', 'apellido', 'email'] },
          { model: Sede, as: 'sede', attributes: ['id', 'codigo', 'nombre', 'ciudad'] },
          { model: CategoriaMantenimiento, as: 'categoria', attributes: ['id', 'nombre'] },
          { model: Equipo, as: 'equipo', attributes: ['id', 'codigo', 'nombre'] },
          { model: Estado, as: 'estado', attributes: ['id', 'nombre', 'color'] },
          { model: Usuario, as: 'asignado_usuario', attributes: ['id', 'nombre', 'apellido'] }
        ],
        ...paginar(page, limit),
        order: [['fecha_solicitud', 'DESC']]
      });

      res.json(formatearRespuestaPaginada(rows, page, limit, count));
    } catch (error) {
      next(error);
    }
  },

  // Crear solicitud
  async crear(req, res, next) {
    try {
      const {
        sede_id,
        area,
        categoria_id,
        equipo_id,
        tipo,
        prioridad,
        titulo,
        descripcion
      } = req.body;

      // Validar campos requeridos
      if (!sede_id || !tipo || !titulo || !descripcion) {
        return res.status(400).json({
          success: false,
          error: 'Los campos sede_id, tipo, titulo y descripcion son requeridos'
        });
      }

      // Verificar que la sede existe
      const sede = await Sede.findByPk(sede_id);
      if (!sede) {
        return res.status(400).json({
          success: false,
          error: 'La sede especificada no existe'
        });
      }

      // Verificar que la categoría existe (si se proporciona)
      if (categoria_id) {
        const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
        if (!categoria) {
          return res.status(400).json({
            success: false,
            error: 'La categoría especificada no existe'
          });
        }
      }

      // Verificar que el equipo existe (si se proporciona)
      if (equipo_id) {
        const equipo = await Equipo.findByPk(equipo_id);
        if (!equipo) {
          return res.status(400).json({
            success: false,
            error: 'El equipo especificado no existe'
          });
        }
      }

      // Buscar el estado "Pendiente"
      const estadoPendiente = await Estado.findOne({ 
        where: { nombre: 'Pendiente' } 
      });

      if (!estadoPendiente) {
        return res.status(500).json({
          success: false,
          error: 'No se pudo encontrar el estado "Pendiente" en el sistema'
        });
      }

      // Generar código automático usando la función externa
      const codigo = await generarCodigoSolicitud();

      // Crear la solicitud
      const solicitud = await SolicitudAdicional.create({
        codigo,
        solicitante_id: req.usuario.id,
        sede_id,
        area,
        categoria_id,
        equipo_id,
        tipo,
        prioridad: prioridad || 'media',
        titulo,
        descripcion,
        estado_id: estadoPendiente.id,
        fecha_solicitud: new Date()
      });

      // Obtener la solicitud creada con sus relaciones
      const solicitudCompleta = await SolicitudAdicional.findByPk(solicitud.id, {
        include: [
          { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre', 'apellido', 'email'] },
          { model: Sede, as: 'sede' },
          { model: CategoriaMantenimiento, as: 'categoria' },
          { model: Equipo, as: 'equipo' },
          { model: Estado, as: 'estado' }
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Solicitud creada exitosamente',
        data: solicitudCompleta
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener solicitud por ID
  async obtenerPorId(req, res, next) {
    try {
      const { id } = req.params;

      const solicitud = await SolicitudAdicional.findByPk(id, {
        include: [
          { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre', 'apellido', 'email'] },
          { model: Sede, as: 'sede' },
          { model: CategoriaMantenimiento, as: 'categoria' },
          { model: Equipo, as: 'equipo' },
          { model: Estado, as: 'estado' },
          { model: Usuario, as: 'asignado_usuario', attributes: ['id', 'nombre', 'apellido'] }
        ]
      });

      if (!solicitud) {
        return res.status(404).json({
          success: false,
          error: 'Solicitud no encontrada'
        });
      }

      res.json({
        success: true,
        data: solicitud
      });
    } catch (error) {
      next(error);
    }
  },

  // Actualizar solicitud
  async actualizar(req, res, next) {
    try {
      const { id } = req.params;
      const {
        sede_id,
        area,
        categoria_id,
        equipo_id,
        tipo,
        prioridad,
        titulo,
        descripcion
      } = req.body;

      const solicitud = await SolicitudAdicional.findByPk(id);

      if (!solicitud) {
        return res.status(404).json({
          success: false,
          error: 'Solicitud no encontrada'
        });
      }

      // Verificar que la sede existe (si se está actualizando)
      if (sede_id) {
        const sede = await Sede.findByPk(sede_id);
        if (!sede) {
          return res.status(400).json({
            success: false,
            error: 'La sede especificada no existe'
          });
        }
      }

      // Verificar que la categoría existe (si se está actualizando)
      if (categoria_id) {
        const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
        if (!categoria) {
          return res.status(400).json({
            success: false,
            error: 'La categoría especificada no existe'
          });
        }
      }

      // Verificar que el equipo existe (si se está actualizando)
      if (equipo_id) {
        const equipo = await Equipo.findByPk(equipo_id);
        if (!equipo) {
          return res.status(400).json({
            success: false,
            error: 'El equipo especificado no existe'
          });
        }
      }

      // Preparar datos para actualizar
      const datosActualizacion = {};
      if (sede_id !== undefined) datosActualizacion.sede_id = sede_id;
      if (area !== undefined) datosActualizacion.area = area;
      if (categoria_id !== undefined) datosActualizacion.categoria_id = categoria_id;
      if (equipo_id !== undefined) datosActualizacion.equipo_id = equipo_id;
      if (tipo !== undefined) datosActualizacion.tipo = tipo;
      if (prioridad !== undefined) datosActualizacion.prioridad = prioridad;
      if (titulo !== undefined) datosActualizacion.titulo = titulo;
      if (descripcion !== undefined) datosActualizacion.descripcion = descripcion;

      await solicitud.update(datosActualizacion);

      // Obtener solicitud actualizada con relaciones
      const solicitudActualizada = await SolicitudAdicional.findByPk(id, {
        include: [
          { model: Usuario, as: 'solicitante' },
          { model: Sede, as: 'sede' },
          { model: CategoriaMantenimiento, as: 'categoria' },
          { model: Equipo, as: 'equipo' },
          { model: Estado, as: 'estado' }
        ]
      });

      res.json({
        success: true,
        message: 'Solicitud actualizada exitosamente',
        data: solicitudActualizada
      });
    } catch (error) {
      next(error);
    }
  },

  // Eliminar solicitud
  async eliminar(req, res, next) {
    try {
      const { id } = req.params;

      const solicitud = await SolicitudAdicional.findByPk(id);

      if (!solicitud) {
        return res.status(404).json({
          success: false,
          error: 'Solicitud no encontrada'
        });
      }

      await solicitud.destroy();

      res.json({
        success: true,
        message: 'Solicitud eliminada exitosamente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  },

  // Aprobar solicitud
  async aprobar(req, res, next) {
    try {
      const { id } = req.params;
      const { comentario } = req.body;

      const solicitud = await SolicitudAdicional.findByPk(id);

      if (!solicitud) {
        return res.status(404).json({
          success: false,
          error: 'Solicitud no encontrada'
        });
      }

      // Buscar el estado "Aprobada"
      const estadoAprobada = await Estado.findOne({ 
        where: { nombre: 'Aprobada' } 
      });

      if (!estadoAprobada) {
        return res.status(500).json({
          success: false,
          error: 'No se pudo encontrar el estado "Aprobada" en el sistema'
        });
      }

      await solicitud.update({
        estado_id: estadoAprobada.id,
        fecha_aprobacion: new Date(),
        aprobado_por: req.usuario.id
      });

      // Obtener solicitud actualizada
      const solicitudActualizada = await SolicitudAdicional.findByPk(id, {
        include: [
          { model: Usuario, as: 'solicitante' },
          { model: Estado, as: 'estado' }
        ]
      });

      res.json({
        success: true,
        message: 'Solicitud aprobada exitosamente',
        data: solicitudActualizada
      });
    } catch (error) {
      next(error);
    }
  },

  // Asignar solicitud
  async asignar(req, res, next) {
    try {
      const { id } = req.params;
      const { asignado_a_usuario_id } = req.body;

      if (!asignado_a_usuario_id) {
        return res.status(400).json({
          success: false,
          error: 'Debe especificar un usuario para asignar'
        });
      }

      const solicitud = await SolicitudAdicional.findByPk(id);

      if (!solicitud) {
        return res.status(404).json({
          success: false,
          error: 'Solicitud no encontrada'
        });
      }

      // Verificar que el usuario existe
      const usuario = await Usuario.findByPk(asignado_a_usuario_id);
      if (!usuario) {
        return res.status(400).json({
          success: false,
          error: 'El usuario especificado no existe'
        });
      }

      // Buscar el estado "Asignada"
      const estadoAsignada = await Estado.findOne({ 
        where: { nombre: 'Asignada' } 
      });

      if (!estadoAsignada) {
        return res.status(500).json({
          success: false,
          error: 'No se pudo encontrar el estado "Asignada" en el sistema'
        });
      }

      await solicitud.update({
        asignado_a_usuario_id,
        estado_id: estadoAsignada.id,
        fecha_asignacion: new Date()
      });

      // Obtener solicitud actualizada
      const solicitudActualizada = await SolicitudAdicional.findByPk(id, {
        include: [
          { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre', 'apellido'] },
          { model: Usuario, as: 'asignado_usuario', attributes: ['id', 'nombre', 'apellido'] },
          { model: Estado, as: 'estado' }
        ]
      });

      res.json({
        success: true,
        message: 'Solicitud asignada exitosamente',
        data: solicitudActualizada
      });
    } catch (error) {
      next(error);
    }
  },

  // Cerrar solicitud
  async cerrar(req, res, next) {
    try {
      const { id } = req.params;
      const { solucion_aplicada, costo, calificacion, comentario_cierre } = req.body;

      if (!solucion_aplicada) {
        return res.status(400).json({
          success: false,
          error: 'El campo solucion_aplicada es requerido'
        });
      }

      const solicitud = await SolicitudAdicional.findByPk(id);

      if (!solicitud) {
        return res.status(404).json({
          success: false,
          error: 'Solicitud no encontrada'
        });
      }

      // Buscar el estado "Resuelta" o "Cerrada"
      const estadoResuelta = await Estado.findOne({ 
        where: { 
          nombre: { [Op.in]: ['Resuelta', 'Cerrada'] }
        } 
      });

      if (!estadoResuelta) {
        return res.status(500).json({
          success: false,
          error: 'No se pudo encontrar el estado "Resuelta" en el sistema'
        });
      }

      // Calcular tiempo de solución si hay fecha de asignación
      let tiempoSolucion = null;
      if (solicitud.fecha_asignacion) {
        const fechaCierre = new Date();
        const fechaAsignacion = new Date(solicitud.fecha_asignacion);
        tiempoSolucion = (fechaCierre - fechaAsignacion) / (1000 * 60 * 60); // En horas
      }

      await solicitud.update({
        solucion_aplicada,
        costo,
        calificacion,
        comentario_cierre,
        estado_id: estadoResuelta.id,
        fecha_cierre: new Date(),
        tiempo_solucion_horas: tiempoSolucion
      });

      // Obtener solicitud actualizada
      const solicitudActualizada = await SolicitudAdicional.findByPk(id, {
        include: [
          { model: Usuario, as: 'solicitante' },
          { model: Estado, as: 'estado' }
        ]
      });

      res.json({
        success: true,
        message: 'Solicitud cerrada exitosamente',
        data: solicitudActualizada
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = solicitudesController;