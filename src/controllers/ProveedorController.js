// ============================================
// src/controllers/ProveedorController.js
// ============================================
const db = require('../models'); // Asegúrate de que esta ruta sea correcta
// Desestructuramos los modelos principales y la instancia de Sequelize para transacciones
const { Proveedor, ContactoProveedor, sequelize } = db; 

// Nota: Hemos eliminado toda la lógica de 'req.usuario' y permisos (es_super_admin)
// para mantener el controlador centrado solo en la gestión de Proveedores y Contactos.

const proveedoresController = {
    
    // [GET] Listar todos los proveedores
    async getAll(req, res, next) {
        try {
            // Obtenemos todos los proveedores con su contacto principal (o el que aparezca primero)
            const proveedores = await Proveedor.findAll({
                include: [{
                    model: ContactoProveedor,
                    as: 'contactos',
                    attributes: ['id', 'nombre', 'telefono', 'email'],
                    where: { activo: true },
                    required: false, // LEFT JOIN (muestra proveedores incluso sin contactos)
                    limit: 1 // Sólo incluimos 1 contacto por proveedor para la lista
                }],
                // Usamos 'activo' del proveedor, no de los contactos
                where: { activo: true }, 
                order: [['nombre', 'ASC']]
            });

            res.status(200).json(proveedores);
        } catch (error) {
            next(error);
        }
    },

    // [GET] Obtener un proveedor por ID con TODOS sus contactos
    async getById(req, res, next) {
        try {
            const { id } = req.params;

            const proveedor = await Proveedor.findByPk(id, {
                include: [{
                    model: ContactoProveedor,
                    as: 'contactos',
                    // Incluimos contactos inactivos para gestión si es necesario, o filtramos: where: { activo: true }
                }]
            });

            if (!proveedor) {
                return res.status(404).json({ 
                    error: 'Proveedor no encontrado' 
                });
            }

            res.status(200).json(proveedor);
        } catch (error) {
            next(error);
        }
    },

    // [POST] Crear un nuevo proveedor y sus contactos (Transacción)
    async create(req, res, next) {
        const { contactos, ...proveedorData } = req.body;
        let transaction;

        try {
            // 1. Iniciar Transacción
            transaction = await sequelize.transaction();

            // 2. Crear el Proveedor
            const nuevoProveedor = await Proveedor.create(proveedorData, { transaction });

            // 3. Crear los Contactos asociados (si existen)
            if (contactos && Array.isArray(contactos) && contactos.length > 0) {
                const contactosConId = contactos.map(c => ({
                    ...c,
                    proveedor_id: nuevoProveedor.id // Asignamos el ID
                }));
                
                await ContactoProveedor.bulkCreate(contactosConId, { transaction });
            }

            // 4. Commit de la Transacción
            await transaction.commit();

            // 5. Devolver el proveedor completo
            const proveedorCreado = await Proveedor.findByPk(nuevoProveedor.id, {
                include: [{ model: ContactoProveedor, as: 'contactos' }]
            });

            res.status(201).json({
                message: 'Proveedor creado exitosamente.',
                proveedor: proveedorCreado
            });

        } catch (error) {
            if (transaction) await transaction.rollback(); // Rollback en caso de error

            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(409).json({ 
                    error: `El valor de ${error.fields ? Object.keys(error.fields)[0] : 'un campo'} ya está registrado. (Ej: NIT)`
                });
            }
            // Capturar errores de validación (por ejemplo, longitud de campo)
            if (error.name === 'SequelizeValidationError') {
                const errores = error.errors.map(err => ({ 
                    campo: err.path, 
                    mensaje: err.message 
                }));
                return res.status(400).json({ 
                    error: 'Error de validación de datos', 
                    errores 
                });
            }

            next(error);
        }
    },

    // [PUT] Actualizar un proveedor y gestionar sus contactos (Transacción)
    async update(req, res, next) {
        const { id } = req.params;
        const { contactos = [], ...proveedorData } = req.body;
        let transaction;

        try {
            transaction = await sequelize.transaction();

            // 1. Verificar si el proveedor existe
            const proveedor = await Proveedor.findByPk(id, { transaction });
            
            if (!proveedor) {
                await transaction.rollback();
                return res.status(404).json({ 
                    error: 'Proveedor no encontrado' 
                });
            }

            // 2. Actualizar los datos del Proveedor
            await proveedor.update(proveedorData, { transaction });

            // 3. Gestión de Contactos (Crear, Actualizar, Eliminar)
            
            // Obtener IDs actuales de contactos
            const contactosExistentes = await ContactoProveedor.findAll({ 
                where: { proveedor_id: id }, 
                attributes: ['id'],
                transaction 
            });
            const idsExistentes = contactosExistentes.map(c => c.id);
            const idsEnPayload = contactos.filter(c => c.id).map(c => c.id);
            
            // IDs a eliminar: los que están en la BD pero no en el nuevo array de 'contactos'
            const idsAEliminar = idsExistentes.filter(dbId => !idsEnPayload.includes(dbId));
            
            if (idsAEliminar.length > 0) {
                await ContactoProveedor.destroy({
                    where: { id: idsAEliminar },
                    transaction
                });
            }
            
            // Procesar contactos del payload
            for (const contacto of contactos) {
                if (contacto.id) {
                    // Actualizar contacto existente
                    await ContactoProveedor.update(contacto, {
                        where: { id: contacto.id, proveedor_id: id },
                        transaction
                    });
                } else {
                    // Crear nuevo contacto (no tiene ID)
                    await ContactoProveedor.create({
                        ...contacto,
                        proveedor_id: id
                    }, { transaction });
                }
            }
            
            // 4. Commit de la Transacción
            await transaction.commit();

            // 5. Devolver el proveedor actualizado
            const proveedorActualizado = await Proveedor.findByPk(id, {
                include: [{ model: ContactoProveedor, as: 'contactos' }]
            });

            res.status(200).json({
                message: 'Proveedor y contactos actualizados exitosamente.',
                proveedor: proveedorActualizado
            });

        } catch (error) {
            if (transaction) await transaction.rollback();
            if (error.name === 'SequelizeUniqueConstraintError') {
                 // Manejo de error si el NIT/Razón Social ya existe
                 return res.status(409).json({ 
                    error: `El valor de ${Object.keys(error.fields)[0]} ya está registrado.`
                });
            }
            next(error);
        }
    },

    // [DELETE] Eliminar un proveedor (Soft Delete: activo = false)
    async delete(req, res, next) {
        try {
            const { id } = req.params;

            // 1. Verificar que el proveedor existe
            const proveedor = await Proveedor.findByPk(id);
            
            if (!proveedor) {
                return res.status(404).json({ 
                    error: 'Proveedor no encontrado' 
                });
            }

            // 2. Realizar Soft Delete (cambiar estado activo a false)
            await proveedor.update({ activo: false });

            res.status(200).json({ 
                message: 'Proveedor desactivado exitosamente',
                id: parseInt(id)
            });
        } catch (error) {
            next(error);
        }
    },

    // --- Endpoints de gestión individual de contactos (Opcional, pero útil) ---

    // [POST] Añadir un contacto a un proveedor existente
    async addContact(req, res, next) {
        try {
            const { id } = req.params; // proveedor_id
            const contactoData = req.body;

            const proveedor = await Proveedor.findByPk(id);
            if (!proveedor) {
                return res.status(404).json({ error: 'Proveedor no encontrado.' });
            }

            const nuevoContacto = await ContactoProveedor.create({
                ...contactoData,
                proveedor_id: id
            });

            res.status(201).json({
                message: 'Contacto añadido exitosamente.',
                contacto: nuevoContacto
            });

        } catch (error) {
            next(error);
        }
    },

    // [DELETE] Eliminar un contacto específico
    async removeContact(req, res, next) {
        try {
            const { contactoId } = req.params;

            const contacto = await ContactoProveedor.findByPk(contactoId);
            
            if (!contacto) {
                return res.status(404).json({ error: 'Contacto no encontrado.' });
            }

            await contacto.destroy(); // Hard delete del contacto

            res.status(200).json({
                message: 'Contacto eliminado exitosamente.',
                id: parseInt(contactoId)
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = proveedoresController;