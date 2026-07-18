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
    sede_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Sede a la que pertenece el usuario. Usado para acotar el cuadre de caja del cajero a su sede.'
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
    id_identidad: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'FK opcional a org_identidad (SSO compartido). Permite resolver este usuario desde un token de identidad.'
    },
    es_super_admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Indica si el usuario tiene acceso total al sistema sin restricciones'
    },
    prefijo_recibo: {
      type: DataTypes.STRING(10),
      allowNull: true,
      unique: true,
      comment: 'Prefijo único para numerar recibos de caja del asesor (ej. MP para María Pérez)'
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

  /**
   * Verifica si el usuario tiene permiso sobre una categoría específica
   * @param {number} categoriaId - ID de la categoría
   * @returns {Promise<boolean>}
   */
  Usuario.prototype.tieneAccesoCategoria = async function(categoriaId) {
    if (this.es_super_admin) {
      return true;
    }

    const UsuarioCategoria = sequelize.models.UsuarioCategoria;
    const permiso = await UsuarioCategoria.findOne({
      where: {
        usuario_id: this.id,
        categoria_id: categoriaId
      }
    });

    return permiso !== null;
  };

  /**
   * Obtiene todas las categorías a las que el usuario tiene acceso
   * @returns {Promise<Array>}
   */
  Usuario.prototype.obtenerCategoriasPermitidas = async function() {
    if (this.es_super_admin) {
      const CategoriaMantenimiento = sequelize.models.CategoriaMantenimiento;
      return await CategoriaMantenimiento.findAll({
        where: { activo: true }
      });
    }

    const UsuarioCategoria = sequelize.models.UsuarioCategoria;
    const CategoriaMantenimiento = sequelize.models.CategoriaMantenimiento;
    
    const categoriasPermitidas = await UsuarioCategoria.findAll({
      where: { usuario_id: this.id },
      include: [{
        model: CategoriaMantenimiento,
        as: 'categoria',
        where: { activo: true }
      }]
    });

    return categoriasPermitidas.map(uc => uc.categoria);
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
    // Nota: NO se define belongsTo(Sede) por sede_id para evitar un ciclo
    // Usuario↔Sede que dispara _syncModelsWithCyclicReferences en el arranque.
    // El filtro del cuadre usa la columna asesor.sede_id directamente.
    
    Usuario.hasMany(models.Notificacion, {
      foreignKey: 'usuario_id',
      as: 'notificaciones'
    });

    // Relación con categorías permitidas - USAR STRING 'UsuarioCategoria'
    Usuario.belongsToMany(models.CategoriaMantenimiento, {
      through: 'UsuarioCategoria', // ← IMPORTANTE: usar string, no models.UsuarioCategoria
      foreignKey: 'usuario_id',
      otherKey: 'categoria_id',
      as: 'categorias_permitidas'
    });

    Usuario.hasMany(models.UsuarioCategoria, {
      foreignKey: 'usuario_id',
      as: 'usuario_categorias'
    });
  };

  return Usuario;
};