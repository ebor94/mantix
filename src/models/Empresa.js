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
  };

  return Empresa;
};