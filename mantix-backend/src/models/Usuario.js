// ============================================
// src/models/Usuario.js
// ============================================
const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const Usuario = sequelize.define('Usuario', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    rol_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    apellido: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    telefono: {
      type: DataTypes.STRING(20)
    },
    avatar: {
      type: DataTypes.STRING(255)
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    ultimo_acceso: {
      type: DataTypes.DATE
    }
  }, {
    tableName: 'usuarios',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (usuario) => {
        if (usuario.password) {
          usuario.password = await bcrypt.hash(usuario.password, 10);
        }
      },
      beforeUpdate: async (usuario) => {
        if (usuario.changed('password')) {
          usuario.password = await bcrypt.hash(usuario.password, 10);
        }
      }
    }
  });

  Usuario.prototype.validarPassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  Usuario.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    delete values.password;
    return values;
  };

  Usuario.associate = (models) => {
    Usuario.belongsTo(models.Rol, {
      foreignKey: 'rol_id',
      as: 'rol'
    });
    
    Usuario.hasMany(models.Sede, {
      foreignKey: 'responsable_id',
      as: 'sedes_responsable'
    });
    
    Usuario.hasMany(models.Notificacion, {
      foreignKey: 'usuario_id',
      as: 'notificaciones'
    });
  };

  return Usuario;
};