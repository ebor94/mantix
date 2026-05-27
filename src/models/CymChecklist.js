module.exports = (sequelize, DataTypes) => {
  const CymChecklist = sequelize.define('CymChecklist', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    mantenimiento_id: { type: DataTypes.INTEGER, allowNull: false },
    actividad_id:     { type: DataTypes.INTEGER, allowNull: false },
    realizado:        { type: DataTypes.BOOLEAN, defaultValue: false },
    observacion:      { type: DataTypes.STRING(500) }
  }, {
    tableName: 'cym_checklist',
    timestamps: false
  });

  CymChecklist.associate = (models) => {
    CymChecklist.belongsTo(models.CymMantenimiento, { foreignKey: 'mantenimiento_id', as: 'mantenimiento' });
    CymChecklist.belongsTo(models.CymActividad,     { foreignKey: 'actividad_id',     as: 'actividad' });
  };

  return CymChecklist;
};
