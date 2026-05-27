// ============================================
// src/models/UsuarioCategoria.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const UsuarioCategoria = sequelize.define('UsuarioCategoria', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'usuario_categorias',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['usuario_id', 'categoria_id'],
        name: 'unique_usuario_categoria'
      }
    ]
  });

  UsuarioCategoria.associate = (models) => {
    UsuarioCategoria.belongsTo(models.Usuario, {
      foreignKey: 'usuario_id',
      as: 'usuario'
    });
    
    UsuarioCategoria.belongsTo(models.CategoriaMantenimiento, {
      foreignKey: 'categoria_id',
      as: 'categoria'
    });
  };

  return UsuarioCategoria;
};