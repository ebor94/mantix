// ============================================
// src/models/Proveedor.js
// ============================================

module.exports = (sequelize, DataTypes) => {
  const Proveedor = sequelize.define('Proveedor', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nombre: {
      type: DataTypes.STRING(150),
      allowNull: false,
      comment: 'Nombre comercial o razón social'
    },
    razon_social: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    nit: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true // El NIT/RUC/ID debe ser único
    },
    especialidad: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    periodicidad_contractual: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Ej: Anual, Mensual, Por Evento'
    },
    observaciones: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'proveedores',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  // Establecer las asociaciones
  Proveedor.associate = (models) => {
    // Relación UNO a MUCHOS: Un Proveedor tiene muchos Contactos
    Proveedor.hasMany(models.ContactoProveedor, {
      foreignKey: 'proveedor_id',
      as: 'contactos'
    });
    
    // Aquí puedes añadir otras relaciones, como con la tabla de Mantenimientos o Servicios
    // Proveedor.hasMany(models.Mantenimiento, { ... });
  };

  return Proveedor;
};