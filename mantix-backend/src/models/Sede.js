// ============================================
// src/models/Sede.js
// ============================================
/**
 * @swagger
 * components:
 *   schemas:
 *     Sede:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         codigo:
 *           type: string
 *           example: "SED001"
 *         nombre:
 *           type: string
 *           example: "Sede Principal"
 *         direccion:
 *           type: string
 *           example: "Calle 123 #45-67"
 *         ciudad:
 *           type: string
 *           example: "Cúcuta"
 *         telefono:
 *           type: string
 *           example: "+573001234567"
 *         responsable_id:
 *           type: integer
 *           example: 2
 *         activo:
 *           type: boolean
 *           example: true
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
 *             telefono:
 *               type: string
 *               example: "+573001234567"
 *             rol:
 *               type: object
 *               properties:
 *                 nombre:
 *                   type: string
 *                   example: "Administrador"
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
  const Sede = sequelize.define('Sede', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    codigo: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    direccion: {
      type: DataTypes.TEXT
    },
    ciudad: {
      type: DataTypes.STRING(100)
    },
    telefono: {
      type: DataTypes.STRING(20)
    },
    responsable_id: {
      type: DataTypes.INTEGER
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'sedes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Sede.associate = (models) => {
    Sede.belongsTo(models.Usuario, {
      foreignKey: 'responsable_id',
      as: 'responsable'
    });
    
    Sede.hasMany(models.Equipo, {
      foreignKey: 'sede_id',
      as: 'equipos'
    });

    // Votaciones
    if (models.VotacionVotante) {
      Sede.hasMany(models.VotacionVotante, { foreignKey: 'sede_id', as: 'votacion_votantes' });
    }
    if (models.VotacionCandidato) {
      Sede.hasMany(models.VotacionCandidato, { foreignKey: 'sede_id', as: 'votacion_candidatos' });
    }
  };

  return Sede;
};