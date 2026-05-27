// ============================================
// src/models/ContactoProveedor.js
// ============================================

module.exports = (sequelize, DataTypes) => {
  const ContactoProveedor = sequelize.define('ContactoProveedor', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    proveedor_id: { // Clave foránea que enlaza con la tabla de proveedores
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'proveedores', // nombre de la tabla
        key: 'id'
      }
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    cargo: { // Columna opcional que sugerí en el modelo SQL
      type: DataTypes.STRING(100),
      allowNull: true
    },
    telefono: {
      type: DataTypes.STRING(20),
      allowNull: true // Puede ser nulo si solo tienen email
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'contactos_proveedores', // Usa el nombre que definiste en SQL
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  // Establecer las asociaciones
  ContactoProveedor.associate = (models) => {
    // Relación MUCHOS a UNO: Un Contacto pertenece a UN Proveedor
    ContactoProveedor.belongsTo(models.Proveedor, {
      foreignKey: 'proveedor_id',
      as: 'proveedor'
    });
  };

  return ContactoProveedor;
};