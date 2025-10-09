// Equipos controller
const { Equipo, CategoriaMantenimiento, Sede, Usuario, Rol } = require('../models');
const { Op } = require('sequelize');

const equiposController = {
  // Get all equipos
  async getAll(req, res, next) {
    try {
      const equipos = await Equipo.findAll({
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre', 'ciudad']
          },
          {
            model: Usuario,
            as: 'responsable',
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ],
        order: [['codigo', 'ASC']]
      });

      res.status(200).json(equipos);
    } catch (error) {
      next(error);
    }
  },

  // Get equipo by ID
  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const equipo = await Equipo.findByPk(id, {
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre', 'ciudad', 'direccion']
          },
          {
            model: Usuario,
            as: 'responsable',
            attributes: ['id', 'nombre', 'apellido', 'email', 'telefono'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ]
      });

      if (!equipo) {
        return res.status(404).json({ 
          error: 'Equipo no encontrado' 
        });
      }

      res.status(200).json(equipo);
    } catch (error) {
      next(error);
    }
  },

  // Create equipo
  async create(req, res, next) {
    try {
      const {
        codigo,
        nombre,
        categoria_id,
        sede_id,
        marca,
        modelo,
        numero_serie,
        ubicacion_especifica,
        fecha_instalacion,
        fecha_compra,
        valor_compra,
        vida_util_anos,
        responsable_id,
        estado,
        observaciones,
        activo
      } = req.body;

      // Verificar si el código ya existe
      const codigoExistente = await Equipo.findOne({ where: { codigo } });
      if (codigoExistente) {
        return res.status(409).json({ 
          error: 'El código de equipo ya está registrado' 
        });
      }

      // Verificar si la categoría existe
      const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
      if (!categoria) {
        return res.status(400).json({ 
          error: 'La categoría especificada no existe' 
        });
      }

      // Verificar si la sede existe
      const sede = await Sede.findByPk(sede_id);
      if (!sede) {
        return res.status(400).json({ 
          error: 'La sede especificada no existe' 
        });
      }

      // Verificar si el responsable existe (si se proporciona)
      if (responsable_id) {
        const responsable = await Usuario.findByPk(responsable_id);
        if (!responsable) {
          return res.status(400).json({ 
            error: 'El responsable especificado no existe' 
          });
        }
      }

      // Crear el equipo
      const nuevoEquipo = await Equipo.create({
        codigo,
        nombre,
        categoria_id,
        sede_id,
        marca,
        modelo,
        numero_serie,
        ubicacion_especifica,
        fecha_instalacion,
        fecha_compra,
        valor_compra,
        vida_util_anos,
        responsable_id,
        estado: estado || 'operativo',
        observaciones,
        activo: activo !== undefined ? activo : true
      });

      // Obtener el equipo creado con todas sus relaciones
      const equipoCreado = await Equipo.findByPk(nuevoEquipo.id, {
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre', 'ciudad']
          },
          {
            model: Usuario,
            as: 'responsable',
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ]
      });

      res.status(201).json(equipoCreado);
    } catch (error) {
      next(error);
    }
  },

  // Update equipo
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        codigo,
        nombre,
        categoria_id,
        sede_id,
        marca,
        modelo,
        numero_serie,
        ubicacion_especifica,
        fecha_instalacion,
        fecha_compra,
        valor_compra,
        vida_util_anos,
        responsable_id,
        estado,
        observaciones,
        activo
      } = req.body;

      // Verificar si el equipo existe
      const equipo = await Equipo.findByPk(id);
      if (!equipo) {
        return res.status(404).json({ 
          error: 'Equipo no encontrado' 
        });
      }

      // Si se está actualizando el código, verificar que no esté en uso
      if (codigo && codigo !== equipo.codigo) {
        const codigoExistente = await Equipo.findOne({ 
          where: { 
            codigo,
            id: { [Op.ne]: id }
          } 
        });
        
        if (codigoExistente) {
          return res.status(409).json({ 
            error: 'El código de equipo ya está registrado en otro equipo' 
          });
        }
      }

      // Verificar si la categoría existe (si se proporciona)
      if (categoria_id) {
        const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
        if (!categoria) {
          return res.status(400).json({ 
            error: 'La categoría especificada no existe' 
          });
        }
      }

      // Verificar si la sede existe (si se proporciona)
      if (sede_id) {
        const sede = await Sede.findByPk(sede_id);
        if (!sede) {
          return res.status(400).json({ 
            error: 'La sede especificada no existe' 
          });
        }
      }

      // Verificar si el responsable existe (si se proporciona)
      if (responsable_id) {
        const responsable = await Usuario.findByPk(responsable_id);
        if (!responsable) {
          return res.status(400).json({ 
            error: 'El responsable especificado no existe' 
          });
        }
      }

      // Preparar datos para actualizar
      const datosActualizacion = {};
      if (codigo !== undefined) datosActualizacion.codigo = codigo;
      if (nombre !== undefined) datosActualizacion.nombre = nombre;
      if (categoria_id !== undefined) datosActualizacion.categoria_id = categoria_id;
      if (sede_id !== undefined) datosActualizacion.sede_id = sede_id;
      if (marca !== undefined) datosActualizacion.marca = marca;
      if (modelo !== undefined) datosActualizacion.modelo = modelo;
      if (numero_serie !== undefined) datosActualizacion.numero_serie = numero_serie;
      if (ubicacion_especifica !== undefined) datosActualizacion.ubicacion_especifica = ubicacion_especifica;
      if (fecha_instalacion !== undefined) datosActualizacion.fecha_instalacion = fecha_instalacion;
      if (fecha_compra !== undefined) datosActualizacion.fecha_compra = fecha_compra;
      if (valor_compra !== undefined) datosActualizacion.valor_compra = valor_compra;
      if (vida_util_anos !== undefined) datosActualizacion.vida_util_anos = vida_util_anos;
      if (responsable_id !== undefined) datosActualizacion.responsable_id = responsable_id;
      if (estado !== undefined) datosActualizacion.estado = estado;
      if (observaciones !== undefined) datosActualizacion.observaciones = observaciones;
      if (activo !== undefined) datosActualizacion.activo = activo;

      // Actualizar equipo
      await equipo.update(datosActualizacion);

      // Obtener equipo actualizado con todas sus relaciones
      const equipoActualizado = await Equipo.findByPk(id, {
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre', 'ciudad']
          },
          {
            model: Usuario,
            as: 'responsable',
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ]
      });

      res.status(200).json(equipoActualizado);
    } catch (error) {
      next(error);
    }
  },

  // Delete equipo
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      // Verificar si el equipo existe
      const equipo = await Equipo.findByPk(id);
      if (!equipo) {
        return res.status(404).json({ 
          error: 'Equipo no encontrado' 
        });
      }

      //  Aquí puedes agregar validaciones adicionales si el equipo tiene
      //  registros de mantenimiento, documentos, etc.
      //  Por ejemplo:
       const mantenimientos = await equipo.countMantenimientos();
       if (mantenimientos > 0) {
         return res.status(400).json({ 
           error: `No se puede eliminar el equipo porque tiene ${mantenimientos} registro(s) de mantenimiento` 
         });
       }

      // Eliminar el equipo
      await equipo.destroy();

      res.status(200).json({ 
        message: 'Equipo eliminado exitosamente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = equiposController;