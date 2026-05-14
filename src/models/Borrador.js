// ============================================
// src/models/Borrador.js - Borrador de afiliado
// ============================================
module.exports = (sequelize, DataTypes) => {
  const Borrador = sequelize.define('Borrador', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    asesorId: {
      type: DataTypes.INTEGER,   // INTEGER (sin UNSIGNED) para coincidir con usuarios.id
      allowNull: false,
      references: { model: 'usuarios', key: 'id' }
    },
    // Campos resumen para listado rápido (sin deserializar el JSON completo)
    nombreCompleto: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null
    },
    numeroDocumento: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null
    },
    canal: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: null
    },
    grupo: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null
    },
    // Datos completos del formulario serializados como JSON
    datos: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'borradores_afiliados',
    timestamps: true,
    indexes: [
      { fields: ['asesorId'] }
    ]
  });

  Borrador.associate = function (models) {
    Borrador.belongsTo(models.Usuario, {
      as: 'asesor',
      foreignKey: 'asesorId'
    });
  };

  return Borrador;
};
