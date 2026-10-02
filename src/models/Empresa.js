// ============================================
// src/models/Empresa.js - Modelo de Empresas
// ============================================

module.exports = (sequelize, DataTypes) => {
  const Empresa = sequelize.define('Empresa', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    nit: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    nombre: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 1
    },
    rangoAfiliados: {
      type: DataTypes.ENUM('R7', 'R15'),
      allowNull: true,
      field: 'rango_afiliados'
    },
    vigenciaInicio: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'vigencia_inicio'
    },
    vigenciaCierre: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'vigencia_cierre'
    },
    slug: {
      type: DataTypes.STRING(80),
      allowNull: true,
      unique: true
    },
    asesorId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'asesor_id',
      references: { model: 'usuarios', key: 'id' }
    },
    publicoActivo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 0,
      field: 'publico_activo'
    },
  }, {
    tableName: 'empresas',
    timestamps: true
  });

  Empresa.associate = function(models) {
    // Una empresa puede tener muchos afiliados
    Empresa.hasMany(models.Afiliado, {
      as: 'afiliados',
      foreignKey: 'empresaId',
      onDelete: 'SET NULL'
    });

    Empresa.hasMany(models.EmpresaPlan, {
      as: 'planes',
      foreignKey: 'empresaId',
      onDelete: 'CASCADE'
    });

    // Asesor responsable del registro público de la empresa (canal C)
    Empresa.belongsTo(models.Usuario, { as: 'asesor', foreignKey: 'asesorId' });
  };

  return Empresa;
};