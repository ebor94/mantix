module.exports = (sequelize, DataTypes) => {
  const CymAsignacion = sequelize.define('CymAsignacion', {
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    predio_id:      { type: DataTypes.INTEGER, allowNull: false },
    coordinador_id: { type: DataTypes.INTEGER },
    supervisor_id:  { type: DataTypes.INTEGER },
    operario_id:    { type: DataTypes.INTEGER },
    operario2_id:   { type: DataTypes.INTEGER },
    aux_cartera_id: { type: DataTypes.INTEGER },
    activo:         { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'cym_asignaciones',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  CymAsignacion.associate = (models) => {
    CymAsignacion.belongsTo(models.CymPredio,  { foreignKey: 'predio_id',      as: 'predio' });
    CymAsignacion.belongsTo(models.Usuario,     { foreignKey: 'coordinador_id', as: 'coordinador' });
    CymAsignacion.belongsTo(models.Usuario,     { foreignKey: 'supervisor_id',  as: 'supervisor' });
    CymAsignacion.belongsTo(models.Usuario,     { foreignKey: 'operario_id',    as: 'operario' });
    CymAsignacion.belongsTo(models.Usuario,     { foreignKey: 'operario2_id',   as: 'operario2' });
    CymAsignacion.belongsTo(models.Usuario,     { foreignKey: 'aux_cartera_id', as: 'aux_cartera' });
  };

  return CymAsignacion;
};
