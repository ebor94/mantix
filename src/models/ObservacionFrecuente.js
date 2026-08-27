// ============================================
// src/models/ObservacionFrecuente.js
// Observaciones predeterminadas que el asesor puede insertar con un clic en el
// campo de observaciones del registro. Autogestionables por un administrador.
// ============================================
module.exports = (sequelize, DataTypes) => {
  const ObservacionFrecuente = sequelize.define('ObservacionFrecuente', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    texto: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    activo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    orden: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Orden de aparición de los chips (asc)'
    }
  }, {
    tableName: 'observaciones_frecuentes',
    timestamps: true
  });

  return ObservacionFrecuente;
};
