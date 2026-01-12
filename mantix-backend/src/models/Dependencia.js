// ============================================
// models/Dependencia.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const Dependencia = sequelize.define('Dependencia', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nombre: {
      type: DataTypes.STRING(45),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.STRING(45),
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
    }
  }, {
    tableName: 'dependencia',
    timestamps: false
  });

  Dependencia.associate = (models) => {
    // Relación con requisitos
    Dependencia.hasMany(models.Requisito, {
      foreignKey: 'id_dependencia',
      as: 'requisitos'
    });
  };

  return Dependencia;
};