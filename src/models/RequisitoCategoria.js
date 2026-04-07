// ============================================
// models/RequisitoCategoria.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const RequisitoCategoria = sequelize.define('RequisitoCategoria', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    requisito_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'requisito_id'
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'categoria_id'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'active'
    }
  }, {
    tableName: 'requisito_categorias',
    timestamps: false
  });

  RequisitoCategoria.associate = (models) => {
    RequisitoCategoria.belongsTo(models.Requisito, {
      foreignKey: 'requisito_id',
      as: 'requisito'
    });

    RequisitoCategoria.belongsTo(models.CategoriaMantenimiento, {
      foreignKey: 'categoria_id',
      as: 'categoria'
    });
  };

  return RequisitoCategoria;
};