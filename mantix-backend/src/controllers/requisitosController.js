// ============================================
// src/controllers/requisitosController.js
// ============================================
const { Requisito, RequisitoCategoria, CategoriaMantenimiento, Dependencia  } = require('../models');
const { Op } = require('sequelize');

const requisitosController = {
  // Obtener todos los requisitos
  async getAll(req, res, next) {
  try {
    const { activo, categoria_id } = req.query;

    const whereCondition = {};
    
    if (activo !== undefined) {
      whereCondition.activo = activo === 'true';
    }

    const includeOptions = [
      {
        model: CategoriaMantenimiento,
        as: 'categorias',
        attributes: ['id', 'nombre', 'descripcion', 'color', 'icono'],
        through: { 
          attributes: [],
          where: { active: true }
        }
      },
      // ✅ NUEVO: Incluir dependencia
      {
        model: Dependencia,
        as: 'dependencia',
        attributes: ['id', 'nombre', 'descripcion']
      }
    ];

    if (categoria_id) {
      includeOptions[0].where = { id: categoria_id };
      includeOptions[0].required = true;
    }

    const requisitos = await Requisito.findAll({
      where: whereCondition,
      include: includeOptions,
      order: [['nombre', 'ASC']]
    });

    res.status(200).json(requisitos);
  } catch (error) {
    next(error);
  }
},

  // Obtener requisito por ID
 async getById(req, res, next) {
  try {
    const { id } = req.params;

    const requisito = await Requisito.findByPk(id, {
      include: [
        {
          model: CategoriaMantenimiento,
          as: 'categorias',
          attributes: ['id', 'nombre', 'descripcion', 'color', 'icono'],
          through: { 
            attributes: ['created_at', 'active']
          }
        },
        // ✅ NUEVO: Incluir dependencia
        {
          model: Dependencia,
          as: 'dependencia',
          attributes: ['id', 'nombre', 'descripcion']
        }
      ]
    });

    if (!requisito) {
      return res.status(404).json({ 
        error: 'Requisito no encontrado' 
      });
    }

    res.status(200).json(requisito);
  } catch (error) {
    next(error);
  }
},

  // Crear requisito
async create(req, res, next) {
  try {
    const {
      nombre,
      descripcion,
      id_dependencia,
      activo,
      categorias
    } = req.body;

    // Validar nombre único
    const requisitoExistente = await Requisito.findOne({
      where: { nombre }
    });

    if (requisitoExistente) {
      return res.status(409).json({ 
        error: 'Ya existe un requisito con ese nombre' 
      });
    }

    // ✅ Validar que la dependencia exista
    if (id_dependencia) {
      const dependencia = await Dependencia.findByPk(id_dependencia);
      if (!dependencia) {
        return res.status(400).json({ 
          error: 'La dependencia especificada no existe' 
        });
      }
    }

    // Crear requisito
    const nuevoRequisito = await Requisito.create({
      nombre,
      descripcion,
      id_dependencia,
      activo: activo !== undefined ? activo : true
    });

    // Asociar con categorías si se proporcionaron
    if (categorias && Array.isArray(categorias) && categorias.length > 0) {
      const asociaciones = categorias.map(categoria_id => ({
        requisito_id: nuevoRequisito.id,
        categoria_id
      }));

      await RequisitoCategoria.bulkCreate(asociaciones);
    }

    // Obtener requisito con relaciones
    const requisitoCreado = await Requisito.findByPk(nuevoRequisito.id, {
      include: [
        {
          model: CategoriaMantenimiento,
          as: 'categorias',
          attributes: ['id', 'nombre', 'descripcion', 'color', 'icono'],
          through: { attributes: [] }
        },
        // ✅ NUEVO: Incluir dependencia
        {
          model: Dependencia,
          as: 'dependencia',
          attributes: ['id', 'nombre', 'descripcion']
        }
      ]
    });

    res.status(201).json(requisitoCreado);
  } catch (error) {
    next(error);
  }
},

  async update(req, res, next) {
  try {
    const { id } = req.params;
    const {
      nombre,
      descripcion,
      id_dependencia,
      activo,
      categorias
    } = req.body;

    const requisito = await Requisito.findByPk(id);
    if (!requisito) {
      return res.status(404).json({ 
        error: 'Requisito no encontrado' 
      });
    }

    if (nombre && nombre !== requisito.nombre) {
      const nombreExistente = await Requisito.findOne({
        where: { 
          nombre,
          id: { [Op.ne]: id }
        }
      });

      if (nombreExistente) {
        return res.status(409).json({ 
          error: 'El nombre ya está en uso por otro requisito' 
        });
      }
    }

    // ✅ Validar dependencia si se proporciona
    if (id_dependencia) {
      const dependencia = await Dependencia.findByPk(id_dependencia);
      if (!dependencia) {
        return res.status(400).json({ 
          error: 'La dependencia especificada no existe' 
        });
      }
    }

    // Preparar datos para actualizar
    const datosActualizacion = {};
    if (nombre !== undefined) datosActualizacion.nombre = nombre;
    if (descripcion !== undefined) datosActualizacion.descripcion = descripcion;
    if (id_dependencia !== undefined) datosActualizacion.id_dependencia = id_dependencia;
    if (activo !== undefined) datosActualizacion.activo = activo;

    await requisito.update(datosActualizacion);

    // Actualizar categorías si se proporcionaron
    if (categorias && Array.isArray(categorias)) {
      await RequisitoCategoria.destroy({
        where: { requisito_id: id }
      });

      if (categorias.length > 0) {
        const asociaciones = categorias.map(categoria_id => ({
          requisito_id: id,
          categoria_id
        }));

        await RequisitoCategoria.bulkCreate(asociaciones);
      }
    }

    // Obtener requisito actualizado con relaciones
    const requisitoActualizado = await Requisito.findByPk(id, {
      include: [
        {
          model: CategoriaMantenimiento,
          as: 'categorias',
          attributes: ['id', 'nombre', 'descripcion', 'color', 'icono'],
          through: { attributes: [] }
        },
        // ✅ NUEVO: Incluir dependencia
        {
          model: Dependencia,
          as: 'dependencia',
          attributes: ['id', 'nombre', 'descripcion']
        }
      ]
    });

    res.status(200).json(requisitoActualizado);
  } catch (error) {
    next(error);
  }
},

// ✅ ACTUALIZAR getByCategoriaId
async getByCategoriaId(req, res, next) {
  try {
    const { categoriaId } = req.params;
    const { activo } = req.query;

    const whereCondition = {};
    if (activo !== undefined) {
      whereCondition.activo = activo === 'true';
    }

    const requisitos = await Requisito.findAll({
      where: whereCondition,
      include: [
        {
          model: CategoriaMantenimiento,
          as: 'categorias',
          where: { id: categoriaId },
          attributes: ['id', 'nombre', 'descripcion', 'color', 'icono'],
          through: { 
            attributes: [],
            where: { active: true }
          }
        },
        // ✅ NUEVO: Incluir dependencia
        {
          model: Dependencia,
          as: 'dependencia',
          attributes: ['id', 'nombre', 'descripcion']
        }
      ],
      order: [['nombre', 'ASC']]
    });

    res.status(200).json(requisitos);
  } catch (error) {
    next(error);
  }
},

  // Eliminar requisito (soft delete)
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      const requisito = await Requisito.findByPk(id);
      if (!requisito) {
        return res.status(404).json({ 
          error: 'Requisito no encontrado' 
        });
      }

      // Soft delete - marcar como inactivo
      await requisito.update({ activo: false });

      // También desactivar las relaciones con categorías
      await RequisitoCategoria.update(
        { active: false },
        { where: { requisito_id: id } }
      );

      res.status(200).json({ 
        message: 'Requisito desactivado exitosamente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  },

  // Eliminar permanentemente
  async deletePermanent(req, res, next) {
    try {
      const { id } = req.params;

      const requisito = await Requisito.findByPk(id);
      if (!requisito) {
        return res.status(404).json({ 
          error: 'Requisito no encontrado' 
        });
      }

      // Eliminar asociaciones
      await RequisitoCategoria.destroy({
        where: { requisito_id: id }
      });

      // Eliminar requisito
      await requisito.destroy();

      res.status(200).json({ 
        message: 'Requisito eliminado permanentemente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  },

 
  // Asociar requisito con categorías
  async asociarCategorias(req, res, next) {
    try {
      const { id } = req.params;
      const { categorias } = req.body; // Array de IDs

      if (!Array.isArray(categorias) || categorias.length === 0) {
        return res.status(400).json({ 
          error: 'Debe proporcionar un array de categorías' 
        });
      }

      const requisito = await Requisito.findByPk(id);
      if (!requisito) {
        return res.status(404).json({ 
          error: 'Requisito no encontrado' 
        });
      }

      // Verificar que todas las categorías existen
      const categoriasExistentes = await CategoriaMantenimiento.findAll({
        where: { id: { [Op.in]: categorias } }
      });

      if (categoriasExistentes.length !== categorias.length) {
        return res.status(400).json({ 
          error: 'Una o más categorías no existen' 
        });
      }

      // Crear asociaciones (evitar duplicados)
      const asociaciones = categorias.map(categoria_id => ({
        requisito_id: id,
        categoria_id
      }));

      await RequisitoCategoria.bulkCreate(asociaciones, {
        ignoreDuplicates: true
      });

      // Obtener requisito actualizado
      const requisitoActualizado = await Requisito.findByPk(id, {
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categorias',
            attributes: ['id', 'nombre', 'descripcion', 'color', 'icono'],
            through: { attributes: [] }
          }
        ]
      });

      res.status(200).json(requisitoActualizado);
    } catch (error) {
      next(error);
    }
  },

  // Desasociar requisito de categorías
  async desasociarCategorias(req, res, next) {
    try {
      const { id } = req.params;
      const { categorias } = req.body; // Array de IDs

      if (!Array.isArray(categorias) || categorias.length === 0) {
        return res.status(400).json({ 
          error: 'Debe proporcionar un array de categorías' 
        });
      }

      const requisito = await Requisito.findByPk(id);
      if (!requisito) {
        return res.status(404).json({ 
          error: 'Requisito no encontrado' 
        });
      }

      // Eliminar asociaciones
      await RequisitoCategoria.destroy({
        where: {
          requisito_id: id,
          categoria_id: { [Op.in]: categorias }
        }
      });

      // Obtener requisito actualizado
      const requisitoActualizado = await Requisito.findByPk(id, {
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categorias',
            attributes: ['id', 'nombre', 'descripcion', 'color', 'icono'],
            through: { attributes: [] }
          }
        ]
      });

      res.status(200).json(requisitoActualizado);
    } catch (error) {
      next(error);
    }
  },

  // Obtener estadísticas
  async getEstadisticas(req, res, next) {
    try {
      const [total, activos, inactivos] = await Promise.all([
        Requisito.count(),
        Requisito.count({ where: { activo: true } }),
        Requisito.count({ where: { activo: false } })
      ]);

      // Contar requisitos por categoría
      const porCategoria = await RequisitoCategoria.findAll({
        attributes: [
          'categoria_id',
          [sequelize.fn('COUNT', sequelize.col('requisito_id')), 'total']
        ],
        where: { active: true },
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre']
          }
        ],
        group: ['categoria_id'],
        raw: true
      });

      res.status(200).json({
        total,
        activos,
        inactivos,
        por_categoria: porCategoria
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = requisitosController;