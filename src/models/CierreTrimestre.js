// =============================================================
// src/models/CierreTrimestre.js
// Análisis oficial del cierre de cada trimestre (uno por año+trimestre).
// Firmado con el último usuario que lo editó + fecha (updated_at).
// =============================================================
module.exports = (sequelize, DataTypes) => {
  const CierreTrimestre = sequelize.define('CierreTrimestre', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    anio: { type: DataTypes.INTEGER, allowNull: false },
    trimestre: { type: DataTypes.TINYINT, allowNull: false },
    analisis: { type: DataTypes.TEXT, allowNull: false },
    cumplimiento_registrado: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    tableName: 'cierres_trimestre',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['anio', 'trimestre'], name: 'uk_cierre_anio_trimestre' }
    ]
  });

  CierreTrimestre.associate = (models) => {
    CierreTrimestre.belongsTo(models.Usuario, {
      foreignKey: 'usuario_id',
      as: 'usuario'
    });
  };

  return CierreTrimestre;
};
