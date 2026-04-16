// ============================================
// src/models/Trazabilidad.js - Auditoría de acciones sobre afiliados
// ============================================

module.exports = (sequelize, DataTypes) => {
  const Trazabilidad = sequelize.define('Trazabilidad', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    afiliadoId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    tipo: {
      type: DataTypes.ENUM(
        'CONSULTA',
        'ACTUALIZACION_BENEFICIARIOS',
        'ACTUALIZACION_DATOS',
        'RECHAZO_PARCIAL',
        'APROBACION',
        'RECHAZO_TOTAL'
      ),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    usuarioId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: 'NULL = acción pública sin sesión'
    }
  }, {
    tableName: 'trazabilidad',
    timestamps: true,
    updatedAt: false  // registro inmutable — solo createdAt
  });

  Trazabilidad.associate = (models) => {
    Trazabilidad.belongsTo(models.Afiliado, { as: 'afiliado', foreignKey: 'afiliadoId' });
    Trazabilidad.belongsTo(models.Usuario,  { as: 'usuario',  foreignKey: 'usuarioId'  });
  };

  return Trazabilidad;
};
