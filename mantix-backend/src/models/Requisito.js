// ============================================
// models/Requisito.js - ACTUALIZADO
// ============================================
module.exports = (sequelize, DataTypes) => {
  const Requisito = sequelize.define('Requisito', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nombre: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fecha_creacion: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'fecha_creacion'
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    id_dependencia: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'id_dependencia'
    }
  }, {
    tableName: 'requisitos',
    timestamps: false
  });

  Requisito.associate = (models) => {
    // Relación con categorías (muchos a muchos)
    Requisito.belongsToMany(models.CategoriaMantenimiento, {
      through: models.RequisitoCategoria,
      foreignKey: 'requisito_id',
      otherKey: 'categoria_id',
      as: 'categorias'
    });

    // Relación con la tabla intermedia
    Requisito.hasMany(models.RequisitoCategoria, {
      foreignKey: 'requisito_id',
      as: 'requisito_categorias'
    });

    // ✅ NUEVA: Relación con Dependencia
    Requisito.belongsTo(models.Dependencia, {
      foreignKey: 'id_dependencia',
      as: 'dependencia'
    });
  };

  return Requisito;
};