module.exports = (sequelize, DataTypes) => {
  const CymMantenimiento = sequelize.define('CymMantenimiento', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    predio_id:     { type: DataTypes.INTEGER, allowNull: false },
    contrato_id:   { type: DataTypes.INTEGER, allowNull: false },
    supervisor_id: { type: DataTypes.INTEGER, allowNull: false },
    operario_id:    { type: DataTypes.INTEGER },
    operario2_id:   { type: DataTypes.INTEGER },
    ejecutado_por:  { type: DataTypes.ENUM('pareja','operario1','operario2') },
    fecha_mant:     { type: DataTypes.DATEONLY, allowNull: false },
    observaciones:  { type: DataTypes.TEXT },
    estado:         { type: DataTypes.ENUM('borrador','completado'), defaultValue: 'borrador' }
  }, {
    tableName: 'cym_mantenimientos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  CymMantenimiento.associate = (models) => {
    CymMantenimiento.belongsTo(models.CymPredio,   { foreignKey: 'predio_id',     as: 'predio' });
    CymMantenimiento.belongsTo(models.CymContrato, { foreignKey: 'contrato_id',   as: 'contrato' });
    CymMantenimiento.belongsTo(models.Usuario,     { foreignKey: 'supervisor_id', as: 'supervisor' });
    CymMantenimiento.belongsTo(models.Usuario,     { foreignKey: 'operario_id',   as: 'operario' });
    CymMantenimiento.belongsTo(models.Usuario,     { foreignKey: 'operario2_id',  as: 'operario2' });
    CymMantenimiento.hasMany(models.CymChecklist,  { foreignKey: 'mantenimiento_id', as: 'checklist' });
    CymMantenimiento.hasMany(models.CymEvidencia,  { foreignKey: 'mantenimiento_id', as: 'evidencias' });
  };

  return CymMantenimiento;
};
