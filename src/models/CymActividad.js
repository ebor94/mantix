module.exports = (sequelize, DataTypes) => {
  const CymActividad = sequelize.define('CymActividad', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre:      { type: DataTypes.STRING(200), allowNull: false },
    descripcion: { type: DataTypes.STRING(500) },
    orden:       { type: DataTypes.INTEGER, defaultValue: 0 },
    activo:      { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'cym_actividades',
    timestamps: false
  });

  CymActividad.associate = (models) => {
    CymActividad.hasMany(models.CymChecklist, { foreignKey: 'actividad_id', as: 'checklist_items' });
  };

  return CymActividad;
};
