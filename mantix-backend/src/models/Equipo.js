// ============================================
// src/models/Equipo.js
// ============================================
/**
 * @swagger
 * components:
 *   schemas:
 *     Equipo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         codigo:
 *           type: string
 *           example: "EQ-001"
 *         nombre:
 *           type: string
 *           example: "Compresor de Aire Industrial"
 *         categoria_id:
 *           type: integer
 *           example: 1
 *         sede_id:
 *           type: integer
 *           example: 1
 *         marca:
 *           type: string
 *           example: "Atlas Copco"
 *         modelo:
 *           type: string
 *           example: "GA 55"
 *         numero_serie:
 *           type: string
 *           example: "AC123456789"
 *         ubicacion_especifica:
 *           type: string
 *           example: "Sala de compresores, Planta 2"
 *         fecha_instalacion:
 *           type: string
 *           format: date
 *           example: "2023-01-15"
 *         fecha_compra:
 *           type: string
 *           format: date
 *           example: "2022-12-01"
 *         valor_compra:
 *           type: number
 *           format: decimal
 *           example: 45000000.00
 *         vida_util_anos:
 *           type: integer
 *           example: 10
 *         responsable_id:
 *           type: integer
 *           example: 2
 *         estado:
 *           type: string
 *           enum: [operativo, fuera_servicio, en_mantenimiento, dado_baja]
 *           example: "operativo"
 *         observaciones:
 *           type: string
 *           example: "Equipo requiere mantenimiento preventivo cada 500 horas"
 *         activo:
 *           type: boolean
 *           example: true
 *         categoria:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             nombre:
 *               type: string
 *               example: "Equipos Industriales"
 *             descripcion:
 *               type: string
 *               example: "Maquinaria y equipos de producción industrial"
 *         sede:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             codigo:
 *               type: string
 *               example: "SED001"
 *             nombre:
 *               type: string
 *               example: "Sede Principal"
 *             ciudad:
 *               type: string
 *               example: "Cúcuta"
 *         responsable:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 2
 *             nombre:
 *               type: string
 *               example: "Juan"
 *             apellido:
 *               type: string
 *               example: "Pérez"
 *             email:
 *               type: string
 *               example: "juan.perez@example.com"
 *             rol:
 *               type: object
 *               properties:
 *                 nombre:
 *                   type: string
 *                   example: "Técnico"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-08T12:00:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-08T12:00:00.000Z"
 */
module.exports = (sequelize, DataTypes) => {
  const Equipo = sequelize.define('Equipo', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    codigo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    nombre: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sede_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    marca: {
      type: DataTypes.STRING(100)
    },
    modelo: {
      type: DataTypes.STRING(100)
    },
    numero_serie: {
      type: DataTypes.STRING(100)
    },
    ubicacion_especifica: {
      type: DataTypes.TEXT
    },
    fecha_instalacion: {
      type: DataTypes.DATEONLY
    },
    fecha_compra: {
      type: DataTypes.DATEONLY
    },
    valor_compra: {
      type: DataTypes.DECIMAL(12, 2)
    },
    vida_util_anos: {
      type: DataTypes.INTEGER
    },
    responsable_id: {
      type: DataTypes.INTEGER
    },
    estado: {
      type: DataTypes.ENUM('operativo', 'fuera_servicio', 'en_mantenimiento', 'dado_baja'),
      defaultValue: 'operativo'
    },
    observaciones: {
      type: DataTypes.TEXT
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'equipos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Equipo.associate = (models) => {
    Equipo.belongsTo(models.CategoriaMantenimiento, {
      foreignKey: 'categoria_id',
      as: 'categoria'
    });
    
    Equipo.belongsTo(models.Sede, {
      foreignKey: 'sede_id',
      as: 'sede'
    });
    
    Equipo.belongsTo(models.Usuario, {
      foreignKey: 'responsable_id',
      as: 'responsable'
    });
    
    // Only associate with EquipoDocumento if it exists
    // Equipo.hasMany(models.EquipoDocumento, {
    //   foreignKey: 'equipo_id',
    //   as: 'documentos'
    // });
  };

  return Equipo;
};